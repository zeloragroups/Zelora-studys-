import { hasPermission, type AccountAuditEntry, type AccountListFilter, type AccountOverviewStats, type AccountRecord, type AuthPrincipal, type CreateStudentAccountInput, type CreateTeacherAccountInput, type DemoClassOption, type DemoPasswordResetReceipt, type ManagedAccountRole, type UpdateAccountInput } from '../../types';
import {
  validateInitialPassword,
  validateOptionalEmail,
  validatePersonName,
  validatePhoneNumber,
} from '../../utils/validation';
import { accountIdGenerator } from '../accounts/idGeneratorService';
import {
  AccountServiceError,
  type IAccountManagementService,
} from '../contracts/accountService';
import { LocalAccountStore, sharedLocalAccountStore } from './localAccountStore';

function requireAdminActor(actor: AuthPrincipal | null): AuthPrincipal {
  if (!actor) {
    throw new AccountServiceError('UNAUTHORIZED', 'Authentication is required for account management.');
  }
  if (actor.status !== 'active') {
    throw new AccountServiceError('UNAUTHORIZED', 'Active administrator status is required.');
  }
  if (
    actor.role !== 'admin' ||
    !hasPermission(actor.role, 'accounts:create') ||
    !hasPermission(actor.role, 'accounts:search')
  ) {
    throw new AccountServiceError(
      'UNAUTHORIZED',
      'Access denied. Only an authorized Admin may manage accounts.'
    );
  }
  return actor;
}

export class LocalDevAccountService implements IAccountManagementService {
  private readonly store: LocalAccountStore;
  private readonly skipPersistence: boolean;

  constructor(store: LocalAccountStore = sharedLocalAccountStore, skipPersistence = false) {
    this.store = store;
    this.skipPersistence = skipPersistence;
  }

  async getDemoClassOptions(actor: AuthPrincipal | null): Promise<DemoClassOption[]> {
    requireAdminActor(actor);
    return this.store.getDemoClassOptions().map((cls) => ({
      ...cls,
      batches: cls.batches.map((b) => ({ ...b })),
    }));
  }

  async getAccountOverview(actor: AuthPrincipal | null): Promise<AccountOverviewStats> {
    requireAdminActor(actor);
    const all = this.store.getAllAccounts();
    const totalTeachers = all.filter((a) => a.role === 'teacher').length;
    const totalStudents = all.filter((a) => a.role === 'student').length;
    const activeAccounts = all.filter((a) => a.status === 'active').length;
    const inactiveAccounts = all.filter((a) => a.status === 'deactivated').length;
    const recentAccounts = [...all]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);

