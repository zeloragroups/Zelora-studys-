import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  authService,
  AuthServiceException,
  firebaseAuthService,
  isFirebaseConnectedMode,
} from '../services';
import type {
  AuthPrincipal,
  AuthSession,
  ForgotPasswordRequestResult,
  LoginCredentials,
  PortalScope,
} from '../types';

interface AuthContextValue {
  session: AuthSession;
  principal: AuthPrincipal | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  authNotice: string | null;
  clearAuthNotice: () => void;
  setAuthNotice: (message: string | null) => void;
  signIn: (credentials: LoginCredentials) => Promise<AuthSession>;
  signInAdminWithGoogle: () => Promise<AuthSession>;
  signOut: () => Promise<void>;
  changeMyPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestForgotPassword: (input: {
    loginId: string;
    portalScope: PortalScope;
  }) => Promise<ForgotPasswordRequestResult>;
  validateActiveSession: () => Promise<boolean>;
}

function createEmptySession(): AuthSession {
  return {
    principal: null,
    isAuthenticated: false,
    dataSourceMode: isFirebaseConnectedMode() ? 'firebase_connected' : 'local_demo_adapter',
    lastVerifiedAtIso: null,
    expiresAtIso: null,
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(createEmptySession);
  const [isRestoring, setIsRestoring] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (isFirebaseConnectedMode()) {
      setIsRestoring(true);
      const unsubscribe = firebaseAuthService.subscribeToAuthState((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setIsRestoring(false);
      });
      return () => {
        active = false;
        unsubscribe();
      };
    }

    setIsRestoring(true);
    void authService
      .getCurrentSession()
      .then((current) => {
        if (active) setSession(current);
      })
      .catch(() => {
        if (active) setSession(createEmptySession());
      })
      .finally(() => {
        if (active) setIsRestoring(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const validateActiveSession = useCallback(async (): Promise<boolean> => {
    if (!session.isAuthenticated) {
      return false;
    }
    const expiresAt = session.expiresAtIso ? Date.parse(session.expiresAtIso) : NaN;
    if (!Number.isNaN(expiresAt) && Date.now() >= expiresAt) {
      await authService.signOut();
      setSession(createEmptySession());
      setAuthNotice('Your session expired. Please sign in again.');
      return false;
    }
    const live = await authService.getCurrentSession();
    if (!live.isAuthenticated) {
      setSession(createEmptySession());
      setAuthNotice('Your account session is no longer active.');
      return false;
    }
    return true;
  }, [session]);

  const lastFocusCheckRef = useRef<number>(0);
  useEffect(() => {
    if (!session.isAuthenticated) {
      return;
    }
    const handleRevalidate = () => {
      const now = Date.now();
      if (now - lastFocusCheckRef.current < 60_000) {
        return;
      }
      lastFocusCheckRef.current = now;
      void validateActiveSession();
    };
    const intervalId = window.setInterval(() => {
      void validateActiveSession();
    }, 5 * 60 * 1000);
    window.addEventListener('focus', handleRevalidate);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleRevalidate);
    };
  }, [session.isAuthenticated, validateActiveSession]);

  const signIn = useCallback(async (credentials: LoginCredentials): Promise<AuthSession> => {
    setAuthNotice(null);
    const nextSession = await authService.signInWithId(credentials);
    setSession(nextSession);
    return nextSession;
  }, []);

  const signInAdminWithGoogle = useCallback(async (): Promise<AuthSession> => {
    setAuthNotice(null);
    if (!isFirebaseConnectedMode()) {
      throw new AuthServiceException({
        code: 'UNEXPECTED_ERROR',
        message: 'Google operator sign-in is only available when Firebase is connected.',
        field: 'form',
      });
    }
    const nextSession = await firebaseAuthService.signInAdminWithGoogle();
    setSession(nextSession);
    return nextSession;
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await authService.signOut();
    setSession(createEmptySession());
    setAuthNotice('You have signed out cleanly.');
  }, []);

  const changeMyPassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      if (!authService.changeMyPassword) {
        throw new AuthServiceException({
          code: 'UNEXPECTED_ERROR',
          message: 'Password change is not supported in the active authentication adapter.',
          field: 'form',
        });
      }
      await authService.changeMyPassword(currentPassword, newPassword);
    },
    []
  );

  const requestForgotPassword = useCallback(
    async (input: {
      loginId: string;
      portalScope: PortalScope;
    }): Promise<ForgotPasswordRequestResult> => {
      return authService.requestForgotPassword(input);
    },
    []
  );

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);

  return (
    <AuthContext.Provider
      value={{
        session,
        principal: session.principal,
        isAuthenticated: session.isAuthenticated,
        isRestoring,
        authNotice,
        clearAuthNotice,
        setAuthNotice,
        signIn,
        signInAdminWithGoogle,
        signOut,
        changeMyPassword,
        requestForgotPassword,
        validateActiveSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

export { AuthServiceException };
