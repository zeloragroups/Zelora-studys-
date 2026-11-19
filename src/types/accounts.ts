import type { AccountStatus } from './auth';

export type ManagedAccountRole = 'teacher' | 'student';

export type ManagedAccountStatus = Extract<AccountStatus, 'active' | 'deactivated'>;

export interface DemoClassOption {
  id: string;
  name: string;
  batches: Array<{ id: string; name: string }>;
}

/**
 * Frontend-safe Account Profile Record.
 * Never contains plaintext passwords, password hashes, or authentication secrets.
 */
export interface AccountRecord {
  id: string;
  accountId: string;
  role: ManagedAccountRole;
  name: string;
  phone: string;
  email?: string;
  status: ManagedAccountStatus;
  classId?: string;
  className?: string;
  batchId?: string;
  batchName?: string;
  createdAt: string;
  updatedAt?: string;
}

export type AccountAuditAction =
  | 'created'
  | 'profile_updated'
  | 'deactivated'
  | 'reactivated'
  | 'password_reset_initiated';

export interface AccountAuditEntry {
  id: string;
  accountId: string;
  action: AccountAuditAction;
  performedByAdminId: string;
  timestamp: string;
  summary: string;
}

export interface AccountOverviewStats {
  totalTeachers: number;
  totalStudents: number;
  activeAccounts: number;
  inactiveAccounts: number;
  recentAccounts: AccountRecord[];
}

export interface AccountListFilter {
  role?: ManagedAccountRole | 'all';
  status?: ManagedAccountStatus | 'all';
  searchQuery?: string;
}

export type AccountProvisioningMode = 'spark_secondary_auth' | 'manual_console_uid';

export interface CreateTeacherAccountInput {
  name: string;
  phone: string;
  email?: string;
  initialPassword: string;
  status: ManagedAccountStatus;
  provisioningMode?: AccountProvisioningMode;
  existingAuthUid?: string;
}

export interface CreateStudentAccountInput {
  name: string;
  classId: string;
  batchId: string;
  phone: string;
  email?: string;
  initialPassword: string;
  status: ManagedAccountStatus;
  provisioningMode?: AccountProvisioningMode;
  existingAuthUid?: string;
}

export interface UpdateAccountInput {
  name: string;
  phone: string;
  email?: string;
  classId?: string;
  batchId?: string;
}

export interface DemoPasswordResetReceipt {
  accountId: string;
  targetName: string;
  initiatedByAdminId: string;
  initiatedAt: string;
  mode: 'demo_only' | 'manual_console_required';
  notice: string;
  authEmail?: string;
  manualSteps?: string[];
}
