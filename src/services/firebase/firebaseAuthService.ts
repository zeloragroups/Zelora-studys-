import {
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseAuth } from '../../lib/firebase/auth';
import {
  deriveInternalAuthEmail,
  INTERNAL_AUTH_EMAIL_DOMAIN,
} from '../../lib/firebase/config';
import {
  getFirestoreDb,
  handleFirestoreError,
  OperationType,
} from '../../lib/firebase/firestore';
import type { IAuthService } from '../contracts/authService';
import { AuthServiceException } from '../local/localAuthService';
import type {
  AuthPrincipal,
  AuthSession,
  ForgotPasswordRequestResult,
  LoginCredentials,
  PasswordResetInitiation,
  PortalScope,
  UserRole,
} from '../../types';
import { BOOTSTRAPPED_ADMIN_EMAIL, clearAdminUidsCache } from './helpers';

const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

function emptyFirebaseSession(): AuthSession {
  return {
    principal: null,
    isAuthenticated: false,
    dataSourceMode: 'firebase_connected',
    lastVerifiedAtIso: null,
    expiresAtIso: null,
  };
}

function isValidRole(role: unknown): role is UserRole {
  return role === 'admin' || role === 'teacher' || role === 'student';
}

async function resolvePrincipalFromFirebaseUser(
  user: User
): Promise<AuthPrincipal | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  const email = (user.email ?? '').trim().toLowerCase();
  const usesGoogleProvider = user.providerData.some((p) => p.providerId === 'google.com');
  const isBootstrapOwner =
    email === BOOTSTRAPPED_ADMIN_EMAIL && user.emailVerified && usesGoogleProvider;

  if (isBootstrapOwner) {
    const adminRef = doc(db, 'admins', user.uid);
    const userRef = doc(db, 'users', user.uid);
    let adminSnap = await getDoc(adminRef).catch(() => null);
    let userSnap = await getDoc(userRef).catch(() => null);

    if (!adminSnap?.exists() || !userSnap?.exists()) {
      const nowIso = new Date().toISOString();
      await setDoc(
        adminRef,
        {
          uid: user.uid,
          accountId: 'ADM-0001',
          email,
          status: 'active',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      await setDoc(
        userRef,
        {
          uid: user.uid,
          accountId: 'ADM-0001',
          role: 'admin',
          name:
            user.displayName && user.displayName.trim().length >= 2
              ? user.displayName.trim().slice(0, 100)
              : 'Centre Administrator',
          phone: '',
          email,
          status: 'active',
          adminUids: [user.uid],
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      );
      await setDoc(
        doc(db, 'authIdMappings', 'ADM-0001'),
        {
          loginId: 'ADM-0001',
          uid: user.uid,
          authEmail: email,
          role: 'admin',
          status: 'active',
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        { merge: true }
      ).catch(() => undefined);
      clearAdminUidsCache();
      adminSnap = await getDoc(adminRef).catch(() => null);
      userSnap = await getDoc(userRef).catch(() => null);
    }

    const userData = userSnap?.data() as Record<string, unknown> | undefined;
    const adminData = adminSnap?.data() as Record<string, unknown> | undefined;
    if (adminData?.status === 'deactivated' || userData?.status === 'deactivated') {
      return {
        uid: user.uid,
        loginId: String(adminData?.accountId || 'ADM-0001'),
        role: 'admin',
        fullName: String(userData?.name || 'Centre Administrator'),
        status: 'deactivated',
      };
    }
    return {
      uid: user.uid,
      loginId: String(userData?.accountId || adminData?.accountId || 'ADM-0001'),
      role: 'admin',
      fullName: String(userData?.name || user.displayName || 'Centre Administrator'),
      status: 'active',
    };
  }

  try {
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (!userSnap.exists()) {
      const adminSnap = await getDoc(doc(db, 'admins', user.uid));
      if (!adminSnap.exists()) {
        return null;
      }
      const adminData = adminSnap.data();
      const expectedEmail = String(adminData.email || '').trim().toLowerCase();
      if (!usesGoogleProvider || !user.emailVerified || (expectedEmail && expectedEmail !== email)) {
        return null;
      }
      return {
        uid: user.uid,
        loginId: String(adminData.accountId || 'ADM-0001'),
        role: 'admin',
        fullName: user.displayName || 'Administrator',
        status: adminData.status === 'deactivated' ? 'deactivated' : 'active',
      };
    }

    const data = userSnap.data();
    if (!isValidRole(data.role)) {
      return null;
    }
    if (data.role === 'admin' && (!usesGoogleProvider || !user.emailVerified)) {
      return null;
    }

    return {
      uid: user.uid,
      loginId: String(data.accountId || '').toUpperCase(),
      role: data.role,
      fullName: String(data.name || user.displayName || 'Account User'),
      status: data.status === 'deactivated' ? 'deactivated' : 'active',
      sharedWithParent: data.sharedWithParent === true,
      enrolledBatchId: typeof data.batchId === 'string' && data.batchId ? data.batchId : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
  }
}

function buildAuthenticatedSession(principal: AuthPrincipal): AuthSession {
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  return {
    principal,
    isAuthenticated: true,
    dataSourceMode: 'firebase_connected',
    lastVerifiedAtIso: now.toISOString(),
    expiresAtIso: expires.toISOString(),
  };
}

function mapFirebaseAuthError(error: unknown): AuthServiceException {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return new AuthServiceException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid Account ID or password. Please verify your credentials.',
      field: 'form',
    });
  }
  if (code === 'auth/user-disabled') {
    return new AuthServiceException({
      code: 'INACTIVE_ACCOUNT',
      message: 'This account has been deactivated. Contact your centre administrator.',
      field: 'form',
    });
  }
  if (code === 'auth/too-many-requests') {
    return new AuthServiceException({
      code: 'UNEXPECTED_ERROR',
      message: 'Too many failed sign-in attempts. Please wait briefly before trying again.',
      field: 'form',
    });
  }
  if (code === 'auth/operation-not-allowed') {
    return new AuthServiceException({
      code: 'UNEXPECTED_ERROR',
      message:
        'Email/Password sign-in is not yet enabled in Firebase Authentication Console for project academy-0007. Enable Email/Password in Firebase Console -> Authentication -> Sign-in method, or sign in with Google as project operator.',
      field: 'form',
    });
  }
  if (code === 'auth/network-request-failed') {
    return new AuthServiceException({
      code: 'UNEXPECTED_ERROR',
      message: 'Network unavailable while contacting Firebase Authentication.',
      field: 'form',
    });
  }
  if (error instanceof AuthServiceException) {
    return error;
  }
  return new AuthServiceException({
    code: 'UNEXPECTED_ERROR',
    message:
      error instanceof Error
        ? error.message
        : 'Unable to complete authentication with Firebase.',
    field: 'form',
  });
}

export class FirebaseAuthService implements IAuthService {
  async getCurrentSession(): Promise<AuthSession> {
    const auth = getFirebaseAuth();
    if (!auth) {
      return emptyFirebaseSession();
    }

    const user =
      auth.currentUser ??
      (await new Promise<User | null>((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (resolved) => {
          unsubscribe();
          resolve(resolved);
        });
      }));

    if (!user) {
      return emptyFirebaseSession();
    }

    try {
      const principal = await resolvePrincipalFromFirebaseUser(user);
      if (!principal || principal.status !== 'active') {
        await firebaseSignOut(auth).catch(() => undefined);
        return emptyFirebaseSession();
      }
      return buildAuthenticatedSession(principal);
    } catch {
      return emptyFirebaseSession();
    }
  }

  subscribeToAuthState(callback: (session: AuthSession) => void): () => void {
    const auth = getFirebaseAuth();
    if (!auth) {
      callback(emptyFirebaseSession());
      return () => undefined;
    }
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        callback(emptyFirebaseSession());
        return;
      }
      try {
        const principal = await resolvePrincipalFromFirebaseUser(user);
        if (!principal || principal.status !== 'active') {
          await firebaseSignOut(auth).catch(() => undefined);
          callback(emptyFirebaseSession());
          return;
        }
        callback(buildAuthenticatedSession(principal));
      } catch {
        callback(emptyFirebaseSession());
      }
    });
  }

  async signInWithId(credentials: LoginCredentials): Promise<AuthSession> {
    if (credentials.portalScope === 'admin_portal') {
      throw new AuthServiceException({
        code: 'PORTAL_ROLE_MISMATCH',
        message: 'Administrator access uses Google Sign-In only.',
        field: 'form',
      });
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      throw new AuthServiceException({
        code: 'UNEXPECTED_ERROR',
        message: 'Firebase Authentication is not configured.',
        field: 'form',
      });
    }

    const rawId = credentials.loginId.trim();
    const password = credentials.password;

    if (!rawId) {
      throw new AuthServiceException({
        code: 'EMPTY_ID',
        message: 'Please enter your Account ID.',
        field: 'loginId',
      });
    }
    if (!password) {
      throw new AuthServiceException({
        code: 'EMPTY_PASSWORD',
        message: 'Please enter your password.',
        field: 'password',
      });
    }

    const isEmailInput = rawId.includes('@');
    const authEmail = isEmailInput
      ? rawId.toLowerCase()
      : deriveInternalAuthEmail(rawId.toUpperCase());
    const isInternalDomainEmail = authEmail.endsWith(`@${INTERNAL_AUTH_EMAIL_DOMAIN}`);

    try {
      const cred = await signInWithEmailAndPassword(auth, authEmail, password);
      if (!isInternalDomainEmail && !cred.user.emailVerified) {
        await firebaseSignOut(auth).catch(() => undefined);
        throw new AuthServiceException({
          code: 'INVALID_CREDENTIALS',
          message:
            'This Firebase account email is not verified. Verify your email or sign in using your assigned Teacher/Student ID.',
          field: 'form',
        });
      }

      const principal = await resolvePrincipalFromFirebaseUser(cred.user);
      if (!principal) {
        await firebaseSignOut(auth).catch(() => undefined);
        throw new AuthServiceException({
          code: 'INVALID_ROLE',
          message:
            'This account is not linked to an active Teacher or Student profile. Contact your administrator.',
          field: 'form',
        });
      }

      if (principal.status === 'deactivated') {
        await firebaseSignOut(auth).catch(() => undefined);
        throw new AuthServiceException({
          code: 'INACTIVE_ACCOUNT',
          message: 'This account is deactivated. Please contact your administrator.',
          field: 'form',
        });
      }

      if (credentials.portalScope === 'member_portal' && principal.role === 'admin') {
        await firebaseSignOut(auth).catch(() => undefined);
        throw new AuthServiceException({
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid Account ID or password. Please verify your Teacher ID or Student ID.',
          field: 'form',
        });
      }

      return buildAuthenticatedSession(principal);
    } catch (error) {
      throw mapFirebaseAuthError(error);
    }
  }

  async signInAdminWithGoogle(): Promise<AuthSession> {
    const auth = getFirebaseAuth();
    if (!auth) {
      throw new AuthServiceException({
        code: 'UNEXPECTED_ERROR',
        message: 'Firebase Authentication is not configured.',
        field: 'form',
      });
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      const email = (cred.user.email ?? '').trim().toLowerCase();
      const usesGoogleProvider = cred.user.providerData.some(
        (p) => p.providerId === 'google.com'
      );
      const db = getFirestoreDb();
      let isAuthorizedAdmin =
        usesGoogleProvider &&
        cred.user.emailVerified === true &&
        email === BOOTSTRAPPED_ADMIN_EMAIL;

      if (!isAuthorizedAdmin && db && usesGoogleProvider && cred.user.emailVerified) {
        const adminSnap = await getDoc(doc(db, 'admins', cred.user.uid)).catch(() => null);
        if (adminSnap?.exists() && adminSnap.data()?.status === 'active') {
          const docEmail = String(adminSnap.data()?.email || '').trim().toLowerCase();
          if (!docEmail || docEmail === email) {
            isAuthorizedAdmin = true;
          }
        }
      }

      if (!isAuthorizedAdmin) {
        await firebaseSignOut(auth).catch(() => undefined);
        throw new AuthServiceException({
          code: 'PORTAL_ROLE_MISMATCH',
          message: `Access denied. Google account "${email || 'unknown'}" is not authorized for Admin access.`,
          field: 'form',
        });
      }

      const principal = await resolvePrincipalFromFirebaseUser(cred.user);
      if (!principal || principal.role !== 'admin' || principal.status !== 'active') {
        await firebaseSignOut(auth).catch(() => undefined);
        throw new AuthServiceException({
          code: 'INACTIVE_ACCOUNT',
          message: 'Access denied. Admin account is inactive or unauthorized.',
          field: 'form',
        });
      }
      return buildAuthenticatedSession(principal);
    } catch (error) {
      if (error instanceof AuthServiceException) throw error;
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code === 'auth/popup-closed-by-user') {
        throw new AuthServiceException({
          code: 'UNEXPECTED_ERROR',
          message: 'Google Sign-In window was closed before completing authentication.',
          field: 'form',
        });
      }
      if (code === 'auth/popup-blocked') {
        throw new AuthServiceException({
          code: 'UNEXPECTED_ERROR',
          message: 'Browser blocked the Google Sign-In popup. Please allow popups for this site and try again.',
          field: 'form',
        });
      }
      if (code === 'auth/unauthorized-domain') {
        throw new AuthServiceException({
          code: 'UNEXPECTED_ERROR',
          message: 'Current website domain is not listed under Firebase Authentication -> Authorized domains.',
          field: 'form',
        });
      }
      throw new AuthServiceException({
        code: 'UNEXPECTED_ERROR',
        message:
          error instanceof Error ? error.message : 'Google Sign-In was cancelled or failed.',
        field: 'form',
      });
    }
  }

  async signOut(): Promise<void> {
    const auth = getFirebaseAuth();
    if (auth) {
      await firebaseSignOut(auth);
    }
  }

  async changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user || !user.email) {
      throw new AuthServiceException({
        code: 'UNEXPECTED_ERROR',
        message: 'An active Firebase session is required to change your password.',
        field: 'form',
      });
    }
    const usesGoogleProvider = user.providerData.some((p) => p.providerId === 'google.com');
    if (usesGoogleProvider) {
      throw new AuthServiceException({
        code: 'UNEXPECTED_ERROR',
        message:
          'Google Sign-In Admin accounts manage their password directly through Google Account security settings.',
        field: 'form',
      });
    }
    if (!currentPassword) {
      throw new AuthServiceException({
        code: 'EMPTY_PASSWORD',
        message: 'Please enter your current password.',
        field: 'password',
      });
    }
    if (newPassword.length < 8) {
      throw new AuthServiceException({
        code: 'UNEXPECTED_ERROR',
        message: 'New password must be at least 8 characters long.',
        field: 'password',
      });
    }
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        throw new AuthServiceException({
          code: 'INCORRECT_PASSWORD',
          message: 'Current password is incorrect.',
          field: 'password',
        });
      }
      if (code === 'auth/weak-password') {
        throw new AuthServiceException({
          code: 'UNEXPECTED_ERROR',
          message: 'New password does not meet Firebase strength requirements (min 8 characters).',
          field: 'password',
        });
      }
      throw mapFirebaseAuthError(error);
    }
  }

  async requestForgotPassword(input: {
    loginId: string;
    portalScope: PortalScope;
  }): Promise<ForgotPasswordRequestResult> {
    if (!input.loginId.trim()) {
      throw new AuthServiceException({
        code: 'EMPTY_ID',
        message: 'Please enter your Account ID.',
        field: 'loginId',
      });
    }

    return {
      submitted: true,
      message:
        'If this Account ID is active, contact your centre administrator to trigger an Admin-mediated password reset.',
    };
  }

  isSessionExpired(session: AuthSession): boolean {
    if (!session.isAuthenticated || !session.expiresAtIso) {
      return true;
    }
    const expiry = Date.parse(session.expiresAtIso);
    return Number.isNaN(expiry) || Date.now() >= expiry;
  }

  async createAccountByAdmin(): Promise<{
    principal: AuthPrincipal;
    oneTimeSetupToken: string;
  }> {
    throw new Error('Use accountService.createTeacherAccount or createStudentAccount.');
  }

  async searchAccountsById(queryText: string): Promise<AuthPrincipal[]> {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('accountId', '==', queryText.trim().toUpperCase()),
        limit(5)
      )
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        loginId: String(data.accountId),
        role: data.role as UserRole,
        fullName: String(data.name),
        status: data.status === 'deactivated' ? 'deactivated' : 'active',
      };
    });
  }

  async deactivateAccount(): Promise<void> {
    throw new Error('Use accountService.deactivateAccount.');
  }

  async initiatePasswordReset(): Promise<PasswordResetInitiation> {
    throw new Error('Use accountService.initiatePasswordReset.');
  }
}

export const firebaseAuthService = new FirebaseAuthService();
