export type UserRole = 'admin' | 'teacher' | 'student';

export type PortalScope = 'admin_portal' | 'member_portal';

export type AccountStatus = 'active' | 'deactivated' | 'password_reset_required';

export interface AuthPrincipal {
  uid: string;
  loginId: string; // Admin ID, Teacher ID, or Student ID
  role: UserRole;
  fullName: string;
  status: AccountStatus;
  /**
   * Parents share the student's login credentials; no separate parent role exists.
   */
  sharedWithParent?: boolean;
  assignedClassIds?: string[];
  assignedSubjectIds?: string[];
  enrolledBatchId?: string;
}

export interface LoginCredentials {
  loginId: string;
  password: string;
  /**
   * Identifies which application entry point initiated the request
   * (never trusts a user-chosen role).
   */
  portalScope: PortalScope;
}

export interface AuthSession {
  principal: AuthPrincipal | null;
  isAuthenticated: boolean;
  dataSourceMode:
    | 'local_demo_adapter'
    | 'firebase_disconnected'
    | 'firebase_connected'
    | 'firebase_configuration_error';
  lastVerifiedAtIso: string | null;
  expiresAtIso: string | null;
}

export type AuthErrorCode =
  | 'EMPTY_ID'
  | 'EMPTY_PASSWORD'
  | 'INVALID_FORMAT'
  | 'INVALID_ID'
  | 'INCORRECT_PASSWORD'
  | 'INVALID_CREDENTIALS'
  | 'INACTIVE_ACCOUNT'
  | 'INVALID_ROLE'
  | 'PORTAL_ROLE_MISMATCH'
  | 'SESSION_EXPIRED'
  | 'UNEXPECTED_ERROR';

export interface AuthOperationError {
  code: AuthErrorCode;
  message: string;
  field?: 'loginId' | 'password' | 'form';
}

export interface PasswordResetInitiation {
  targetUserId: string;
  targetLoginId: string;
  initiatedByAdminId: string;
  initiatedAtIso: string;
  deliveryChannel: 'secure_reset_link' | 'temporary_one_time_token';
}

export interface ForgotPasswordRequestResult {
  submitted: boolean;
  message: string;
}

export type PermissionAction =
  | 'accounts:create'
  | 'accounts:search'
  | 'accounts:deactivate'
  | 'accounts:reset_password'
  | 'academics:manage_structure'
  | 'timetable:edit'
  | 'announcements:publish'
  | 'announcements:read'
  | 'attendance:mark_assigned'
  | 'attendance:read_personal'
  | 'homework:create_text_only'
  | 'homework:read_assigned'
  | 'assessments:manage_assigned'
  | 'assessments:take_online_test'
  | 'fees:configure_structure'
  | 'fees:verify_payment'
  | 'fees:initiate_upi_payment'
  | 'fees:view_receipts'
  | 'salaries:manage'
  | 'reports:view_financial'
  | 'branding:configure';

export const ROLE_PERMISSION_MATRIX: Record<UserRole, readonly PermissionAction[]> = {
  admin: [
    'accounts:create',
    'accounts:search',
    'accounts:deactivate',
    'accounts:reset_password',
    'academics:manage_structure',
    'timetable:edit',
    'announcements:publish',
    'announcements:read',
    'fees:configure_structure',
    'fees:verify_payment',
    'fees:view_receipts',
    'salaries:manage',
    'reports:view_financial',
    'branding:configure',
  ],
  teacher: [
    'announcements:read',
    'attendance:mark_assigned',
    'homework:create_text_only',
    'homework:read_assigned',
    'assessments:manage_assigned',
  ],
  student: [
    'announcements:read',
    'attendance:read_personal',
    'homework:read_assigned',
    'assessments:take_online_test',
    'fees:initiate_upi_payment',
    'fees:view_receipts',
  ],
};

export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  return ROLE_PERMISSION_MATRIX[role].includes(action);
}
