import type { IAuthService } from '../contracts/authService';
import type {
  AuthErrorCode,
  AuthOperationError,
  AuthPrincipal,
  AuthSession,
  ForgotPasswordRequestResult,
  LoginCredentials,
  PasswordResetInitiation,
  PortalScope,
  UserRole,
} from '../../types';
import { LocalAccountStore, sharedLocalAccountStore } from './localAccountStore';

/**
 * DEVELOPMENT-ONLY LOCAL AUTHENTICATION ADAPTER
 *
 * - Firebase Authentication is NOT connected yet.
 * - Reads accounts and non-plaintext verifiers from LocalAccountStore.
 * - Production builds (`isProductionMode: true` without explicit test override)
 *   will NOT silently fall back to demo credentials.
 */

const SESSION_STORAGE_KEY = 'tuition_ecosystem_dev_session_v1';
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 hours

export class AuthServiceException extends Error implements AuthOperationError {
  code: AuthErrorCode;
  field?: 'loginId' | 'password' | 'form';

  constructor(error: AuthOperationError) {
    super(error.message);
    this.name = 'AuthServiceException';
    this.code = error.code;
    this.field = error.field;
  }
}

interface StoredDevSessionPayload {
  principal: AuthPrincipal;
  lastVerifiedAtIso: string;
  expiresAtIso: string;
}

function getSafeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createEmptySession(): AuthSession {
  return {
    principal: null,
    isAuthenticated: false,
    dataSourceMode: 'local_demo_adapter',
    lastVerifiedAtIso: null,
    expiresAtIso: null,
  };
}

function isValidRole(role: unknown): role is UserRole {
  return role === 'admin' || role === 'teacher' || role === 'student';
}

export class LocalDevAuthService implements IAuthService {
  private memorySession: AuthSession | null = null;
  private readonly isProductionMode: boolean;
  private readonly store: LocalAccountStore;
  private readonly skipSessionStorage: boolean;

  constructor(options?: {
    isProductionMode?: boolean;
    store?: LocalAccountStore;
    skipSessionStorage?: boolean;
  }) {
    this.isProductionMode = Boolean(options?.isProductionMode);
    this.store = options?.store ?? sharedLocalAccountStore;
    this.skipSessionStorage = Boolean(options?.skipSessionStorage);
  }

  private readStoredSession(): AuthSession {
    const storage = this.skipSessionStorage ? null : getSafeStorage();
    if (!storage) {
      const mem = this.memorySession;
      if (!mem || !mem.isAuthenticated || !mem.principal) {
        return createEmptySession();
      }
      // Verify live status in store so deactivated accounts cannot retain active sessions
      const live = this.store.findAuthPrincipalByLoginId(mem.principal.loginId);
      if (!live || live.status !== 'active' || this.isSessionExpired(mem)) {
        this.memorySession = createEmptySession();
        return createEmptySession();
      }
      return mem;
    }

    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return createEmptySession();
    }

