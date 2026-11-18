import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { isCloudFunctionsEnabled } from '../../lib/firebase/config';
import { OperationType } from '../../lib/firebase/firestore';
import { invokeCloudCallable } from '../../lib/firebase/functions';
import {
  AccountServiceError,
  type IAccountManagementService,
} from '../contracts/accountService';
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
import {
  validateInitialPassword,
  validateOptionalEmail,
  validatePersonName,
  validatePhoneNumber,
} from '../../utils/validation';
import {
  requireFirestoreDb,
  requireVerifiedActor,
  withFirestoreErrorHandling,
} from './helpers';

function mapUserDocToAccountRecord(docId: string, data: Record<string, unknown>): AccountRecord {
  return {
    id: docId,
    accountId: String(data.accountId || ''),
    role: data.role === 'teacher' ? 'teacher' : 'student',
    name: String(data.name || ''),
    phone: String(data.phone || ''),
    email: typeof data.email === 'string' && data.email ? data.email : undefined,
    status: data.status === 'deactivated' ? 'deactivated' : 'active',
    classId: typeof data.classId === 'string' && data.classId ? data.classId : undefined,
    className: typeof data.className === 'string' && data.className ? data.className : undefined,
    batchId: typeof data.batchId === 'string' && data.batchId ? data.batchId : undefined,
    batchName: typeof data.batchName === 'string' && data.batchName ? data.batchName : undefined,
    createdAt: String(data.createdAt || ''),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

function generateClientTempPassword(): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `Tcm@${random}9`;
}

export class FirebaseAccountService implements IAccountManagementService {
  private ensureAdmin(actor: AuthPrincipal | null): AuthPrincipal {
    try {
      return requireVerifiedActor(actor, ['admin']);
    } catch (error) {
      throw new AccountServiceError(
        'UNAUTHORIZED',
        error instanceof Error ? error.message : 'Admin authorization required.'
      );
    }
  }

  async getDemoClassOptions(actor: AuthPrincipal | null): Promise<DemoClassOption[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'classes', async () => {
      const [clsSnap, batSnap] = await Promise.all([
        getDocs(query(collection(db, 'classes'), where('status', '==', 'active'))),
        getDocs(query(collection(db, 'batches'), where('status', '==', 'active'))),
      ]);
      const batches = batSnap.docs.map((d) => d.data());
      return clsSnap.docs.map((d) => {
        const cls = d.data();
        const classId = String(cls.classId || d.id);
        return {
          id: classId,
          name: String(cls.name || classId),
          batches: batches
            .filter((b) => String(b.classId) === classId)
            .map((b) => ({
              id: String(b.batchId || b.id),
              name: String(b.name || ''),
            })),
        };
      });
    });
  }

  async getAccountOverview(actor: AuthPrincipal | null): Promise<AccountOverviewStats> {
    const accounts = await this.listAccounts(actor);
    return {
      totalTeachers: accounts.filter((a) => a.role === 'teacher').length,
      totalStudents: accounts.filter((a) => a.role === 'student').length,
      activeAccounts: accounts.filter((a) => a.status === 'active').length,
      inactiveAccounts: accounts.filter((a) => a.status === 'deactivated').length,
      recentAccounts: accounts.slice(0, 5),
    };
  }

  async listAccounts(
    actor: AuthPrincipal | null,
    filter?: AccountListFilter
  ): Promise<AccountRecord[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'users', async () => {
      const snap = await getDocs(collection(db, 'users'));
      let results = snap.docs
        .map((d) => mapUserDocToAccountRecord(d.id, d.data()))
        .filter((r) => {
          const rawRole = snap.docs.find((docSnap) => docSnap.id === r.id)?.data().role;
          return rawRole === 'teacher' || rawRole === 'student';
        });

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
    });
  }

  async searchAccounts(actor: AuthPrincipal | null, queryText: string): Promise<AccountRecord[]> {
    return this.listAccounts(actor, { searchQuery: queryText });
  }

  async getAccountByAccountId(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountRecord> {
    this.ensureAdmin(actor);
    const trimmed = accountId.trim().toUpperCase();
    if (!trimmed) {
      throw new AccountServiceError('VALIDATION_ERROR', 'Account ID is required.', 'accountId');
    }
    const all = await this.listAccounts(actor);
    const match = all.find((a) => a.accountId.toUpperCase() === trimmed);
    if (!match) {
      throw new AccountServiceError('NOT_FOUND', `No account found for "${trimmed}".`);
    }
    return match;
  }

  async previewNextAccountId(
    actor: AuthPrincipal | null,
    role: ManagedAccountRole
  ): Promise<string> {
    const all = await this.listAccounts(actor, { role });
    const prefix = role === 'teacher' ? 'TCH' : 'STU';
    let maxNum = 0;
    for (const acc of all) {
      const m = acc.accountId.match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
      if (m) {
        maxNum = Math.max(maxNum, Number(m[1]));
      }
    }
    return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
  }

  async createTeacherAccount(
    actor: AuthPrincipal | null,
    input: CreateTeacherAccountInput
  ): Promise<AccountRecord> {
    this.ensureAdmin(actor);
    const nameCheck = validatePersonName(input.name, 'Teacher name');
    if (!nameCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    const phoneCheck = validatePhoneNumber(input.phone);
    if (!phoneCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', phoneCheck.error!, 'phone');
    const emailCheck = validateOptionalEmail(input.email);
    if (!emailCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', emailCheck.error!, 'email');
    const pwCheck = validateInitialPassword(input.initialPassword);
    if (!pwCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', pwCheck.error!, 'initialPassword');
    }

    if (!isCloudFunctionsEnabled()) {
      throw new AccountServiceError(
        'UNAUTHORIZED',
        'Creating Firebase Authentication Teacher accounts requires deploying /functions (createManagedAccount) on Firebase Blaze plan and setting VITE_FIREBASE_FUNCTIONS_ENABLED=true. See docs/FIREBASE_DEPLOYMENT_AND_OPERATIONS.md.'
      );
    }

    const created = await invokeCloudCallable<Record<string, unknown>, Record<string, unknown>>(
      'createManagedAccount',
      {
        role: 'teacher',
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || undefined,
        initialPassword: input.initialPassword,
        status: input.status,
        idempotencyKey: `TCH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }
    );

    return mapUserDocToAccountRecord(String(created.uid), created);
  }

  async createStudentAccount(
    actor: AuthPrincipal | null,
    input: CreateStudentAccountInput
  ): Promise<AccountRecord> {
    this.ensureAdmin(actor);
    const nameCheck = validatePersonName(input.name, 'Student name');
    if (!nameCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    const phoneCheck = validatePhoneNumber(input.phone);
    if (!phoneCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', phoneCheck.error!, 'phone');
    const emailCheck = validateOptionalEmail(input.email);
    if (!emailCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', emailCheck.error!, 'email');
    const pwCheck = validateInitialPassword(input.initialPassword);
    if (!pwCheck.valid) {
      throw new AccountServiceError('VALIDATION_ERROR', pwCheck.error!, 'initialPassword');
    }

    if (!isCloudFunctionsEnabled()) {
      throw new AccountServiceError(
        'UNAUTHORIZED',
        'Creating Firebase Authentication Student accounts requires deploying /functions (createManagedAccount) on Firebase Blaze plan and setting VITE_FIREBASE_FUNCTIONS_ENABLED=true. See docs/FIREBASE_DEPLOYMENT_AND_OPERATIONS.md.'
      );
    }

    const db = requireFirestoreDb();
    const [clsSnap, batSnap] = await Promise.all([
      getDoc(doc(db, 'classes', input.classId)),
      getDoc(doc(db, 'batches', input.batchId)),
    ]);

    const created = await invokeCloudCallable<Record<string, unknown>, Record<string, unknown>>(
      'createManagedAccount',
      {
        role: 'student',
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || undefined,
        initialPassword: input.initialPassword,
        status: input.status,
        classId: input.classId,
        className: clsSnap.exists() ? String(clsSnap.data().name || '') : '',
        batchId: input.batchId,
        batchName: batSnap.exists() ? String(batSnap.data().name || '') : '',
        idempotencyKey: `STU-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }
    );

    return mapUserDocToAccountRecord(String(created.uid), created);
  }

  async updateAccountDetails(
    actor: AuthPrincipal | null,
    accountId: string,
    updates: UpdateAccountInput
  ): Promise<AccountRecord> {
    this.ensureAdmin(actor);
    const existing = await this.getAccountByAccountId(actor, accountId);

    const nameCheck = validatePersonName(updates.name, 'Name');
    if (!nameCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    const phoneCheck = validatePhoneNumber(updates.phone);
    if (!phoneCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', phoneCheck.error!, 'phone');
    const emailCheck = validateOptionalEmail(updates.email);
    if (!emailCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', emailCheck.error!, 'email');

    const db = requireFirestoreDb();
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      name: updates.name.trim(),
      phone: updates.phone.trim(),
      updatedAt: nowIso,
    };
    if (updates.email?.trim()) {
      patch.email = updates.email.trim();
    }
    if (existing.role === 'student' && updates.classId && updates.batchId) {
      const [clsSnap, batSnap] = await Promise.all([
        getDoc(doc(db, 'classes', updates.classId)),
        getDoc(doc(db, 'batches', updates.batchId)),
      ]);
      patch.classId = updates.classId;
      patch.className = clsSnap.exists() ? String(clsSnap.data().name || '') : existing.className;
      patch.batchId = updates.batchId;
      patch.batchName = batSnap.exists() ? String(batSnap.data().name || '') : existing.batchName;
    }

    await withFirestoreErrorHandling(OperationType.UPDATE, `users/${existing.id}`, async () => {
      await updateDoc(doc(db, 'users', existing.id), patch);
    });

    return this.getAccountByAccountId(actor, accountId);
  }

  async deactivateAccount(actor: AuthPrincipal | null, accountId: string): Promise<AccountRecord> {
    this.ensureAdmin(actor);
    const existing = await this.getAccountByAccountId(actor, accountId);
    if (existing.status === 'deactivated') {
      throw new AccountServiceError('INVALID_STATE', 'This account is already deactivated.');
    }

    if (isCloudFunctionsEnabled()) {
      await invokeCloudCallable('setManagedAccountStatus', {
        accountId: existing.accountId,
        status: 'deactivated',
      });
      return this.getAccountByAccountId(actor, accountId);
    }

    const db = requireFirestoreDb();
    await withFirestoreErrorHandling(OperationType.UPDATE, `users/${existing.id}`, async () => {
      await updateDoc(doc(db, 'users', existing.id), {
        status: 'deactivated',
        updatedAt: new Date().toISOString(),
      });
    });
    return this.getAccountByAccountId(actor, accountId);
  }

  async reactivateAccount(actor: AuthPrincipal | null, accountId: string): Promise<AccountRecord> {
    this.ensureAdmin(actor);
    const existing = await this.getAccountByAccountId(actor, accountId);
    if (existing.status === 'active') {
      throw new AccountServiceError('INVALID_STATE', 'This account is already active.');
    }

    if (isCloudFunctionsEnabled()) {
      await invokeCloudCallable('setManagedAccountStatus', {
        accountId: existing.accountId,
        status: 'active',
      });
      return this.getAccountByAccountId(actor, accountId);
    }

    const db = requireFirestoreDb();
    await withFirestoreErrorHandling(OperationType.UPDATE, `users/${existing.id}`, async () => {
      await updateDoc(doc(db, 'users', existing.id), {
        status: 'active',
        updatedAt: new Date().toISOString(),
      });
    });
    return this.getAccountByAccountId(actor, accountId);
  }

  async initiatePasswordReset(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<DemoPasswordResetReceipt> {
    const admin = this.ensureAdmin(actor);
    const existing = await this.getAccountByAccountId(actor, accountId);

    if (!isCloudFunctionsEnabled()) {
      throw new AccountServiceError(
        'UNAUTHORIZED',
        'Admin-mediated Firebase password reset requires deploying /functions (adminResetAccountPassword) on Firebase Blaze plan and setting VITE_FIREBASE_FUNCTIONS_ENABLED=true.'
      );
    }

    const tempPassword = generateClientTempPassword();
    await invokeCloudCallable('adminResetAccountPassword', {
      accountId: existing.accountId,
      newPassword: tempPassword,
      confirmed: true,
    });

    return {
      accountId: existing.accountId,
      targetName: existing.name,
      initiatedByAdminId: admin.loginId,
      initiatedAt: new Date().toISOString(),
      mode: 'demo_only',
      notice: `Firebase Auth password reset completed and active sessions revoked. Temporary password (share securely once): ${tempPassword}`,
    };
  }

  async getAccountAuditLog(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<AccountAuditEntry[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'accountAudit', async () => {
      const snap = await getDocs(
        query(
          collection(db, 'accountAudit'),
          where('accountId', '==', accountId.trim().toUpperCase()),
          orderBy('createdAt', 'desc')
        )
      ).catch(() => null);
      if (!snap) return [];
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          accountId: String(data.accountId || ''),
          action: (data.action || 'profile_updated') as AccountAuditEntry['action'],
          performedByAdminId: String(data.actorId || ''),
          timestamp: String(data.createdAt || ''),
          summary: String(data.summary || ''),
        };
      });
    });
  }
}

export const firebaseAccountService = new FirebaseAccountService();