    return {
      totalTeachers,
      totalStudents,
      activeAccounts,
      inactiveAccounts,
      recentAccounts,
    };
  }

  async listAccounts(
    actor: AuthPrincipal | null,
    filter?: AccountListFilter
  ): Promise<AccountRecord[]> {
    requireAdminActor(actor);
    let results = this.store.getAllAccounts();

    if (filter?.role && filter.role !== 'all') {
      results = results.filter((a) => a.role === filter.role);
    }

    if (filter?.status && filter.status !== 'all') {
      results = results.filter((a) => a.status === filter.status);
    }

    const q = filter?.searchQuery?.trim().toLowerCase();
    if (q) {
      results = results.filter(
        (a) =>
          a.accountId.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q)
      );
    }

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async searchAccounts(
    actor: AuthPrincipal | null,
    query: string
  ): Promise<AccountRecord[]> {
    requireAdminActor(actor);
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return [];
    }
    const all = this.store.getAllAccounts();
    return all.filter(
      (a) =>
        a.accountId.toLowerCase() === trimmed ||
        a.accountId.toLowerCase().includes(trimmed) ||
        a.name.toLowerCase().includes(trimmed)
    );
  }

  async getAccountByAccountId(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountRecord> {
    requireAdminActor(actor);
    const trimmed = accountId.trim();
    if (!trimmed) {
      throw new AccountServiceError('VALIDATION_ERROR', 'Account ID is required.', 'accountId');
    }
    const found = this.store.findAccountById(trimmed);
    if (!found) {
      throw new AccountServiceError('NOT_FOUND', `No account found for ID "${trimmed.toUpperCase()}".`);
    }
    return found;
  }

  async previewNextAccountId(
    actor: AuthPrincipal | null,
    role: ManagedAccountRole
  ): Promise<string> {
    requireAdminActor(actor);
    const { accountId } = accountIdGenerator.previewNextId(
      role,
      this.store.getCounters(),
      this.store.getExistingAccountIds()
    );
    return accountId;
  }

  async createTeacherAccount(
    actor: AuthPrincipal | null,
    input: CreateTeacherAccountInput
  ): Promise<AccountRecord> {
    const admin = requireAdminActor(actor);

    const nameCheck = validatePersonName(input.name, 'Teacher name');
    if (!nameCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    }
    const phoneCheck = validatePhoneNumber(input.phone);
    if (!phoneCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', phoneCheck.error!, 'phone');
    }
    const emailCheck = validateOptionalEmail(input.email);
    if (!emailCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', emailCheck.error!, 'email');
    }
    const passwordCheck = validateInitialPassword(input.initialPassword);
    if (!passwordCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', passwordCheck.error!, 'initialPassword');
    }

    const existingIds = this.store.getExistingAccountIds();
    const { accountId, nextCounters } = accountIdGenerator.allocateNextId(
      'teacher',
      this.store.getCounters(),
      existingIds
    );

    if (existingIds.has(accountId.toUpperCase())) {
      throw new AccountServiceError('DUPLICATE_ID', `Account ID ${accountId} already exists.`);
    }

    const now = new Date().toISOString();
    const record: AccountRecord = {
      id: `dev-uid-${accountId.toLowerCase()}`,
      accountId,
      role: 'teacher',
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || undefined,
      status: input.status,
      createdAt: now,
    };

    return this.store.insertAccount(
      record,
      input.initialPassword,
      nextCounters,
      admin.loginId,
      this.skipPersistence
    );
  }

  async createStudentAccount(
    actor: AuthPrincipal | null,
    input: CreateStudentAccountInput
  ): Promise<AccountRecord> {
    const admin = requireAdminActor(actor);

    const nameCheck = validatePersonName(input.name, 'Student name');
    if (!nameCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    }
    const phoneCheck = validatePhoneNumber(input.phone);
    if (!phoneCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', phoneCheck.error!, 'phone');
    }
    const emailCheck = validateOptionalEmail(input.email);
    if (!emailCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', emailCheck.error!, 'email');
    }
    const passwordCheck = validateInitialPassword(input.initialPassword);
    if (!passwordCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', passwordCheck.error!, 'initialPassword');
    }

    const classOptions = this.store.getDemoClassOptions();
    const selectedClass = classOptions.find((c) => c.id === input.classId);
    if (!selectedClass) {
      throw new AccountServiceError('VALIDATION_ERROR', 'Please select a valid class.', 'classId');
    }
    const selectedBatch = selectedClass.batches.find((b) => b.id === input.batchId);
    if (!selectedBatch) {
      throw new AccountServiceError('VALIDATION_ERROR', 'Please select a valid batch.', 'batchId');
    }

    const existingIds = this.store.getExistingAccountIds();
    const { accountId, nextCounters } = accountIdGenerator.allocateNextId(
      'student',
      this.store.getCounters(),
      existingIds
    );

    if (existingIds.has(accountId.toUpperCase())) {
      throw new AccountServiceError('DUPLICATE_ID', `Account ID ${accountId} already exists.`);
    }

    const now = new Date().toISOString();
    const record: AccountRecord = {
      id: `dev-uid-${accountId.toLowerCase()}`,
      accountId,
      role: 'student',
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || undefined,
      status: input.status,
      classId: selectedClass.id,
      className: selectedClass.name,
      batchId: selectedBatch.id,
      batchName: selectedBatch.name,
      createdAt: now,
    };

    return this.store.insertAccount(
      record,
      input.initialPassword,
      nextCounters,
      admin.loginId,
      this.skipPersistence
    );
  }

  async updateAccountDetails(
    actor: AuthPrincipal | null,
    accountId: string,
    updates: UpdateAccountInput
  ): Promise<AccountRecord> {
    const admin = requireAdminActor(actor);

    const existing = this.store.findAccountById(accountId);
    if (!existing) {
      throw new AccountServiceError('NOT_FOUND', `Account "${accountId}" was not found.`);
    }

    // Defensive check against attempted immutable field injection at runtime
    const rawPayload = updates as unknown as Record<string, unknown>;
    if ('accountId' in rawPayload || 'role' in rawPayload || 'createdAt' in rawPayload || 'password' in rawPayload) {
      throw new AccountServiceError(
        'IMMUTABLE_FIELD',
        'Account ID, role, creation date, and passwords cannot be edited through profile updates.'
      );
    }

    const nameCheck = validatePersonName(updates.name, 'Name');
    if (!nameCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    }
    const phoneCheck = validatePhoneNumber(updates.phone);
    if (!phoneCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', phoneCheck.error!, 'phone');
    }
    const emailCheck = validateOptionalEmail(updates.email);
    if (!emailCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', emailCheck.error!, 'email');
    }

    let nextClassId = existing.classId;
    let nextClassName = existing.className;
    let nextBatchId = existing.batchId;
    let nextBatchName = existing.batchName;

    if (existing.role === 'student') {
      const targetClassId = updates.classId ?? existing.classId ?? '';
      const targetBatchId = updates.batchId ?? existing.batchId ?? '';
      const classOptions = this.store.getDemoClassOptions();
      const selectedClass = classOptions.find((c) => c.id === targetClassId);
      if (!selectedClass) {
        throw new AccountServiceError('VALIDATION_ERROR', 'Please select a valid class.', 'classId');
      }
      const selectedBatch = selectedClass.batches.find((b) => b.id === targetBatchId);
      if (!selectedBatch) {
        throw new AccountServiceError('VALIDATION_ERROR', 'Please select a valid batch.', 'batchId');
      }
      nextClassId = selectedClass.id;
      nextClassName = selectedClass.name;
      nextBatchId = selectedBatch.id;
      nextBatchName = selectedBatch.name;
    }

    const updated = this.store.updateAccount(
      existing.accountId,
      (current) => ({
        ...current,
        name: updates.name.trim(),
        phone: updates.phone.trim(),
        email: updates.email?.trim() || undefined,
        classId: nextClassId,
        className: nextClassName,
        batchId: nextBatchId,
        batchName: nextBatchName,
        updatedAt: new Date().toISOString(),
      }),
      'profile_updated',
      admin.loginId,
      'Profile details updated by Admin.',
      this.skipPersistence
    );

    if (!updated) {
      throw new AccountServiceError('NOT_FOUND', `Account "${accountId}" was not found.`);
    }
    return updated;
  }

  async deactivateAccount(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountRecord> {
    const admin = requireAdminActor(actor);
    const existing = this.store.findAccountById(accountId);
    if (!existing) {
      throw new AccountServiceError('NOT_FOUND', `Account "${accountId}" was not found.`);
    }
    if (existing.status === 'deactivated') {
      throw new AccountServiceError('INVALID_STATE', 'This account is already deactivated.');
    }

    const updated = this.store.updateAccount(
      existing.accountId,
      (current) => ({
        ...current,
        status: 'deactivated',
        updatedAt: new Date().toISOString(),
      }),
      'deactivated',
      admin.loginId,
      'Account deactivated; sign-in blocked while record history preserved.',
      this.skipPersistence
    );

    if (!updated) {
      throw new AccountServiceError('NOT_FOUND', `Account "${accountId}" was not found.`);
    }
    return updated;
  }

  async reactivateAccount(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountRecord> {
    const admin = requireAdminActor(actor);
    const existing = this.store.findAccountById(accountId);
    if (!existing) {
      throw new AccountServiceError('NOT_FOUND', `Account "${accountId}" was not found.`);
    }
    if (existing.status === 'active') {
      throw new AccountServiceError('INVALID_STATE', 'This account is already active.');
    }

    const updated = this.store.updateAccount(
      existing.accountId,
      (current) => ({
        ...current,
        status: 'active',
        updatedAt: new Date().toISOString(),
      }),
      'reactivated',
      admin.loginId,
      'Account reactivated; sign-in eligibility restored.',
      this.skipPersistence
    );

    if (!updated) {
      throw new AccountServiceError('NOT_FOUND', `Account "${accountId}" was not found.`);
    }
    return updated;
  }

  async initiatePasswordReset(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<DemoPasswordResetReceipt> {
    const admin = requireAdminActor(actor);
    if (!hasPermission(admin.role, 'accounts:reset_password')) {
      throw new AccountServiceError('UNAUTHORIZED', 'Not authorized to reset passwords.');
    }

    const existing = this.store.findAccountById(accountId);
    if (!existing) {
      throw new AccountServiceError('NOT_FOUND', `Account "${accountId}" was not found.`);
    }

    this.store.recordPasswordResetInitiation(
      existing.accountId,
      admin.loginId,
      this.skipPersistence
    );

    return {
      accountId: existing.accountId,
      targetName: existing.name,
      initiatedByAdminId: admin.loginId,
      initiatedAt: new Date().toISOString(),
      mode: 'demo_only',
      notice:
        'DEMO ONLY: Reset request logged locally. No email, SMS, or WhatsApp message was sent. Production password resets require connecting Firebase Authentication.',
    };
  }

  async getAccountAuditLog(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountAuditEntry[]> {
    requireAdminActor(actor);
    return this.store.getAuditLogForAccount(accountId);
  }
}

export const localAccountService = new LocalDevAccountService();
