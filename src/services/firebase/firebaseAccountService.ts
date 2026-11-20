import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { deriveInternalAuthEmail } from '../../lib/firebase/config';
import { OperationType } from '../../lib/firebase/firestore';
import {
  LINKED_CONSOLE_UID_REGEX,
  provisionWithSecondaryFirebaseAuth,
} from '../../lib/firebase/provisioningApp';
import {
  AccountServiceError,
  type IAccountManagementService,
} from '../contracts/accountService';
import type {
  AccountAuditAction,
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
  generateSafeDocId,
  getActiveAdminUids,
  requireFirestoreDb,
  requireVerifiedActor,
  stripUndefinedFields,
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

function mapFirebaseProvisioningError(error: unknown): AccountServiceError {
  if (error instanceof AccountServiceError) return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  if (code === 'auth/email-already-in-use') {
    return new AccountServiceError(
      'DUPLICATE_ID',
      'An account with this derived login ID already exists in Firebase Authentication. If you pre-created it in Firebase Console, switch to "Link pre-created Firebase Console UID" mode and paste its UID.'
    );
  }
  if (code === 'auth/weak-password') {
    return new AccountServiceError(
      'VALIDATION_ERROR',
      'Initial password is too weak for Firebase Authentication (use 8+ characters).',
      'initialPassword'
    );
  }
  if (code === 'auth/operation-not-allowed') {
    return new AccountServiceError(
      'UNAUTHORIZED',
      'Email/Password sign-in must be enabled in Firebase Console -> Authentication -> Sign-in method to provision Teacher/Student accounts.'
    );
  }
  if (code === 'auth/network-request-failed') {
    return new AccountServiceError(
      'VALIDATION_ERROR',
      'Network unavailable while contacting Firebase Authentication.'
    );
  }
  return new AccountServiceError(
    'VALIDATION_ERROR',
    error instanceof Error ? error.message : 'Unable to provision account in Firebase.'
  );
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

  private async allocateNextAccountId(
    db: Firestore,
    role: ManagedAccountRole
  ): Promise<string> {
    const prefix = role === 'teacher' ? 'TCH' : 'STU';
    const [usersSnap, mappingsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'authIdMappings')).catch(() => null),
    ]);

    let maxNum = 0;
    const inspectId = (raw: unknown) => {
      if (typeof raw !== 'string') return;
      const m = raw.trim().match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
      if (m) {
        maxNum = Math.max(maxNum, Number(m[1]));
      }
    };

    for (const d of usersSnap.docs) {
      inspectId(d.data().accountId);
    }
    if (mappingsSnap) {
      for (const d of mappingsSnap.docs) {
        inspectId(d.id);
        inspectId(d.data().loginId);
      }
    }
    return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
  }

  private buildAuditEntry(
    accountId: string,
    action: AccountAuditAction,
    actorId: string,
    summary: string,
    adminUids: string[],
    nowIso: string
  ): { id: string; payload: Record<string, unknown> } {
    const id = generateSafeDocId('AAUD');
    return {
      id,
      payload: {
        id,
        accountId: accountId.trim().toUpperCase(),
        actorId,
        action,
        summary,
        adminUids,
        createdAt: nowIso,
      },
    };
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
        .map((d) => ({
          rawRole: d.data().role,
          record: mapUserDocToAccountRecord(d.id, d.data()),
        }))
        .filter((entry) => entry.rawRole === 'teacher' || entry.rawRole === 'student')
        .map((entry) => entry.record);

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
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'users', () =>
      this.allocateNextAccountId(db, role)
    );
  }

  async createTeacherAccount(
    actor: AuthPrincipal | null,
    input: CreateTeacherAccountInput
  ): Promise<AccountRecord> {
    const admin = this.ensureAdmin(actor);
    const nameCheck = validatePersonName(input.name, 'Teacher name');
    if (!nameCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    const phoneCheck = validatePhoneNumber(input.phone);
    if (!phoneCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', phoneCheck.error!, 'phone');
    const emailCheck = validateOptionalEmail(input.email);
    if (!emailCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', emailCheck.error!, 'email');

    const mode = input.provisioningMode ?? 'spark_secondary_auth';
    const manualUid = input.existingAuthUid?.trim() ?? '';
    if (mode === 'manual_console_uid') {
      if (!LINKED_CONSOLE_UID_REGEX.test(manualUid)) {
        throw new AccountServiceError(
          'VALIDATION_ERROR',
          'Enter the valid Firebase Auth UID copied from Firebase Console (6-128 characters).',
          'existingAuthUid'
        );
      }
    } else {
      const pwCheck = validateInitialPassword(input.initialPassword);
      if (!pwCheck.valid) {
        throw new AccountServiceError('VALIDATION_ERROR', pwCheck.error!, 'initialPassword');
      }
    }

    const db = requireFirestoreDb();
    const [accountId, adminUids] = await Promise.all([
      this.allocateNextAccountId(db, 'teacher'),
      getActiveAdminUids(db),
    ]);
    const authEmail = deriveInternalAuthEmail(accountId);
    const nowIso = new Date().toISOString();

    const commitFirestoreRecords = async (uid: string): Promise<AccountRecord> => {
      const existingUserSnap = await getDoc(doc(db, 'users', uid));
      if (existingUserSnap.exists()) {
        throw new AccountServiceError(
          'DUPLICATE_ID',
          `Firebase Auth UID "${uid}" is already linked to account "${String(existingUserSnap.data().accountId || uid)}".`,
          mode === 'manual_console_uid' ? 'existingAuthUid' : undefined
        );
      }

      const batch = writeBatch(db);
      const userDoc = stripUndefinedFields({
        uid,
        accountId,
        role: 'teacher',
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || undefined,
        status: input.status,
        adminUids,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      batch.set(doc(db, 'users', uid), userDoc);
      batch.set(doc(db, 'authIdMappings', accountId), {
        loginId: accountId,
        uid,
        authEmail,
        role: 'teacher',
        status: input.status,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const audit = this.buildAuditEntry(
        accountId,
        'created',
        admin.loginId,
        mode === 'manual_console_uid'
          ? `Teacher account created (${input.status}) by linking Firebase Console UID.`
          : `Teacher account created (${input.status}) via isolated Spark Auth provisioning.`,
        adminUids,
        nowIso
      );
      batch.set(doc(db, 'accountAudit', audit.id), audit.payload);

      await withFirestoreErrorHandling(OperationType.WRITE, `users/${uid}`, () => batch.commit());
      return mapUserDocToAccountRecord(uid, userDoc);
    };

    try {
      if (mode === 'manual_console_uid') {
        return await commitFirestoreRecords(manualUid);
      }
      return await provisionWithSecondaryFirebaseAuth(
        authEmail,
        input.initialPassword,
        commitFirestoreRecords
      );
    } catch (error) {
      throw mapFirebaseProvisioningError(error);
    }
  }

  async createStudentAccount(
    actor: AuthPrincipal | null,
    input: CreateStudentAccountInput
  ): Promise<AccountRecord> {
    const admin = this.ensureAdmin(actor);
    const nameCheck = validatePersonName(input.name, 'Student name');
    if (!nameCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    const phoneCheck = validatePhoneNumber(input.phone);
    if (!phoneCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', phoneCheck.error!, 'phone');
    const emailCheck = validateOptionalEmail(input.email);
    if (!emailCheck.valid) throw new AccountServiceError('VALIDATION_ERROR', emailCheck.error!, 'email');

    const mode = input.provisioningMode ?? 'spark_secondary_auth';
    const manualUid = input.existingAuthUid?.trim() ?? '';
    if (mode === 'manual_console_uid') {
      if (!LINKED_CONSOLE_UID_REGEX.test(manualUid)) {
        throw new AccountServiceError(
          'VALIDATION_ERROR',
          'Enter the valid Firebase Auth UID copied from Firebase Console (6-128 characters).',
          'existingAuthUid'
        );
      }
    } else {
      const pwCheck = validateInitialPassword(input.initialPassword);
      if (!pwCheck.valid) {
        throw new AccountServiceError('VALIDATION_ERROR', pwCheck.error!, 'initialPassword');
      }
    }

    const db = requireFirestoreDb();
    const hasPlacement = Boolean(input.classId?.trim() && input.batchId?.trim());
    const [clsSnap, batSnap] = hasPlacement
      ? await Promise.all([
          getDoc(doc(db, 'classes', input.classId.trim())),
          getDoc(doc(db, 'batches', input.batchId.trim())),
        ])
      : [null, null];

    if (hasPlacement && (!clsSnap?.exists() || !batSnap?.exists())) {
      throw new AccountServiceError(
        'VALIDATION_ERROR',
        'Selected Class or Batch does not exist in Firestore.',
        !clsSnap?.exists() ? 'classId' : 'batchId'
      );
    }

    const [accountId, adminUids, asgSnap] = await Promise.all([
      this.allocateNextAccountId(db, 'student'),
      getActiveAdminUids(db),
      hasPlacement
        ? getDocs(
            query(
              collection(db, 'teacherAssignments'),
              where('batchId', '==', input.batchId.trim()),
              where('status', '==', 'active')
            )
          ).catch(() => null)
        : Promise.resolve(null),
    ]);

    const authEmail = deriveInternalAuthEmail(accountId);
    const nowIso = new Date().toISOString();
    const className = clsSnap?.exists() ? String(clsSnap.data().name || '') : undefined;
    const batchName = batSnap?.exists() ? String(batSnap.data().name || '') : undefined;
    const teacherUids = asgSnap
      ? Array.from(
          new Set(asgSnap.docs.map((d) => String(d.data().teacherUid || '')).filter(Boolean))
        ).slice(0, 25)
      : [];

    const commitFirestoreRecords = async (uid: string): Promise<AccountRecord> => {
      const existingUserSnap = await getDoc(doc(db, 'users', uid));
      if (existingUserSnap.exists()) {
        throw new AccountServiceError(
          'DUPLICATE_ID',
          `Firebase Auth UID "${uid}" is already linked to account "${String(existingUserSnap.data().accountId || uid)}".`,
          mode === 'manual_console_uid' ? 'existingAuthUid' : undefined
        );
      }

      const batch = writeBatch(db);
      const userDoc = stripUndefinedFields({
        uid,
        accountId,
        role: 'student',
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || undefined,
        status: input.status,
        classId: hasPlacement ? input.classId.trim() : undefined,
        className,
        batchId: hasPlacement ? input.batchId.trim() : undefined,
        batchName,
        sharedWithParent: true,
        adminUids,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      batch.set(doc(db, 'users', uid), userDoc);
      batch.set(doc(db, 'authIdMappings', accountId), {
        loginId: accountId,
        uid,
        authEmail,
        role: 'student',
        status: input.status,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      if (hasPlacement && input.status === 'active') {
        const enrolmentId = generateSafeDocId('ENR');
        batch.set(
          doc(db, 'enrolments', enrolmentId),
          stripUndefinedFields({
            id: enrolmentId,
            enrolmentId,
            studentAccountId: accountId,
            studentUid: uid,
            studentName: input.name.trim(),
            classId: input.classId.trim(),
            batchId: input.batchId.trim(),
            enrolmentDate: nowIso.slice(0, 10),
            status: 'active',
            adminUids,
            teacherUids,
            createdAt: nowIso,
          })
        );
      }

      const audit = this.buildAuditEntry(
        accountId,
        'created',
        admin.loginId,
        mode === 'manual_console_uid'
          ? `Student account created (${input.status}) by linking Firebase Console UID.`
          : `Student account created (${input.status}) via isolated Spark Auth provisioning.`,
        adminUids,
        nowIso
      );
      batch.set(doc(db, 'accountAudit', audit.id), audit.payload);

      await withFirestoreErrorHandling(OperationType.WRITE, `users/${uid}`, () => batch.commit());
      return mapUserDocToAccountRecord(uid, userDoc);
    };

    try {
      if (mode === 'manual_console_uid') {
        return await commitFirestoreRecords(manualUid);
      }
      return await provisionWithSecondaryFirebaseAuth(
        authEmail,
        input.initialPassword,
        commitFirestoreRecords
      );
    } catch (error) {
      throw mapFirebaseProvisioningError(error);
    }
  }

  async updateAccountDetails(
    actor: AuthPrincipal | null,
    accountId: string,
    updates: UpdateAccountInput
  ): Promise<AccountRecord> {
    const admin = this.ensureAdmin(actor);
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

    const adminUids = await getActiveAdminUids(db);
    const audit = this.buildAuditEntry(
      existing.accountId,
      'profile_updated',
      admin.loginId,
      'Profile details updated by Admin.',
      adminUids,
      nowIso
    );

    await withFirestoreErrorHandling(OperationType.UPDATE, `users/${existing.id}`, async () => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', existing.id), patch);
      batch.set(doc(db, 'accountAudit', audit.id), audit.payload);
      await batch.commit();
    });

    return this.getAccountByAccountId(actor, accountId);
  }

  async deactivateAccount(actor: AuthPrincipal | null, accountId: string): Promise<AccountRecord> {
    const admin = this.ensureAdmin(actor);
    const existing = await this.getAccountByAccountId(actor, accountId);
    if (existing.status === 'deactivated') {
      throw new AccountServiceError('INVALID_STATE', 'This account is already deactivated.');
    }

    const db = requireFirestoreDb();
    const nowIso = new Date().toISOString();
    const [adminUids, mappingSnap] = await Promise.all([
      getActiveAdminUids(db),
      getDoc(doc(db, 'authIdMappings', existing.accountId)).catch(() => null),
    ]);

    const audit = this.buildAuditEntry(
      existing.accountId,
      'deactivated',
      admin.loginId,
      'Account deactivated in Firestore; portal sign-in blocked while record history preserved.',
      adminUids,
      nowIso
    );

    await withFirestoreErrorHandling(OperationType.UPDATE, `users/${existing.id}`, async () => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', existing.id), {
        status: 'deactivated',
        updatedAt: nowIso,
      });
      if (mappingSnap?.exists()) {
        batch.update(doc(db, 'authIdMappings', existing.accountId), {
          status: 'deactivated',
          updatedAt: nowIso,
        });
      }
      batch.set(doc(db, 'accountAudit', audit.id), audit.payload);
      await batch.commit();
    });
    return this.getAccountByAccountId(actor, accountId);
  }

  async reactivateAccount(actor: AuthPrincipal | null, accountId: string): Promise<AccountRecord> {
    const admin = this.ensureAdmin(actor);
    const existing = await this.getAccountByAccountId(actor, accountId);
    if (existing.status === 'active') {
      throw new AccountServiceError('INVALID_STATE', 'This account is already active.');
    }

    const db = requireFirestoreDb();
    const nowIso = new Date().toISOString();
    const [adminUids, mappingSnap] = await Promise.all([
      getActiveAdminUids(db),
      getDoc(doc(db, 'authIdMappings', existing.accountId)).catch(() => null),
    ]);

    const audit = this.buildAuditEntry(
      existing.accountId,
      'reactivated',
      admin.loginId,
      'Account reactivated; portal sign-in restored.',
      adminUids,
      nowIso
    );

    await withFirestoreErrorHandling(OperationType.UPDATE, `users/${existing.id}`, async () => {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', existing.id), {
        status: 'active',
        updatedAt: nowIso,
      });
      if (mappingSnap?.exists()) {
        batch.update(doc(db, 'authIdMappings', existing.accountId), {
          status: 'active',
          updatedAt: nowIso,
        });
      }
      batch.set(doc(db, 'accountAudit', audit.id), audit.payload);
      await batch.commit();
    });
    return this.getAccountByAccountId(actor, accountId);
  }

  async initiatePasswordReset(
    actor: AuthPrincipal | null,
    accountId: string
  ): Promise<DemoPasswordResetReceipt> {
    const admin = this.ensureAdmin(actor);
    const existing = await this.getAccountByAccountId(actor, accountId);
    const db = requireFirestoreDb();
    const nowIso = new Date().toISOString();
    const authEmail = deriveInternalAuthEmail(existing.accountId);
    const adminUids = await getActiveAdminUids(db);

    const audit = this.buildAuditEntry(
      existing.accountId,
      'password_reset_initiated',
      admin.loginId,
      `Manual Firebase Console password reset initiated for ${existing.accountId} (${authEmail}).`,
      adminUids,
      nowIso
    );

    await withFirestoreErrorHandling(
      OperationType.CREATE,
      `accountAudit/${audit.id}`,
      async () => {
        const ref = doc(db, 'accountAudit', audit.id);
        const batch = writeBatch(db);
        batch.set(ref, audit.payload);
        await batch.commit();
      }
    );

    return {
      accountId: existing.accountId,
      targetName: existing.name,
      initiatedByAdminId: admin.loginId,
      initiatedAt: nowIso,
      mode: 'manual_console_required',
      authEmail,
      notice:
        'Logged in account audit history. On the Firebase Spark (free) plan without Admin SDK Cloud Functions, resetting another user\'s password requires Firebase Console access (or the user can change their own password in Account & Preferences).',
      manualSteps: [
        'Open Firebase Console -> project academy-0007 -> Authentication -> Users.',
        `Locate the account "${authEmail}" (Account ID: ${existing.accountId}).`,
        'Open the user menu (...) and select "Reset password" to set a new temporary password.',
        'Share the new password securely with the user and instruct them to update it under Account & Preferences.',
      ],
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
          limit(250)
        )
      ).catch(() => null);
      if (!snap) return [];
      return snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            accountId: String(data.accountId || ''),
            action: (data.action || 'profile_updated') as AccountAuditEntry['action'],
            performedByAdminId: String(data.actorId || ''),
            timestamp: String(data.createdAt || ''),
            summary: String(data.summary || ''),
          };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });
  }
}

export const firebaseAccountService = new FirebaseAccountService();
