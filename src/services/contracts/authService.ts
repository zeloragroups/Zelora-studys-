import type {
  AuthPrincipal,
  AuthSession,
  ForgotPasswordRequestResult,
  LoginCredentials,
  PasswordResetInitiation,
  PortalScope,
  UserRole,
} from '../../types';

/**
 * Role-based authentication contract.
 * Admin, Teacher, and Student authenticate strictly via assigned ID + password.
 * No public self-registration exists in this contract.
 */
export interface IAuthService {
  getCurrentSession(): Promise<AuthSession>;
  signInWithId(credentials: LoginCredentials): Promise<AuthSession>;
  signOut(): Promise<void>;
  changeMyPassword?(currentPassword: string, newPassword: string): Promise<void>;

  /**
   * Forgot-password intake UX (Phase 2).
   * Must never reveal whether a particular account ID exists.
   */
  requestForgotPassword(input: {
    loginId: string;
    portalScope: PortalScope;
  }): Promise<ForgotPasswordRequestResult>;

  /**
   * Admin-only operations (to be built out in Phase 3). Never returns readable passwords.
   */
  createAccountByAdmin(input: {
    role: Exclude<UserRole, 'admin'>;
    fullName: string;
    assignedClassIds?: string[];
    assignedSubjectIds?: string[];
    enrolledBatchId?: string;
  }): Promise<{ principal: AuthPrincipal; oneTimeSetupToken: string }>;

  searchAccountsById(query: string): Promise<AuthPrincipal[]>;
  deactivateAccount(targetUid: string, adminUid: string): Promise<void>;
  initiatePasswordReset(
    targetUid: string,
    adminUid: string
  ): Promise<PasswordResetInitiation>;
}