    try {
      const parsed = JSON.parse(raw) as Partial<StoredDevSessionPayload>;
      if (!parsed.principal || !isValidRole(parsed.principal.role) || !parsed.expiresAtIso) {
        storage.removeItem(SESSION_STORAGE_KEY);
        return createEmptySession();
      }

      const expiresAtMs = Date.parse(parsed.expiresAtIso);
      if (Number.isNaN(expiresAtMs) || Date.now() >= expiresAtMs) {
        storage.removeItem(SESSION_STORAGE_KEY);
        return createEmptySession();
      }

      // Cross-check live store status so deactivated accounts cannot keep using old sessions
      const livePrincipal = this.store.findAuthPrincipalByLoginId(parsed.principal.loginId);
      if (!livePrincipal || livePrincipal.status !== 'active') {
        storage.removeItem(SESSION_STORAGE_KEY);
        return createEmptySession();
      }

      return {
        principal: livePrincipal,
        isAuthenticated: true,
        dataSourceMode: 'local_demo_adapter',
        lastVerifiedAtIso: parsed.lastVerifiedAtIso ?? null,
        expiresAtIso: parsed.expiresAtIso,
      };
    } catch {
      storage.removeItem(SESSION_STORAGE_KEY);
      return createEmptySession();
    }
  }

  private writeStoredSession(session: AuthSession): void {
    this.memorySession = session;
    const storage = this.skipSessionStorage ? null : getSafeStorage();
    if (!storage) {
      return;
    }

    if (!session.isAuthenticated || !session.principal || !session.expiresAtIso) {
      storage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    // Never persist passwords or secret fields; store minimal principal metadata only.
    const payload: StoredDevSessionPayload = {
      principal: {
        uid: session.principal.uid,
        loginId: session.principal.loginId,
        role: session.principal.role,
        fullName: session.principal.fullName,
        status: session.principal.status,
        sharedWithParent: session.principal.sharedWithParent,
        assignedClassIds: session.principal.assignedClassIds,
        assignedSubjectIds: session.principal.assignedSubjectIds,
        enrolledBatchId: session.principal.enrolledBatchId,
      },
      lastVerifiedAtIso: session.lastVerifiedAtIso ?? new Date().toISOString(),
      expiresAtIso: session.expiresAtIso,
    };

    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  }

  async getCurrentSession(): Promise<AuthSession> {
    return this.readStoredSession();
  }

  async signInWithId(credentials: LoginCredentials): Promise<AuthSession> {
    if (this.isProductionMode && !this.store.hasAnyDevCredentials()) {
      throw new AuthServiceException({
        code: 'UNEXPECTED_ERROR',
        message: 'Authentication backend is not connected yet. Connect Firebase Authentication for production use.',
        field: 'form',
      });
    }

    const normalizedId = credentials.loginId.trim().toUpperCase();
    const rawPassword = credentials.password;

    if (!normalizedId) {
      throw new AuthServiceException({
        code: 'EMPTY_ID',
        message: 'Please enter your Account ID.',
        field: 'loginId',
      });
    }

    if (!rawPassword) {
      throw new AuthServiceException({
        code: 'EMPTY_PASSWORD',
        message: 'Please enter your password.',
        field: 'password',
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 160));

    const matchedPrincipal = this.store.findAuthPrincipalByLoginId(normalizedId);

    if (!matchedPrincipal) {
      throw new AuthServiceException({
        code: this.isProductionMode ? 'INVALID_CREDENTIALS' : 'INVALID_ID',
        message: this.isProductionMode
          ? 'Invalid ID or password. Please check your credentials.'
          : 'Invalid ID. Please check your ID.',
        field: 'loginId',
      });
    }

    if (matchedPrincipal.status === 'deactivated') {
      throw new AuthServiceException({
        code: 'INACTIVE_ACCOUNT',
        message: 'This account is inactive. Please contact your centre administrator.',
        field: 'form',
      });
    }

    if (!this.store.verifyCredential(normalizedId, rawPassword)) {
      throw new AuthServiceException({
        code: this.isProductionMode ? 'INVALID_CREDENTIALS' : 'INCORRECT_PASSWORD',
        message: this.isProductionMode
          ? 'Invalid ID or password. Please check your credentials.'
          : 'Password incorrect. Please try again.',
        field: 'password',
      });
    }

    const actualRole = matchedPrincipal.role;
    if (!isValidRole(actualRole)) {
      throw new AuthServiceException({
        code: 'INVALID_ROLE',
        message: 'Account role configuration is invalid. Contact your administrator.',
        field: 'form',
      });
    }

    if (credentials.portalScope === 'admin_portal' && actualRole !== 'admin') {
      throw new AuthServiceException({
        code: 'PORTAL_ROLE_MISMATCH',
        message:
          'Only Admin accounts may sign in to the Admin Portal. Please use the Teacher & Student Portal.',
        field: 'form',
      });
    }

    const now = new Date();
    const expires = new Date(now.getTime() + DEFAULT_SESSION_TTL_MS);

    const session: AuthSession = {
      principal: { ...matchedPrincipal },
      isAuthenticated: true,
      dataSourceMode: 'local_demo_adapter',
      lastVerifiedAtIso: now.toISOString(),
      expiresAtIso: expires.toISOString(),
    };

    this.writeStoredSession(session);
    return session;
  }

  async signOut(): Promise<void> {
    this.memorySession = createEmptySession();
    const storage = this.skipSessionStorage ? null : getSafeStorage();
    if (storage) {
      storage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  async requestForgotPassword(input: {
    loginId: string;
    portalScope: PortalScope;
  }): Promise<ForgotPasswordRequestResult> {
    const trimmed = input.loginId.trim();
    if (!trimmed) {
      throw new AuthServiceException({
        code: 'EMPTY_ID',
        message: 'Please enter your Account ID to submit a reset request.',
        field: 'loginId',
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    const audienceNote =
      input.portalScope === 'admin_portal'
        ? 'If this Admin ID is registered, follow your centre owner recovery procedure. Password resets are never sent via unverified channels.'
        : 'If this ID is registered, your centre administrator can initiate a secure password reset for your account. Please contact the centre office.';

    return {
      submitted: true,
      message: audienceNote,
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
    throw new Error('Use IAccountManagementService.createTeacherAccount or createStudentAccount.');
  }

  async searchAccountsById(): Promise<AuthPrincipal[]> {
    throw new Error('Use IAccountManagementService.searchAccounts.');
  }

  async deactivateAccount(): Promise<void> {
    throw new Error('Use IAccountManagementService.deactivateAccount.');
  }

  async initiatePasswordReset(): Promise<PasswordResetInitiation> {
    throw new Error('Use IAccountManagementService.initiatePasswordReset.');
  }
}

export const localAuthService = new LocalDevAuthService({
  isProductionMode: Boolean(import.meta.env?.PROD),
});
export const DEV_SESSION_STORAGE_KEY = SESSION_STORAGE_KEY;
