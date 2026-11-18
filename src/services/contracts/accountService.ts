import type {
  AccountAuditEntry,
  AccountListFilter,
  AccountOverviewStats,
  AccountRecord,
  AuthPrincipal,
  CreateStudentAccountInput,
  CreateTeacherAccountInput,
  DemoClassOption,
  DemoPasswordResetReceipt,
  ManagedAccountRole,
  UpdateAccountInput,
} from '../../types';

export type AccountServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_ID'
  | 'NOT_FOUND'
  | 'IMMUTABLE_FIELD'
  | 'INVALID_STATE';

export class AccountServiceError extends Error {
  code: AccountServiceErrorCode;
  field?: string;

  constructor(code: AccountServiceErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'AccountServiceError';
    this.code = code;
    this.field = field;
  }
}

/**
 * Admin-Only Account Management Contract.
 * Implementations must enforce Admin authorization at the service boundary
 * and never return passwords or password hashes.
 */
export interface IAccountManagementService {
  getDemoClassOptions(actor: AuthPrincipal | null): Promise<DemoClassOption[]>;
  getAccountOverview(actor: AuthPrincipal | null): Promise<AccountOverviewStats>;
  listAccounts(
    actor: AuthPrincipal | null,
    filter?: AccountListFilter
  ): Promise<AccountRecord[]>;
  searchAccounts(
    actor: AuthPrincipal | null,
    query: string
  ): Promise<AccountRecord[]>;
  getAccountByAccountId(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountRecord>;
  previewNextAccountId(
    actor: AuthPrincipal | null,
    role: ManagedAccountRole
  ): Promise<string>;
  createTeacherAccount(
    actor: AuthPrincipal | null,
    input: CreateTeacherAccountInput
  ): Promise<AccountRecord>;
  createStudentAccount(
    actor: AuthPrincipal | null,
    input: CreateStudentAccountInput
  ): Promise<AccountRecord>;
  updateAccountDetails(
    actor: AuthPrincipal | null,
    accountId: string,
    updates: UpdateAccountInput
  ): Promise<AccountRecord>;
  deactivateAccount(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountRecord>;
  reactivateAccount(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountRecord>;
  initiatePasswordReset(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<DemoPasswordResetReceipt>;
  getAccountAuditLog(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountAuditEntry[]>;
}
