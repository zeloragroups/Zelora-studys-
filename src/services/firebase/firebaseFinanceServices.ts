import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { OperationType } from '../../lib/firebase/firestore';
import type {
  AdminFinancialDashboardData,
  AttendanceSession,
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  FeeConfiguration,
  FeeReceipt,
  FinancialAuditEntityType,
  FinancialAuditEntry,
  FinancialNotification,
  FinancialNotificationType,
  FinancialReportFilter,
  FinancialReportSummary,
  PaymentClaim,
  PaymentClaimDetailView,
  PaymentVerificationAudit,
  PreparedUpiPayment,
  SalaryEligibleSessionItem,
  StudentEnrolment,
  StudentFeeAccount,
  StudentFeeAccountStatus,
  StudentFeeAccountView,
  StudentFeeDashboardData,
  StudentFeeReportRow,
  SubjectRecord,
  TeacherSalaryConfiguration,
  TeacherSalaryPayment,
  TeacherSalaryPeriod,
  TeacherSalaryPeriodStatus,
  TeacherSalaryReportRow,
  TeacherSalarySummaryView,
  TimetableEntry,
  UpiConfiguration,
  VerifiedPayment,
} from '../../types';
import {
  computeMonthlyDueDate,
  formatInrFromPaise,
  formatPeriodLabel,
  paiseToUpiAmountString,
  rupeesToPaise,
} from '../../utils/currency';
import {
  validateIsoDate,
  validateMonthlyPeriod,
  validateRequiredText,
  validateTransactionReference,
  validateUpiId,
  validateYearlyPeriod,
} from '../../utils/validation';
import {
  FinanceServiceError,
  type IFeeConfigurationService,
  type IFinancialNotificationService,
  type IFinancialReportService,
  type IPaymentClaimService,
  type IPaymentVerificationService,
  type IReceiptService,
  type IStudentFeeService,
  type ITeacherSalaryService,
  type PrepareUpiPaymentInput,
  type RecordSalaryPaymentInput,
  type SaveFeeConfigurationInput,
  type SaveTeacherSalaryConfigInput,
  type SaveUpiConfigurationInput,
  type StudentFeeAccountsFilter,
  type SubmitPaymentClaimInput,
} from '../contracts/financeService';
import {
  generateSafeDocId,
  getActiveAdminUids,
  requireFirestoreDb,
  requireVerifiedActor,
  stripUndefinedFields,
  withFirestoreErrorHandling,
} from './helpers';

type FirestoreFeeAccountDoc = StudentFeeAccount & { studentUid: string; adminUids: string[] };
type FirestorePreparedUpiDoc = PreparedUpiPayment & { studentUid: string; adminUids: string[] };
type FirestorePaymentClaimDoc = PaymentClaim & { studentUid: string; adminUids: string[] };
type FirestoreVerifiedPaymentDoc = VerifiedPayment & { studentUid: string; adminUids: string[] };
type FirestoreReceiptDoc = FeeReceipt & { studentUid: string; adminUids: string[] };

interface PlacementInfo {
  studentId: string;
  studentUid: string;
  studentName: string;
  studentStatus: 'active' | 'deactivated';
  classId?: string;
  className: string;
  batchId?: string;
  batchName: string;
}

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeDueDateForPeriod(config: FeeConfiguration, feePeriod: string): string {
  if (config.frequency === 'monthly') {
    return computeMonthlyDueDate(feePeriod, config.dueDayOfMonth);
  }
  const startYear = feePeriod.slice(0, 4);
  if (config.yearlyDueDate && /^\d{4}-\d{2}-\d{2}$/.test(config.yearlyDueDate)) {
    return config.yearlyDueDate;
  }
  if (config.yearlyDueDate && /^\d{2}-\d{2}$/.test(config.yearlyDueDate)) {
    return `${startYear}-${config.yearlyDueDate}`;
  }
  return `${startYear}-06-${String(Math.max(1, Math.min(28, config.dueDayOfMonth))).padStart(2, '0')}`;
}

function periodStartDate(feePeriod: string): string {
  if (/^\d{4}-\d{2}$/.test(feePeriod)) {
    return `${feePeriod}-01`;
  }
  return `${feePeriod.slice(0, 4)}-01-01`;
}

function computeStatusFromRecords(
  account: StudentFeeAccount,
  verifiedPayments: VerifiedPayment[],
  claims: PaymentClaim[],
  todayIso = getTodayIsoDate()
): {
  status: StudentFeeAccountStatus;
  verifiedPaidPaise: number;
  remainingBalancePaise: number;
  pendingClaimsPaise: number;
  pendingClaimsCount: number;
  rejectedClaimsCount: number;
  isOverdue: boolean;
} {
  const verifiedPaidPaise = verifiedPayments
    .filter((v) => v.feeAccountId === account.id)
    .reduce((sum, v) => sum + v.amountPaise, 0);

  const remainingBalancePaise = Math.max(0, account.amountDuePaise - verifiedPaidPaise);
  const accountClaims = claims.filter((c) => c.feeAccountId === account.id);
  const pendingClaims = accountClaims.filter((c) => c.status === 'verification_pending');
  const pendingClaimsPaise = pendingClaims.reduce((sum, c) => sum + c.amountPaise, 0);
  const rejectedClaimsCount = accountClaims.filter((c) => c.status === 'rejected').length;
  const isOverdue = remainingBalancePaise > 0 && todayIso > account.dueAt;

  let status: StudentFeeAccountStatus;
  if (remainingBalancePaise <= 0) {
    status = 'paid';
  } else if (pendingClaims.length > 0) {
    status = 'verification_pending';
  } else if (isOverdue) {
    status = 'overdue';
  } else if (verifiedPaidPaise > 0) {
    status = 'partially_paid';
  } else {
    status = 'unpaid';
  }

  return {
    status,
    verifiedPaidPaise,
    remainingBalancePaise,
    pendingClaimsPaise,
    pendingClaimsCount: pendingClaims.length,
    rejectedClaimsCount,
    isOverdue,
  };
}

function ensureRole(
  actor: AuthPrincipal | null,
  roles: Array<'admin' | 'teacher' | 'student'>
): AuthPrincipal {
  try {
    return requireVerifiedActor(actor, roles);
  } catch (error) {
    throw new FinanceServiceError(
      'UNAUTHORIZED',
      error instanceof Error ? error.message : 'Authorization failed.'
    );
  }
}

async function writeFinancialAudit(
  db: ReturnType<typeof requireFirestoreDb>,
  adminUids: string[],
  input: {
    entityType: FinancialAuditEntityType;
    entityId: string;
    actorId: string;
    action: string;
    previousValues?: string;
    newValues?: string;
    reason?: string;
    timestamp?: string;
  }
): Promise<FinancialAuditEntry> {
  const id = generateSafeDocId('FAUD');
  const entry: FinancialAuditEntry & { adminUids: string[] } = {
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: input.actorId,
    action: input.action,
    previousValues: input.previousValues,
    newValues: input.newValues,
    reason: input.reason,
    timestamp: input.timestamp ?? new Date().toISOString(),
    adminUids,
  };
  await setDoc(doc(db, 'financialAudit', id), stripUndefinedFields({ ...entry }));
  return entry;
}

async function writePaymentVerificationAudit(
  db: ReturnType<typeof requireFirestoreDb>,
  adminUids: string[],
  input: {
    paymentClaimId: string;
    verifiedPaymentId?: string;
    actorId: string;
    action: PaymentVerificationAudit['action'];
    previousValues?: string;
    newValues?: string;
    reason?: string;
    timestamp?: string;
  }
): Promise<void> {
  const id = generateSafeDocId('PVAUD');
  await setDoc(
    doc(db, 'paymentVerificationAudit', id),
    stripUndefinedFields({
      id,
      paymentClaimId: input.paymentClaimId,
      verifiedPaymentId: input.verifiedPaymentId,
      actorId: input.actorId,
      action: input.action,
      previousValues: input.previousValues,
      newValues: input.newValues,
      reason: input.reason,
      timestamp: input.timestamp ?? new Date().toISOString(),
      adminUids,
    })
  );
}

async function enqueueFirebaseFinancialNotification(
  db: ReturnType<typeof requireFirestoreDb>,
  adminUids: string[],
  input: {
    recipientId: string;
    recipientUid: string;
    recipientRole: 'admin' | 'teacher' | 'student';
    notificationType: FinancialNotificationType;
    relatedRecordId: string;
    dedupeKey: string;
    title: string;
    message: string;
  }
): Promise<void> {
  const existing = await getDocs(
    query(
      collection(db, 'notifications'),
      where('recipientUid', '==', input.recipientUid),
      where('dedupeKey', '==', input.dedupeKey)
    )
  ).catch(() => null);
  if (existing && !existing.empty) return;

  const id = generateSafeDocId('FNOT');
  await setDoc(
    doc(db, 'notifications', id),
    stripUndefinedFields({
      id,
      recipientId: input.recipientId.trim().toUpperCase(),
      recipientUid: input.recipientUid,
      recipientRole: input.recipientRole,
      category: 'fees_receipts',
      type: input.notificationType,
      relatedRecordId: input.relatedRecordId,
      dedupeKey: input.dedupeKey,
      title: input.title,
      message: input.message,
      adminUids,
      createdAt: new Date().toISOString(),
    })
  );
}

function mapDocToFinancialNotification(id: string, data: Record<string, unknown>): FinancialNotification {
  return {
    id,
    recipientId: String(data.recipientId || ''),
    notificationType: String(data.type || 'claim_received') as FinancialNotificationType,
    relatedRecordId: String(data.relatedRecordId || ''),
    dedupeKey: String(data.dedupeKey || id),
    title: String(data.title || ''),
    message: String(data.message || ''),
    createdAt: String(data.createdAt || ''),
    readAt: typeof data.readAt === 'string' && data.readAt ? data.readAt : undefined,
  };
}

async function loadPlacementMapForAdmin(
  db: ReturnType<typeof requireFirestoreDb>
): Promise<Map<string, PlacementInfo>> {
  const [usersSnap, enrSnap, clsSnap, batSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
    getDocs(collection(db, 'enrolments')),
    getDocs(collection(db, 'classes')),
    getDocs(collection(db, 'batches')),
  ]);
  const classes = new Map(clsSnap.docs.map((d) => [d.id, d.data() as ClassRecord]));
  const batches = new Map(batSnap.docs.map((d) => [d.id, d.data() as BatchRecord]));
  const activeEnrolments = new Map(
    enrSnap.docs
      .map((d) => d.data() as StudentEnrolment)
      .filter((e) => e.status === 'active')
      .map((e) => [e.studentAccountId.toUpperCase(), e])
  );

  const map = new Map<string, PlacementInfo>();
  for (const d of usersSnap.docs) {
    const u = d.data();
    const accId = String(u.accountId || '').toUpperCase();
    const enr = activeEnrolments.get(accId);
    const classId = enr?.classId ?? (typeof u.classId === 'string' ? u.classId : undefined);
    const batchId = enr?.batchId ?? (typeof u.batchId === 'string' ? u.batchId : undefined);
    map.set(accId, {
      studentId: accId,
      studentUid: d.id,
      studentName: String(u.name || accId),
      studentStatus: u.status === 'deactivated' ? 'deactivated' : 'active',
      classId,
      className: (classId && classes.get(classId)?.name) || String(u.className || 'Unassigned Class'),
      batchId,
      batchName: (batchId && batches.get(batchId)?.name) || String(u.batchName || 'Unassigned Batch'),
    });
  }
  return map;
}

async function loadPlacementForSingleStudent(
  db: ReturnType<typeof requireFirestoreDb>,
  studentUid: string,
  studentId: string
): Promise<PlacementInfo> {
  const [userSnap, enrSnap] = await Promise.all([
    getDoc(doc(db, 'users', studentUid)),
    getDocs(query(collection(db, 'enrolments'), where('studentUid', '==', studentUid))),
  ]);
  const u = userSnap.exists() ? userSnap.data() : {};
  const activeEnr = enrSnap.docs
    .map((d) => d.data() as StudentEnrolment)
    .find((e) => e.status === 'active');

  const classId = activeEnr?.classId ?? (typeof u.classId === 'string' ? u.classId : undefined);
  const batchId = activeEnr?.batchId ?? (typeof u.batchId === 'string' ? u.batchId : undefined);
  const [clsSnap, batSnap] = await Promise.all([
    classId ? getDoc(doc(db, 'classes', classId)).catch(() => null) : Promise.resolve(null),
    batchId ? getDoc(doc(db, 'batches', batchId)).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    studentId: studentId.toUpperCase(),
    studentUid,
    studentName: String(u.name || studentId),
    studentStatus: u.status === 'deactivated' ? 'deactivated' : 'active',
    classId,
    className:
      (clsSnap?.exists() ? String(clsSnap.data()?.name || '') : '') ||
      String(u.className || 'Unassigned Class'),
    batchId,
    batchName:
      (batSnap?.exists() ? String(batSnap.data()?.name || '') : '') ||
      String(u.batchName || 'Unassigned Batch'),
  };
}

function toViewAccount(
  acc: StudentFeeAccount,
  placement: PlacementInfo | undefined,
  verifiedPayments: VerifiedPayment[],
  claims: PaymentClaim[],
  receipts: FeeReceipt[]
): StudentFeeAccountView {
  const computed = computeStatusFromRecords(acc, verifiedPayments, claims);
  return {
    account: {
      ...acc,
      verifiedAmountPaidPaise: computed.verifiedPaidPaise,
      remainingBalancePaise: computed.remainingBalancePaise,
      status: computed.status,
    },
    studentName: placement?.studentName ?? acc.studentId,
    studentStatus: placement?.studentStatus ?? 'active',
    classId: placement?.classId,
    className: placement?.className ?? 'Unassigned Class',
    batchId: placement?.batchId,
    batchName: placement?.batchName ?? 'Unassigned Batch',
    pendingClaimsPaise: computed.pendingClaimsPaise,
    pendingClaimsCount: computed.pendingClaimsCount,
    rejectedClaimsCount: computed.rejectedClaimsCount,
    isOverdue: computed.isOverdue,
    claims: claims
      .filter((c) => c.feeAccountId === acc.id)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    verifiedPayments: verifiedPayments
      .filter((v) => v.feeAccountId === acc.id)
      .sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt)),
    receipts: receipts
      .filter((r) => r.studentId === acc.studentId && r.feePeriod === acc.feePeriod)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
  };
}

function toClaimDetailView(
  claim: PaymentClaim,
  placement: PlacementInfo | undefined,
  account: StudentFeeAccount | undefined,
  verifiedPayments: VerifiedPayment[],
  receipts: FeeReceipt[]
): PaymentClaimDetailView {
  const vp = verifiedPayments.find((v) => v.paymentClaimId === claim.id);
  const receipt = vp
    ? receipts.find((r) => r.verifiedPaymentId === vp.id && r.status === 'issued')
    : undefined;
  return {
    claim,
    studentName: placement?.studentName ?? claim.studentId,
    className: placement?.className ?? 'Unassigned Class',
    batchName: placement?.batchName ?? 'Unassigned Batch',
    periodLabel: account?.periodLabel ?? claim.feePeriod,
    accountRemainingBeforeVerificationPaise: account?.remainingBalancePaise ?? 0,
    receipt,
  };
}

async function resolveCentreName(db: ReturnType<typeof requireFirestoreDb>): Promise<string> {
  try {
    const snap = await getDoc(doc(db, 'applicationSettings', 'APP-SETTINGS-001'));
    if (snap.exists()) {
      const cp = snap.data().centreProfile as { centreName?: string } | undefined;
      if (cp?.centreName) return cp.centreName;
    }
  } catch {
    // Fallback below
  }
  return 'Tuition Centre';
}

// ===========================================================================
// 1. Fee Configuration, Student Fee Accounts & Financial Notifications
// ===========================================================================
export class FirebaseFeeService
  implements IFeeConfigurationService, IStudentFeeService, IFinancialNotificationService
{
  async getActiveFeeConfiguration(actor: AuthPrincipal | null): Promise<FeeConfiguration | null> {
    ensureRole(actor, ['admin', 'teacher', 'student']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'feeConfigurations', async () => {
      const snap = await getDocs(
        query(collection(db, 'feeConfigurations'), where('status', '==', 'active'))
      );
      if (snap.empty) return null;
      const list = snap.docs
        .map((d) => d.data() as FeeConfiguration)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return list[0] ?? null;
    });
  }

  async listFeeConfigurationHistory(actor: AuthPrincipal | null): Promise<FeeConfiguration[]> {
    ensureRole(actor, ['admin']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'feeConfigurations', async () => {
      const snap = await getDocs(collection(db, 'feeConfigurations'));
      return snap.docs
        .map((d) => d.data() as FeeConfiguration)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  async saveFeeConfiguration(
    actor: AuthPrincipal | null,
    input: SaveFeeConfigurationInput
  ): Promise<{
    config: FeeConfiguration;
    generatedAccountsCount: number;
    updatedUnpaidCount: number;
  }> {
    const admin = ensureRole(actor, ['admin']);
    const amountPaise = rupeesToPaise(input.amountRupees);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Fee amount must be a positive INR value greater than zero.',
        'amountRupees'
      );
    }
    if (input.frequency !== 'monthly' && input.frequency !== 'yearly') {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Fee frequency must be Monthly or Yearly.',
        'frequency'
      );
    }
    const effectiveCheck = validateIsoDate(input.effectiveFrom, 'Effective date');
    if (!effectiveCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', effectiveCheck.error!, 'effectiveFrom');
    }
    const dueDay = Math.floor(Number(input.dueDayOfMonth));
    if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 28) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Due day of month must be between 1 and 28.',
        'dueDayOfMonth'
      );
    }
    const reminderLeadDays = Math.floor(Number(input.reminderLeadDays ?? 5));
    if (!Number.isFinite(reminderLeadDays) || reminderLeadDays < 0 || reminderLeadDays > 30) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Reminder lead days must be between 0 and 30.',
        'reminderLeadDays'
      );
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const nowIso = new Date().toISOString();

    const existingSnap = await getDocs(collection(db, 'feeConfigurations'));
    const activePrev = existingSnap.docs
      .map((d) => d.data() as FeeConfiguration)
      .find((c) => c.status === 'active');

    for (const d of existingSnap.docs) {
      if (d.data().status === 'active') {
        await updateDoc(d.ref, { status: 'inactive', updatedAt: nowIso });
      }
    }

    const id = generateSafeDocId('FCFG');
    const dueDesc =
      input.frequency === 'monthly'
        ? `${dueDay}${dueDay === 1 ? 'st' : dueDay === 2 ? 'nd' : dueDay === 3 ? 'rd' : 'th'} of each month`
        : input.yearlyDueDate?.trim()
          ? `Yearly due date: ${input.yearlyDueDate.trim()}`
          : `Yearly (${dueDay}th of start month)`;

    const config: FeeConfiguration & { adminUids: string[] } = {
      id,
      amountPaise,
      frequency: input.frequency,
      effectiveFrom: input.effectiveFrom.trim(),
      dueDayOfMonth: dueDay,
      yearlyDueDate: input.yearlyDueDate?.trim() || undefined,
      dueDateConfiguration: dueDesc,
      reminderLeadDays,
      status: 'active',
      note: input.note?.trim() || undefined,
      createdBy: admin.loginId,
      adminUids,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await withFirestoreErrorHandling(
      OperationType.CREATE,
      `feeConfigurations/${id}`,
      async () => {
        await setDoc(doc(db, 'feeConfigurations', id), stripUndefinedFields({ ...config }));
        await writeFinancialAudit(db, adminUids, {
          entityType: 'fee_configuration',
          entityId: config.id,
          actorId: admin.loginId,
          action: activePrev ? 'fee_config_updated' : 'fee_config_created',
          previousValues: activePrev
            ? `${activePrev.id}: ${activePrev.frequency} ${formatInrFromPaise(activePrev.amountPaise)}`
            : undefined,
          newValues: `${config.id}: ${config.frequency} ${formatInrFromPaise(config.amountPaise)} effective ${config.effectiveFrom}`,
          reason: config.note ?? 'Admin fee configuration update',
          timestamp: nowIso,
        });
      }
    );

    let generatedAccountsCount = 0;
    let updatedUnpaidCount = 0;
    if (input.syncPeriod && input.syncPeriod.trim()) {
      const res = await this.internalGenerateOrSyncPeriod(
        db,
        adminUids,
        admin.loginId,
        config,
        input.syncPeriod.trim(),
        Boolean(input.applyToUnpaidCurrentAccounts)
      );
      generatedAccountsCount = res.createdCount;
      updatedUnpaidCount = res.updatedUnpaidCount;
    }

    return { config, generatedAccountsCount, updatedUnpaidCount };
  }

  async getUpiConfiguration(actor: AuthPrincipal | null): Promise<UpiConfiguration | null> {
    ensureRole(actor, ['admin', 'teacher', 'student']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'upiConfigurations', async () => {
      const snap = await getDocs(
        query(collection(db, 'upiConfigurations'), where('status', 'in', ['active', 'inactive']))
      );
      if (snap.empty) return null;
      const list = snap.docs
        .map((d) => d.data() as UpiConfiguration)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return list[0] ?? null;
    });
  }

  async saveUpiConfiguration(
    actor: AuthPrincipal | null,
    input: SaveUpiConfigurationInput
  ): Promise<UpiConfiguration> {
    const admin = ensureRole(actor, ['admin']);
    const upiCheck = validateUpiId(input.upiId);
    if (!upiCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', upiCheck.error!, 'upiId');
    }
    const payeeCheck = validateRequiredText(input.payeeName, 'Payee / Tuition Centre Name', 2);
    if (!payeeCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', payeeCheck.error!, 'payeeName');
    }
    if (input.status !== 'active' && input.status !== 'inactive') {
      throw new FinanceServiceError('VALIDATION_ERROR', 'Invalid UPI status.', 'status');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const nowIso = new Date().toISOString();

    const existingSnap = await getDocs(collection(db, 'upiConfigurations'));
    const prev = existingSnap.docs
      .map((d) => d.data() as UpiConfiguration)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    for (const d of existingSnap.docs) {
      if (d.data().status === 'active') {
        await updateDoc(d.ref, { status: 'inactive', updatedAt: nowIso });
      }
    }

    const id = generateSafeDocId('UPIC');
    const nextConfig: UpiConfiguration & { adminUids: string[] } = {
      id,
      upiId: input.upiId.trim(),
      payeeName: input.payeeName.trim(),
      description: input.description?.trim() || undefined,
      status: input.status,
      updatedBy: admin.loginId,
      updatedAt: nowIso,
      adminUids,
    };

    await withFirestoreErrorHandling(OperationType.CREATE, `upiConfigurations/${id}`, async () => {
      await setDoc(doc(db, 'upiConfigurations', id), stripUndefinedFields({ ...nextConfig }));
      await writeFinancialAudit(db, adminUids, {
        entityType: 'upi_configuration',
        entityId: nextConfig.id,
        actorId: admin.loginId,
        action: prev ? 'upi_config_updated' : 'upi_config_created',
        previousValues: prev ? `${prev.upiId} (${prev.payeeName}, ${prev.status})` : undefined,
        newValues: `${nextConfig.upiId} (${nextConfig.payeeName}, ${nextConfig.status})`,
        timestamp: nowIso,
      });
    });

    return nextConfig;
  }

  private async internalGenerateOrSyncPeriod(
    db: ReturnType<typeof requireFirestoreDb>,
    adminUids: string[],
    adminId: string,
    config: FeeConfiguration,
    feePeriod: string,
    updateEligibleUnpaid: boolean
  ): Promise<{ createdCount: number; skippedCount: number; updatedUnpaidCount: number }> {
    const [studentsSnap, feeSnap, vpSnap, claimsSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'users'),
          where('role', '==', 'student'),
          where('status', '==', 'active')
        )
      ),
      getDocs(query(collection(db, 'studentFeeAccounts'), where('feePeriod', '==', feePeriod))),
      getDocs(query(collection(db, 'verifiedPayments'), where('feePeriod', '==', feePeriod))),
      getDocs(query(collection(db, 'paymentClaims'), where('feePeriod', '==', feePeriod))),
    ]);

    const existingAccounts = feeSnap.docs.map((d) => d.data() as FirestoreFeeAccountDoc);
    const verifiedPayments = vpSnap.docs.map((d) => d.data() as VerifiedPayment);
    const claims = claimsSnap.docs.map((d) => d.data() as PaymentClaim);

    const nowIso = new Date().toISOString();
    const today = getTodayIsoDate();
    const dueAt = computeDueDateForPeriod(config, feePeriod);
    const periodLabel = formatPeriodLabel(feePeriod);

    let createdCount = 0;
    let skippedCount = 0;
    let updatedUnpaidCount = 0;

    for (const stuDoc of studentsSnap.docs) {
      const stu = stuDoc.data();
      const studentId = String(stu.accountId || '').toUpperCase();
      const studentUid = stuDoc.id;

      const existing = existingAccounts.find((a) => a.studentId.toUpperCase() === studentId);
      if (existing) {
        const computed = computeStatusFromRecords(existing, verifiedPayments, claims);
        const canSafelyUpdateUnpaid =
          updateEligibleUnpaid &&
          periodStartDate(feePeriod) >= config.effectiveFrom.slice(0, 7) + '-01' &&
          computed.verifiedPaidPaise === 0 &&
          computed.pendingClaimsCount === 0 &&
          (existing.amountDuePaise !== config.amountPaise ||
            existing.feeConfigurationId !== config.id ||
            existing.dueAt !== dueAt);

        if (canSafelyUpdateUnpaid) {
          const prevSummary = `${existing.feeConfigurationId} ${formatInrFromPaise(existing.amountDuePaise)}`;
          const nextAcc: FirestoreFeeAccountDoc = {
            ...existing,
            feeConfigurationId: config.id,
            frequency: config.frequency,
            amountDuePaise: config.amountPaise,
            remainingBalancePaise: config.amountPaise,
            dueAt,
            updatedAt: nowIso,
          };
          nextAcc.status = computeStatusFromRecords(nextAcc, verifiedPayments, claims).status;
          await setDoc(doc(db, 'studentFeeAccounts', nextAcc.id), stripUndefinedFields({ ...nextAcc }));
          await writeFinancialAudit(db, adminUids, {
            entityType: 'fee_account',
            entityId: nextAcc.id,
            actorId: adminId,
            action: 'unpaid_fee_account_synced_to_new_config',
            previousValues: prevSummary,
            newValues: `${config.id} ${formatInrFromPaise(config.amountPaise)} due ${dueAt}`,
            reason: `Applied ${config.id} (effective ${config.effectiveFrom}) to unpaid period`,
            timestamp: nowIso,
          });
          updatedUnpaidCount++;
        } else {
          skippedCount++;
        }
        continue;
      }

      const id = generateSafeDocId('FEE');
      const created: FirestoreFeeAccountDoc = {
        id,
        studentId,
        studentUid,
        feeConfigurationId: config.id,
        feePeriod,
        periodLabel,
        frequency: config.frequency,
        amountDuePaise: config.amountPaise,
        verifiedAmountPaidPaise: 0,
        remainingBalancePaise: config.amountPaise,
        dueAt,
        status: today > dueAt ? 'overdue' : 'unpaid',
        adminUids,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(doc(db, 'studentFeeAccounts', id), stripUndefinedFields({ ...created }));
      createdCount++;
    }

    return { createdCount, skippedCount, updatedUnpaidCount };
  }

  async generateFeeAccountsForPeriod(
    actor: AuthPrincipal | null,
    feePeriod: string
  ): Promise<{ createdCount: number; skippedCount: number }> {
    const admin = ensureRole(actor, ['admin']);
    const activeConfig = await this.getActiveFeeConfiguration(admin);
    if (!activeConfig) {
      throw new FinanceServiceError(
        'NO_ACTIVE_CONFIG',
        'Please save an active Fee Configuration before generating student fee accounts.'
      );
    }

    const trimmed = feePeriod.trim();
    const periodCheck =
      activeConfig.frequency === 'monthly'
        ? validateMonthlyPeriod(trimmed)
        : validateYearlyPeriod(trimmed);
    if (!periodCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', periodCheck.error!, 'feePeriod');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const res = await this.internalGenerateOrSyncPeriod(
      db,
      adminUids,
      admin.loginId,
      activeConfig,
      trimmed,
      false
    );
    return { createdCount: res.createdCount, skippedCount: res.skippedCount };
  }

  async listAdminStudentFeeAccounts(
    actor: AuthPrincipal | null,
    filter?: StudentFeeAccountsFilter
  ): Promise<StudentFeeAccountView[]> {
    ensureRole(actor, ['admin']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'studentFeeAccounts', async () => {
      const [feeSnap, vpSnap, claimsSnap, recSnap, placements] = await Promise.all([
        getDocs(collection(db, 'studentFeeAccounts')),
        getDocs(collection(db, 'verifiedPayments')),
        getDocs(collection(db, 'paymentClaims')),
        getDocs(collection(db, 'paymentReceipts')),
        loadPlacementMapForAdmin(db),
      ]);

      const verifiedPayments = vpSnap.docs.map((d) => d.data() as VerifiedPayment);
      const claims = claimsSnap.docs.map((d) => d.data() as PaymentClaim);
      const receipts = recSnap.docs.map((d) => d.data() as FeeReceipt);

      let views = feeSnap.docs.map((d) => {
        const acc = d.data() as StudentFeeAccount;
        return toViewAccount(
          acc,
          placements.get(acc.studentId.toUpperCase()),
          verifiedPayments,
          claims,
          receipts
        );
      });

      if (filter?.search && filter.search.trim()) {
        const q = filter.search.trim().toLowerCase();
        views = views.filter(
          (v) =>
            v.account.studentId.toLowerCase().includes(q) ||
            v.studentName.toLowerCase().includes(q) ||
            v.account.id.toLowerCase().includes(q)
        );
      }
      if (filter?.classId && filter.classId !== 'all') {
        views = views.filter((v) => v.classId === filter.classId);
      }
      if (filter?.batchId && filter.batchId !== 'all') {
        views = views.filter((v) => v.batchId === filter.batchId);
      }
      if (filter?.feePeriod && filter.feePeriod !== 'all') {
        views = views.filter((v) => v.account.feePeriod === filter.feePeriod);
      }
      if (filter?.status && filter.status !== 'all') {
        views = views.filter((v) => v.account.status === filter.status);
      }

      return views.sort(
        (a, b) =>
          b.account.feePeriod.localeCompare(a.account.feePeriod) ||
          a.account.studentId.localeCompare(b.account.studentId)
      );
    });
  }

  async getStudentFeeDashboard(actor: AuthPrincipal | null): Promise<StudentFeeDashboardData> {
    const student = ensureRole(actor, ['student']);
    const db = requireFirestoreDb();
    const studentIdUpper = student.loginId.trim().toUpperCase();

    return withFirestoreErrorHandling(OperationType.LIST, 'studentFeeDashboard', async () => {
      const [
        activeFeeConfig,
        upiConfig,
        feeSnap,
        vpSnap,
        claimsSnap,
        recSnap,
        notifSnap,
        placement,
      ] = await Promise.all([
        this.getActiveFeeConfiguration(student),
        this.getUpiConfiguration(student),
        getDocs(query(collection(db, 'studentFeeAccounts'), where('studentUid', '==', student.uid))),
        getDocs(query(collection(db, 'verifiedPayments'), where('studentUid', '==', student.uid))),
        getDocs(query(collection(db, 'paymentClaims'), where('studentUid', '==', student.uid))),
        getDocs(query(collection(db, 'paymentReceipts'), where('studentUid', '==', student.uid))),
        getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', student.uid))),
        loadPlacementForSingleStudent(db, student.uid, studentIdUpper),
      ]);

      const rawAccounts = feeSnap.docs.map((d) => d.data() as FirestoreFeeAccountDoc);
      const verifiedPayments = vpSnap.docs.map((d) => d.data() as VerifiedPayment);
      const claims = claimsSnap.docs.map((d) => d.data() as PaymentClaim);
      const receipts = recSnap.docs
        .map((d) => d.data() as FeeReceipt)
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

      const todayIso = getTodayIsoDate();
      const todayMs = new Date(`${todayIso}T00:00:00Z`).getTime();
      const leadDays = activeFeeConfig?.reminderLeadDays ?? 5;
      const existingDedupeKeys = new Set(
        notifSnap.docs.map((d) => String(d.data().dedupeKey || ''))
      );

      // Generate due-date in-app notifications idempotently if missing
      const adminUids =
        rawAccounts[0]?.adminUids?.length ? rawAccounts[0].adminUids : await getActiveAdminUids(db);
      let newReminderCreated = false;
      for (const acc of rawAccounts) {
        const computed = computeStatusFromRecords(acc, verifiedPayments, claims, todayIso);
        if (computed.remainingBalancePaise <= 0) continue;
        const dueMs = new Date(`${acc.dueAt}T00:00:00Z`).getTime();
        if (Number.isNaN(dueMs) || Number.isNaN(todayMs)) continue;
        const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          const dedupeKey = `overdue_fee:${acc.id}:${acc.dueAt}`;
          if (!existingDedupeKeys.has(dedupeKey)) {
            await enqueueFirebaseFinancialNotification(db, adminUids, {
              recipientId: studentIdUpper,
              recipientUid: student.uid,
              recipientRole: 'student',
              notificationType: 'overdue_fee',
              relatedRecordId: acc.id,
              dedupeKey,
              title: `Overdue Fee — ${acc.periodLabel}`,
              message: `Remaining balance of ${formatInrFromPaise(computed.remainingBalancePaise)} was due on ${acc.dueAt}.`,
            });
            newReminderCreated = true;
          }
        } else if (diffDays === 0) {
          const dedupeKey = `due_today:${acc.id}:${acc.dueAt}`;
          if (!existingDedupeKeys.has(dedupeKey)) {
            await enqueueFirebaseFinancialNotification(db, adminUids, {
              recipientId: studentIdUpper,
              recipientUid: student.uid,
              recipientRole: 'student',
              notificationType: 'due_today',
              relatedRecordId: acc.id,
              dedupeKey,
              title: `Fee Due Today — ${acc.periodLabel}`,
              message: `Remaining balance of ${formatInrFromPaise(computed.remainingBalancePaise)} is due today (${acc.dueAt}).`,
            });
            newReminderCreated = true;
          }
        } else if (diffDays <= leadDays) {
          const dedupeKey = `upcoming_due:${acc.id}:${acc.dueAt}`;
          if (!existingDedupeKeys.has(dedupeKey)) {
            await enqueueFirebaseFinancialNotification(db, adminUids, {
              recipientId: studentIdUpper,
              recipientUid: student.uid,
              recipientRole: 'student',
              notificationType: 'upcoming_due',
              relatedRecordId: acc.id,
              dedupeKey,
              title: `Upcoming Fee Due — ${acc.periodLabel}`,
              message: `Remaining balance of ${formatInrFromPaise(computed.remainingBalancePaise)} is due on ${acc.dueAt} (in ${diffDays} day${diffDays === 1 ? '' : 's'}).`,
            });
            newReminderCreated = true;
          }
        }
      }

      const finalNotifSnap = newReminderCreated
        ? await getDocs(
            query(collection(db, 'notifications'), where('recipientUid', '==', student.uid))
          )
        : notifSnap;

      const accounts = rawAccounts
        .map((a) => toViewAccount(a, placement, verifiedPayments, claims, receipts))
        .sort((a, b) => b.account.feePeriod.localeCompare(a.account.feePeriod));

      const accountMap = new Map(rawAccounts.map((a) => [a.id, a]));
      const claimViews = [...claims]
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        .map((c) => toClaimDetailView(c, placement, accountMap.get(c.feeAccountId), verifiedPayments, receipts));

      const notifications = finalNotifSnap.docs
        .filter((d) => {
          const cat = d.data().category;
          const t = String(d.data().type || '');
          return (
            cat === 'fees_receipts' ||
            [
              'upcoming_due',
              'due_today',
              'overdue_fee',
              'claim_received',
              'payment_verified',
              'payment_rejected',
              'receipt_issued',
            ].includes(t)
          );
        })
        .map((d) => mapDocToFinancialNotification(d.id, d.data()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return {
        activeFeeConfig,
        upiConfig,
        accounts,
        totalDuePaise: accounts.reduce((s, v) => s + v.account.amountDuePaise, 0),
        totalVerifiedPaidPaise: accounts.reduce((s, v) => s + v.account.verifiedAmountPaidPaise, 0),
        totalPendingClaimsPaise: accounts.reduce((s, v) => s + v.pendingClaimsPaise, 0),
        totalRemainingBalancePaise: accounts.reduce((s, v) => s + v.account.remainingBalancePaise, 0),
        notifications,
        unreadNotificationCount: notifications.filter((n) => !n.readAt).length,
        receipts,
        claims: claimViews,
      };
    });
  }

  async listMyFinancialNotifications(
    actor: AuthPrincipal | null
  ): Promise<FinancialNotification[]> {
    const active = ensureRole(actor, ['admin', 'teacher', 'student']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'notifications', async () => {
      const snap =
        active.role === 'admin'
          ? await getDocs(
              query(collection(db, 'notifications'), where('recipientRole', '==', 'admin'))
            )
          : await getDocs(
              query(collection(db, 'notifications'), where('recipientUid', '==', active.uid))
            );
      return snap.docs
        .filter((d) => {
          const cat = d.data().category;
          const t = String(d.data().type || '');
          return (
            cat === 'fees_receipts' ||
            [
              'upcoming_due',
              'due_today',
              'overdue_fee',
              'claim_received',
              'payment_verified',
              'payment_rejected',
              'receipt_issued',
            ].includes(t)
          );
        })
        .map((d) => mapDocToFinancialNotification(d.id, d.data()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  async markFinancialNotificationRead(
    actor: AuthPrincipal | null,
    notificationId: string
  ): Promise<FinancialNotification> {
    const active = ensureRole(actor, ['admin', 'teacher', 'student']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'notifications', notificationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Financial notification not found.');
    }
    const data = snap.data();
    const allowed =
      active.role === 'admin' || String(data.recipientUid || '') === active.uid;
    if (!allowed) {
      throw new FinanceServiceError('UNAUTHORIZED', 'Access denied to another user notification.');
    }
    const readAt = typeof data.readAt === 'string' && data.readAt ? data.readAt : new Date().toISOString();
    await updateDoc(ref, { readAt });
    return mapDocToFinancialNotification(snap.id, { ...data, readAt });
  }

  async markAllFinancialNotificationsRead(actor: AuthPrincipal | null): Promise<void> {
    const active = ensureRole(actor, ['admin', 'teacher', 'student']);
    const db = requireFirestoreDb();
    const nowIso = new Date().toISOString();
    const snap =
      active.role === 'admin'
        ? await getDocs(query(collection(db, 'notifications'), where('recipientRole', '==', 'admin')))
        : await getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', active.uid)));

    for (const d of snap.docs) {
      const cat = d.data().category;
      const t = String(d.data().type || '');
      const isFinance =
        cat === 'fees_receipts' ||
        [
          'upcoming_due',
          'due_today',
          'overdue_fee',
          'claim_received',
          'payment_verified',
          'payment_rejected',
          'receipt_issued',
        ].includes(t);
      if (isFinance && !d.data().readAt) {
        await updateDoc(d.ref, { readAt: nowIso });
      }
    }
  }
}

// ===========================================================================
// 2. UPI Preparation, Student Payment Claims & Admin Verification
// ===========================================================================
export class FirebasePaymentService implements IPaymentClaimService, IPaymentVerificationService {
  private readonly feeService = new FirebaseFeeService();

  async prepareUpiPayment(
    actor: AuthPrincipal | null,
    input: PrepareUpiPaymentInput
  ): Promise<PreparedUpiPayment> {
    const student = ensureRole(actor, ['student']);
    const studentIdUpper = student.loginId.trim().toUpperCase();
    const db = requireFirestoreDb();

    const accSnap = await getDoc(doc(db, 'studentFeeAccounts', input.feeAccountId));
    if (!accSnap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Fee account not found.', 'feeAccountId');
    }
    const account = accSnap.data() as FirestoreFeeAccountDoc;
    if (account.studentUid !== student.uid) {
      throw new FinanceServiceError(
        'UNAUTHORIZED',
        'You may only prepare payments for your own fee account.'
      );
    }

    const upiConfig = await this.feeService.getUpiConfiguration(student);
    if (!upiConfig || upiConfig.status !== 'active') {
      throw new FinanceServiceError(
        'UPI_DISABLED',
        'Tuition centre UPI payment details are not currently active. Please contact Admin.'
      );
    }

    const vpSnap = await getDocs(
      query(collection(db, 'verifiedPayments'), where('feeAccountId', '==', account.id))
    );
    const claimsSnap = await getDocs(
      query(collection(db, 'paymentClaims'), where('feeAccountId', '==', account.id))
    );
    const computed = computeStatusFromRecords(
      account,
      vpSnap.docs.map((d) => d.data() as VerifiedPayment),
      claimsSnap.docs.map((d) => d.data() as PaymentClaim)
    );
    if (computed.remainingBalancePaise <= 0) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        'This fee period has already been fully paid.'
      );
    }

    const amountPaise = rupeesToPaise(input.amountRupees);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Payment amount must be greater than zero.',
        'amountRupees'
      );
    }
    if (amountPaise > computed.remainingBalancePaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Requested amount (${formatInrFromPaise(amountPaise)}) exceeds remaining balance (${formatInrFromPaise(computed.remainingBalancePaise)}).`,
        'amountRupees'
      );
    }

    const idempotencyKey =
      input.idempotencyKey?.trim() || `${studentIdUpper}:${account.id}:${amountPaise}`;

    const prepSnap = await getDocs(
      query(
        collection(db, 'preparedUpiPayments'),
        where('studentUid', '==', student.uid),
        where('feeAccountId', '==', account.id)
      )
    );
    const existingPrepared = prepSnap.docs
      .map((d) => d.data() as PreparedUpiPayment)
      .find(
        (p) =>
          p.amountPaise === amountPaise &&
          p.idempotencyKey === idempotencyKey &&
          p.status === 'payment_prepared'
      );
    if (existingPrepared) {
      return existingPrepared;
    }

    const id = generateSafeDocId('PREQ');
    const cleanPeriod = account.feePeriod.replace(/[^0-9A-Za-z]/g, '');
    const paymentReference = `PAYREF-${cleanPeriod}-${id.slice(-4)}`;
    const description = upiConfig.description
      ? `${upiConfig.description} (${account.feePeriod} · ${studentIdUpper})`
      : `Tuition Fee ${account.feePeriod} (${studentIdUpper})`;

    const amountStr = paiseToUpiAmountString(amountPaise);
    const upiUri =
      `upi://pay?pa=${encodeURIComponent(upiConfig.upiId)}` +
      `&pn=${encodeURIComponent(upiConfig.payeeName)}` +
      `&am=${encodeURIComponent(amountStr)}` +
      `&cu=INR` +
      `&tn=${encodeURIComponent(description)}` +
      `&tr=${encodeURIComponent(paymentReference)}`;

    const prepared: FirestorePreparedUpiDoc = {
      id,
      paymentReference,
      studentId: studentIdUpper,
      studentUid: student.uid,
      feeAccountId: account.id,
      feePeriod: account.feePeriod,
      amountPaise,
      upiId: upiConfig.upiId,
      payeeName: upiConfig.payeeName,
      description,
      upiUri,
      paymentType: amountPaise === computed.remainingBalancePaise ? 'full' : 'partial',
      status: 'payment_prepared',
      idempotencyKey,
      preparedAt: new Date().toISOString(),
      adminUids: account.adminUids?.length ? account.adminUids : await getActiveAdminUids(db),
    };

    await withFirestoreErrorHandling(
      OperationType.CREATE,
      `preparedUpiPayments/${id}`,
      async () => {
        await setDoc(doc(db, 'preparedUpiPayments', id), stripUndefinedFields({ ...prepared }));
      }
    );

    return prepared;
  }

  async submitPaymentClaim(
    actor: AuthPrincipal | null,
    input: SubmitPaymentClaimInput
  ): Promise<PaymentClaimDetailView> {
    const student = ensureRole(actor, ['student']);
    const studentIdUpper = student.loginId.trim().toUpperCase();
    const db = requireFirestoreDb();

    const accSnap = await getDoc(doc(db, 'studentFeeAccounts', input.feeAccountId));
    if (!accSnap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Fee account not found.', 'feeAccountId');
    }
    const account = accSnap.data() as FirestoreFeeAccountDoc;
    if (account.studentUid !== student.uid) {
      throw new FinanceServiceError(
        'UNAUTHORIZED',
        'Access denied. You can only submit payment claims for your own fee account.'
      );
    }

    const amountPaise = rupeesToPaise(input.amountRupees);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Claimed amount must be greater than zero.',
        'amountRupees'
      );
    }

    const [vpSnap, myClaimsSnap, placement] = await Promise.all([
      getDocs(query(collection(db, 'verifiedPayments'), where('studentUid', '==', student.uid))),
      getDocs(query(collection(db, 'paymentClaims'), where('studentUid', '==', student.uid))),
      loadPlacementForSingleStudent(db, student.uid, studentIdUpper),
    ]);
    const myVps = vpSnap.docs.map((d) => d.data() as VerifiedPayment);
    const myClaims = myClaimsSnap.docs.map((d) => d.data() as PaymentClaim);
    const computed = computeStatusFromRecords(account, myVps, myClaims);

    if (amountPaise > computed.remainingBalancePaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Claimed amount (${formatInrFromPaise(amountPaise)}) exceeds remaining fee balance (${formatInrFromPaise(computed.remainingBalancePaise)}).`,
        'amountRupees'
      );
    }
    if (computed.pendingClaimsPaise + amountPaise > computed.remainingBalancePaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `You already have ${formatInrFromPaise(computed.pendingClaimsPaise)} pending verification. Combined pending claims cannot exceed remaining balance (${formatInrFromPaise(computed.remainingBalancePaise)}).`,
        'amountRupees'
      );
    }

    const utrCheck = validateTransactionReference(input.transactionReference);
    if (!utrCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', utrCheck.error!, 'transactionReference');
    }
    const dateCheck = validateIsoDate(input.paymentDate, 'Payment date');
    if (!dateCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', dateCheck.error!, 'paymentDate');
    }

    let resolvedPaymentRef = input.paymentReference?.trim() || '';
    if (input.preparedPaymentId) {
      const prepSnap = await getDoc(doc(db, 'preparedUpiPayments', input.preparedPaymentId));
      if (!prepSnap.exists()) {
        throw new FinanceServiceError('INVALID_REFERENCE', 'Prepared payment request not found.');
      }
      const prep = prepSnap.data() as FirestorePreparedUpiDoc;
      if (prep.studentUid !== student.uid || prep.feeAccountId !== account.id) {
        throw new FinanceServiceError('UNAUTHORIZED', 'Prepared payment reference mismatch.');
      }
      if (prep.status === 'claim_submitted') {
        throw new FinanceServiceError(
          'DUPLICATE_CLAIM',
          'A payment claim has already been submitted for this payment reference.'
        );
      }
      resolvedPaymentRef = prep.paymentReference;
    }

    const normalizedUtr = input.transactionReference.trim().toUpperCase();
    const dupClaimIds = Array.from(
      new Set([
        ...myClaims
          .filter((c) => c.transactionReference.trim().toUpperCase() === normalizedUtr)
          .map((c) => c.id),
        ...myVps
          .filter((v) => v.transactionReference.trim().toUpperCase() === normalizedUtr)
          .map((v) => v.paymentClaimId),
      ])
    );
    const duplicateTransactionFlag = dupClaimIds.length > 0;

    const claimId = generateSafeDocId('PCLM');
    if (!resolvedPaymentRef) {
      const cleanPeriod = account.feePeriod.replace(/[^0-9A-Za-z]/g, '');
      resolvedPaymentRef = `PAYREF-${cleanPeriod}-${claimId.slice(-4)}`;
    }

    const adminUids =
      account.adminUids?.length ? account.adminUids : await getActiveAdminUids(db);
    const nowIso = new Date().toISOString();

    const claim: FirestorePaymentClaimDoc = {
      id: claimId,
      paymentReference: resolvedPaymentRef,
      preparedPaymentId: input.preparedPaymentId,
      studentId: studentIdUpper,
      studentUid: student.uid,
      feeAccountId: account.id,
      feePeriod: account.feePeriod,
      amountPaise,
      transactionReference: input.transactionReference.trim(),
      paymentDate: input.paymentDate.trim(),
      studentNote: input.studentNote?.trim() || undefined,
      status: 'verification_pending',
      duplicateTransactionFlag,
      duplicateOfClaimIds: duplicateTransactionFlag ? dupClaimIds : undefined,
      submittedAt: nowIso,
      adminUids,
    };

    await withFirestoreErrorHandling(OperationType.CREATE, `paymentClaims/${claimId}`, async () => {
      await setDoc(doc(db, 'paymentClaims', claimId), stripUndefinedFields({ ...claim }));
      if (input.preparedPaymentId) {
        await updateDoc(doc(db, 'preparedUpiPayments', input.preparedPaymentId), {
          status: 'claim_submitted',
          claimId: claim.id,
        });
      }
      await writePaymentVerificationAudit(db, adminUids, {
        paymentClaimId: claim.id,
        actorId: studentIdUpper,
        action: 'claim_submitted',
        newValues: `amountPaise=${claim.amountPaise}, utr=${claim.transactionReference}, dupFlag=${duplicateTransactionFlag}`,
        reason: claim.studentNote,
        timestamp: nowIso,
      });
      await writeFinancialAudit(db, adminUids, {
        entityType: 'payment_claim',
        entityId: claim.id,
        actorId: studentIdUpper,
        action: 'payment_claim_submitted',
        newValues: `ref=${claim.paymentReference}, amount=${formatInrFromPaise(claim.amountPaise)}, utr=${claim.transactionReference}`,
        timestamp: nowIso,
      });
      await enqueueFirebaseFinancialNotification(db, adminUids, {
        recipientId: studentIdUpper,
        recipientUid: student.uid,
        recipientRole: 'student',
        notificationType: 'claim_received',
        relatedRecordId: claim.id,
        dedupeKey: `claim_received:${claim.id}:${studentIdUpper}`,
        title: 'Payment Claim Submitted — Pending Verification',
        message: `Claim ${claim.paymentReference} for ${formatInrFromPaise(claim.amountPaise)} (${account.periodLabel}) was received. Your fee balance remains unchanged until Admin verifies the transaction.`,
      });
      if (adminUids[0]) {
        await enqueueFirebaseFinancialNotification(db, adminUids, {
          recipientId: 'ADM-0001',
          recipientUid: adminUids[0],
          recipientRole: 'admin',
          notificationType: 'claim_received',
          relatedRecordId: claim.id,
          dedupeKey: `claim_received:${claim.id}:ADM-0001`,
          title: `New Fee Claim Pending Verification (${claim.id})`,
          message: `${studentIdUpper} submitted ${formatInrFromPaise(claim.amountPaise)} for ${account.periodLabel} · UTR: ${claim.transactionReference}${duplicateTransactionFlag ? ' (DUPLICATE UTR FLAGGED)' : ''}.`,
        });
      }
    });

    return toClaimDetailView(claim, placement, account, myVps, []);
  }

  async listAdminPaymentClaims(
    actor: AuthPrincipal | null,
    statusFilter: 'all' | 'verification_pending' | 'verified' | 'rejected' = 'all'
  ): Promise<PaymentClaimDetailView[]> {
    ensureRole(actor, ['admin']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'paymentClaims', async () => {
      const [claimsSnap, feeSnap, vpSnap, recSnap, placements] = await Promise.all([
        getDocs(collection(db, 'paymentClaims')),
        getDocs(collection(db, 'studentFeeAccounts')),
        getDocs(collection(db, 'verifiedPayments')),
        getDocs(collection(db, 'paymentReceipts')),
        loadPlacementMapForAdmin(db),
      ]);

      const accounts = new Map(feeSnap.docs.map((d) => [d.id, d.data() as StudentFeeAccount]));
      const verifiedPayments = vpSnap.docs.map((d) => d.data() as VerifiedPayment);
      const receipts = recSnap.docs.map((d) => d.data() as FeeReceipt);

      let claims = claimsSnap.docs.map((d) => d.data() as PaymentClaim);
      if (statusFilter !== 'all') {
        claims = claims.filter((c) => c.status === statusFilter);
      }

      // Compute duplicate UTR awareness dynamically for Admin review
      const utrCounts = new Map<string, string[]>();
      for (const c of claimsSnap.docs.map((d) => d.data() as PaymentClaim)) {
        const key = c.transactionReference.trim().toUpperCase();
        const arr = utrCounts.get(key) ?? [];
        arr.push(c.id);
        utrCounts.set(key, arr);
      }

      return claims
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        .map((c) => {
          const dupIds = (utrCounts.get(c.transactionReference.trim().toUpperCase()) ?? []).filter(
            (id) => id !== c.id
          );
          const enrichedClaim: PaymentClaim =
            dupIds.length > 0
              ? { ...c, duplicateTransactionFlag: true, duplicateOfClaimIds: dupIds }
              : c;
          return toClaimDetailView(
            enrichedClaim,
            placements.get(c.studentId.toUpperCase()),
            accounts.get(c.feeAccountId),
            verifiedPayments,
            receipts
          );
        });
    });
  }

  async verifyPaymentClaim(
    actor: AuthPrincipal | null,
    input: {
      claimId: string;
      confirmIndependentCheck: boolean;
      verificationNote?: string;
    }
  ): Promise<{
    claim: PaymentClaimDetailView;
    verifiedPayment: VerifiedPayment;
    receipt: FeeReceipt;
  }> {
    const admin = ensureRole(actor, ['admin']);
    if (!input.confirmIndependentCheck) {
      throw new FinanceServiceError(
        'CONFIRMATION_REQUIRED',
        'Explicit confirmation that you independently checked the transaction outside this app is required before verifying.',
        'confirmIndependentCheck'
      );
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const centreName = await resolveCentreName(db);
    const nowIso = new Date().toISOString();

    const preClaimSnap = await getDoc(doc(db, 'paymentClaims', input.claimId));
    if (!preClaimSnap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Payment claim not found.', 'claimId');
    }
    const preClaim = preClaimSnap.data() as FirestorePaymentClaimDoc;
    const [accountVpsSnap, accountClaimsSnap, placement] = await Promise.all([
      getDocs(
        query(collection(db, 'verifiedPayments'), where('feeAccountId', '==', preClaim.feeAccountId))
      ),
      getDocs(
        query(collection(db, 'paymentClaims'), where('feeAccountId', '==', preClaim.feeAccountId))
      ),
      loadPlacementForSingleStudent(db, preClaim.studentUid, preClaim.studentId),
    ]);

    const otherVps = accountVpsSnap.docs.map((d) => d.data() as VerifiedPayment);
    const otherClaims = accountClaimsSnap.docs.map((d) => d.data() as PaymentClaim);

    const txResult = await withFirestoreErrorHandling(
      OperationType.WRITE,
      `paymentClaims/${input.claimId}`,
      async () =>
        runTransaction(db, async (tx) => {
          const claimRef = doc(db, 'paymentClaims', input.claimId);
          const claimSnap = await tx.get(claimRef);
          if (!claimSnap.exists()) {
            throw new FinanceServiceError('NOT_FOUND', 'Payment claim not found.', 'claimId');
          }
          const claim = claimSnap.data() as FirestorePaymentClaimDoc;
          if (claim.status === 'verified') {
            throw new FinanceServiceError(
              'DUPLICATE_VERIFICATION',
              'This payment claim has already been verified.'
            );
          }
          if (claim.status === 'rejected') {
            throw new FinanceServiceError(
              'VALIDATION_ERROR',
              'Rejected payment claims cannot be verified. Student must submit a fresh claim.'
            );
          }

          const accRef = doc(db, 'studentFeeAccounts', claim.feeAccountId);
          const accSnap = await tx.get(accRef);
          if (!accSnap.exists()) {
            throw new FinanceServiceError('NOT_FOUND', 'Linked student fee account not found.');
          }
          const account = accSnap.data() as FirestoreFeeAccountDoc;

          const currentPaid = otherVps.reduce((sum, v) => sum + v.amountPaise, 0);
          const currentRemaining = Math.max(0, account.amountDuePaise - currentPaid);
          if (claim.amountPaise > currentRemaining) {
            throw new FinanceServiceError(
              'OVERPAYMENT_NOT_ALLOWED',
              `Claim amount (${formatInrFromPaise(claim.amountPaise)}) exceeds current remaining balance (${formatInrFromPaise(currentRemaining)}).`
            );
          }

          const vpId = generateSafeDocId('VPAY');
          const recId = generateSafeDocId('REC');
          const yearStr = claim.paymentDate.slice(0, 4) || new Date().getFullYear().toString();
          const receiptNumber = `RCP-${yearStr}-${recId.slice(-4)}`;
          const note = input.verificationNote?.trim() || undefined;

          const verifiedClaim: FirestorePaymentClaimDoc = {
            ...claim,
            status: 'verified',
            verifiedBy: admin.loginId,
            verifiedAt: nowIso,
            verificationNote: note,
          };

          const verifiedPayment: FirestoreVerifiedPaymentDoc = {
            id: vpId,
            paymentClaimId: claim.id,
            paymentReference: claim.paymentReference,
            studentId: claim.studentId,
            studentUid: claim.studentUid,
            feeAccountId: claim.feeAccountId,
            feePeriod: claim.feePeriod,
            amountPaise: claim.amountPaise,
            transactionReference: claim.transactionReference,
            paymentDate: claim.paymentDate,
            verifiedBy: admin.loginId,
            verifiedAt: nowIso,
            verificationNote: note,
            adminUids,
          };

          const nextVerifiedPaid = currentPaid + claim.amountPaise;
          const nextRemaining = Math.max(0, account.amountDuePaise - nextVerifiedPaid);
          const remainingClaimsPending = otherClaims.some(
            (c) => c.id !== claim.id && c.status === 'verification_pending'
          );
          const nextStatus: StudentFeeAccountStatus =
            nextRemaining <= 0
              ? 'paid'
              : remainingClaimsPending
                ? 'verification_pending'
                : getTodayIsoDate() > account.dueAt
                  ? 'overdue'
                  : 'partially_paid';

          const receipt: FirestoreReceiptDoc = {
            id: recId,
            receiptNumber,
            verifiedPaymentId: vpId,
            paymentClaimId: claim.id,
            paymentReference: claim.paymentReference,
            transactionReference: claim.transactionReference,
            centreName,
            studentId: claim.studentId,
            studentUid: claim.studentUid,
            studentName: placement.studentName,
            className: placement.className,
            batchName: placement.batchName,
            feePeriod: account.feePeriod,
            periodLabel: account.periodLabel,
            paymentDate: claim.paymentDate,
            amountPaise: claim.amountPaise,
            totalFeeDuePaise: account.amountDuePaise,
            totalAmountPaidAfterPaise: nextVerifiedPaid,
            remainingBalancePaise: nextRemaining,
            verificationStatus: 'verified',
            issuedBy: admin.loginId,
            issuedAt: nowIso,
            status: 'issued',
            adminUids,
          };

          tx.set(claimRef, stripUndefinedFields({ ...verifiedClaim }));
          tx.set(doc(db, 'verifiedPayments', vpId), stripUndefinedFields({ ...verifiedPayment }));
          tx.update(accRef, {
            verifiedAmountPaidPaise: nextVerifiedPaid,
            remainingBalancePaise: nextRemaining,
            status: nextStatus,
            updatedAt: nowIso,
          });
          tx.set(doc(db, 'paymentReceipts', recId), stripUndefinedFields({ ...receipt }));

          return { verifiedClaim, verifiedPayment, receipt, account, currentRemaining, nextRemaining };
        })
    );

    await writePaymentVerificationAudit(db, adminUids, {
      paymentClaimId: txResult.verifiedClaim.id,
      verifiedPaymentId: txResult.verifiedPayment.id,
      actorId: admin.loginId,
      action: 'payment_verified',
      previousValues: `status=verification_pending, remaining=${txResult.currentRemaining}`,
      newValues: `status=verified, amountPaise=${txResult.verifiedPayment.amountPaise}, remaining=${txResult.nextRemaining}, receipt=${txResult.receipt.receiptNumber}`,
      reason: txResult.verifiedClaim.verificationNote ?? 'Independently verified by Admin',
      timestamp: nowIso,
    });

    await writeFinancialAudit(db, adminUids, {
      entityType: 'verified_payment',
      entityId: txResult.verifiedPayment.id,
      actorId: admin.loginId,
      action: 'payment_verified_and_receipt_issued',
      previousValues: `remaining=${formatInrFromPaise(txResult.currentRemaining)}`,
      newValues: `verified=${formatInrFromPaise(txResult.verifiedPayment.amountPaise)}, remaining=${formatInrFromPaise(txResult.nextRemaining)}, receipt=${txResult.receipt.receiptNumber}`,
      reason: txResult.verifiedClaim.verificationNote,
      timestamp: nowIso,
    });

    await enqueueFirebaseFinancialNotification(db, adminUids, {
      recipientId: txResult.verifiedPayment.studentId,
      recipientUid: txResult.verifiedPayment.studentUid,
      recipientRole: 'student',
      notificationType: 'payment_verified',
      relatedRecordId: txResult.verifiedPayment.id,
      dedupeKey: `payment_verified:${txResult.verifiedPayment.id}:${txResult.verifiedPayment.studentId}`,
      title: `Payment Verified (${txResult.account.periodLabel})`,
      message: `Your payment of ${formatInrFromPaise(txResult.verifiedPayment.amountPaise)} (Ref: ${txResult.verifiedPayment.paymentReference}) is verified. Remaining balance: ${formatInrFromPaise(txResult.nextRemaining)}.`,
    });

    await enqueueFirebaseFinancialNotification(db, adminUids, {
      recipientId: txResult.verifiedPayment.studentId,
      recipientUid: txResult.verifiedPayment.studentUid,
      recipientRole: 'student',
      notificationType: 'receipt_issued',
      relatedRecordId: txResult.receipt.id,
      dedupeKey: `receipt_issued:${txResult.receipt.id}:${txResult.verifiedPayment.studentId}`,
      title: `Digital Receipt Ready (${txResult.receipt.receiptNumber})`,
      message: `Receipt ${txResult.receipt.receiptNumber} for ${formatInrFromPaise(txResult.receipt.amountPaise)} is now available in Fees & Receipts.`,
    });

    return {
      claim: toClaimDetailView(
        txResult.verifiedClaim,
        placement,
        txResult.account,
        [txResult.verifiedPayment],
        [txResult.receipt]
      ),
      verifiedPayment: txResult.verifiedPayment,
      receipt: txResult.receipt,
    };
  }

  async rejectPaymentClaim(
    actor: AuthPrincipal | null,
    input: {
      claimId: string;
      rejectionReason: string;
      verificationNote?: string;
    }
  ): Promise<PaymentClaimDetailView> {
    const admin = ensureRole(actor, ['admin']);
    const reasonCheck = validateRequiredText(input.rejectionReason, 'Rejection reason', 5);
    if (!reasonCheck.valid) {
      throw new FinanceServiceError('REJECTION_REASON_REQUIRED', reasonCheck.error!, 'rejectionReason');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const nowIso = new Date().toISOString();

    const claimRef = doc(db, 'paymentClaims', input.claimId);
    const claimSnap = await getDoc(claimRef);
    if (!claimSnap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Payment claim not found.', 'claimId');
    }
    const claim = claimSnap.data() as FirestorePaymentClaimDoc;
    if (claim.status === 'verified') {
      throw new FinanceServiceError(
        'DUPLICATE_VERIFICATION',
        'A verified payment claim cannot be rejected. Use an audited correction instead.'
      );
    }
    if (claim.status === 'rejected') {
      throw new FinanceServiceError('VALIDATION_ERROR', 'This payment claim has already been rejected.');
    }

    const rejectedClaim: FirestorePaymentClaimDoc = {
      ...claim,
      status: 'rejected',
      verifiedBy: admin.loginId,
      verifiedAt: nowIso,
      rejectionReason: input.rejectionReason.trim(),
      verificationNote: input.verificationNote?.trim() || undefined,
    };

    const [accSnap, vpsSnap, claimsSnap, placement] = await Promise.all([
      getDoc(doc(db, 'studentFeeAccounts', claim.feeAccountId)),
      getDocs(query(collection(db, 'verifiedPayments'), where('feeAccountId', '==', claim.feeAccountId))),
      getDocs(query(collection(db, 'paymentClaims'), where('feeAccountId', '==', claim.feeAccountId))),
      loadPlacementForSingleStudent(db, claim.studentUid, claim.studentId),
    ]);

    const account = accSnap.exists() ? (accSnap.data() as FirestoreFeeAccountDoc) : undefined;
    let nextRemaining = account?.remainingBalancePaise ?? 0;

    await withFirestoreErrorHandling(
      OperationType.UPDATE,
      `paymentClaims/${claim.id}`,
      async () => {
        await setDoc(claimRef, stripUndefinedFields({ ...rejectedClaim }));
        if (account) {
          const allClaims = claimsSnap.docs
            .map((d) => d.data() as PaymentClaim)
            .map((c) => (c.id === claim.id ? rejectedClaim : c));
          const computed = computeStatusFromRecords(
            account,
            vpsSnap.docs.map((d) => d.data() as VerifiedPayment),
            allClaims
          );
          nextRemaining = computed.remainingBalancePaise;
          await updateDoc(doc(db, 'studentFeeAccounts', account.id), {
            verifiedAmountPaidPaise: computed.verifiedPaidPaise,
            remainingBalancePaise: computed.remainingBalancePaise,
            status: computed.status,
            updatedAt: nowIso,
          });
        }

        await writePaymentVerificationAudit(db, adminUids, {
          paymentClaimId: rejectedClaim.id,
          actorId: admin.loginId,
          action: 'payment_rejected',
          previousValues: 'status=verification_pending',
          newValues: `status=rejected, remaining=${nextRemaining}`,
          reason: rejectedClaim.rejectionReason,
          timestamp: nowIso,
        });
        await writeFinancialAudit(db, adminUids, {
          entityType: 'payment_claim',
          entityId: rejectedClaim.id,
          actorId: admin.loginId,
          action: 'payment_claim_rejected',
          previousValues: 'status=verification_pending',
          newValues: `status=rejected (${formatInrFromPaise(rejectedClaim.amountPaise)} excluded)`,
          reason: rejectedClaim.rejectionReason,
          timestamp: nowIso,
        });
        await enqueueFirebaseFinancialNotification(db, adminUids, {
          recipientId: rejectedClaim.studentId,
          recipientUid: rejectedClaim.studentUid,
          recipientRole: 'student',
          notificationType: 'payment_rejected',
          relatedRecordId: rejectedClaim.id,
          dedupeKey: `payment_rejected:${rejectedClaim.id}:${rejectedClaim.studentId}`,
          title: `Payment Claim Rejected (${rejectedClaim.paymentReference})`,
          message: `Claim for ${formatInrFromPaise(rejectedClaim.amountPaise)} was rejected: ${rejectedClaim.rejectionReason}.`,
        });
      }
    );

    return toClaimDetailView(rejectedClaim, placement, account, [], []);
  }

  async correctVerifiedPayment(
    actor: AuthPrincipal | null,
    input: {
      verifiedPaymentId: string;
      correctedAmountRupees: number | string;
      reason: string;
    }
  ): Promise<{
    verifiedPayment: VerifiedPayment;
    voidedReceiptId?: string;
    newReceipt?: FeeReceipt;
  }> {
    const admin = ensureRole(actor, ['admin']);
    const reasonCheck = validateRequiredText(input.reason, 'Correction reason', 5);
    if (!reasonCheck.valid) {
      throw new FinanceServiceError('CORRECTION_REASON_REQUIRED', reasonCheck.error!, 'reason');
    }
    const newAmountPaise = rupeesToPaise(input.correctedAmountRupees);
    if (!Number.isSafeInteger(newAmountPaise) || newAmountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Corrected payment amount must be positive.',
        'correctedAmountRupees'
      );
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const centreName = await resolveCentreName(db);
    const nowIso = new Date().toISOString();

    const vpRef = doc(db, 'verifiedPayments', input.verifiedPaymentId);
    const vpSnap = await getDoc(vpRef);
    if (!vpSnap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Verified payment record not found.');
    }
    const existingVp = vpSnap.data() as FirestoreVerifiedPaymentDoc;

    const [accSnap, vpsSnap, claimsSnap, recSnap, placement] = await Promise.all([
      getDoc(doc(db, 'studentFeeAccounts', existingVp.feeAccountId)),
      getDocs(
        query(collection(db, 'verifiedPayments'), where('feeAccountId', '==', existingVp.feeAccountId))
      ),
      getDocs(
        query(collection(db, 'paymentClaims'), where('feeAccountId', '==', existingVp.feeAccountId))
      ),
      getDocs(
        query(collection(db, 'paymentReceipts'), where('verifiedPaymentId', '==', existingVp.id))
      ),
      loadPlacementForSingleStudent(db, existingVp.studentUid, existingVp.studentId),
    ]);

    if (!accSnap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Linked fee account not found.');
    }
    const account = accSnap.data() as FirestoreFeeAccountDoc;
    const allVps = vpsSnap.docs.map((d) => d.data() as VerifiedPayment);
    const otherVerifiedSum = allVps
      .filter((v) => v.id !== existingVp.id)
      .reduce((sum, v) => sum + v.amountPaise, 0);

    if (otherVerifiedSum + newAmountPaise > account.amountDuePaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Corrected total (${formatInrFromPaise(otherVerifiedSum + newAmountPaise)}) would exceed fee due (${formatInrFromPaise(account.amountDuePaise)}).`
      );
    }

    const updatedVp: FirestoreVerifiedPaymentDoc = {
      ...existingVp,
      amountPaise: newAmountPaise,
      corrected: true,
      correctionReason: input.reason.trim(),
      updatedAt: nowIso,
    };

    const nextVps = allVps.map((v) => (v.id === updatedVp.id ? updatedVp : v));
    const computed = computeStatusFromRecords(
      account,
      nextVps,
      claimsSnap.docs.map((d) => d.data() as PaymentClaim)
    );

    let voidedReceiptId: string | undefined;
    for (const rDoc of recSnap.docs) {
      const rData = rDoc.data() as FirestoreReceiptDoc;
      if (rData.status === 'issued') {
        voidedReceiptId = rDoc.id;
        await updateDoc(rDoc.ref, {
          status: 'voided',
          verificationStatus: 'voided',
          voidReason: `Superseded by audited payment correction: ${input.reason.trim()}`,
        });
      }
    }

    const recId = generateSafeDocId('REC');
    const yearStr = updatedVp.paymentDate.slice(0, 4) || new Date().getFullYear().toString();
    const newReceipt: FirestoreReceiptDoc = {
      id: recId,
      receiptNumber: `RCP-${yearStr}-${recId.slice(-4)}`,
      verifiedPaymentId: updatedVp.id,
      paymentClaimId: updatedVp.paymentClaimId,
      paymentReference: updatedVp.paymentReference,
      transactionReference: updatedVp.transactionReference,
      centreName,
      studentId: updatedVp.studentId,
      studentUid: updatedVp.studentUid,
      studentName: placement.studentName,
      className: placement.className,
      batchName: placement.batchName,
      feePeriod: account.feePeriod,
      periodLabel: account.periodLabel,
      paymentDate: updatedVp.paymentDate,
      amountPaise: updatedVp.amountPaise,
      totalFeeDuePaise: account.amountDuePaise,
      totalAmountPaidAfterPaise: computed.verifiedPaidPaise,
      remainingBalancePaise: computed.remainingBalancePaise,
      verificationStatus: 'verified',
      issuedBy: admin.loginId,
      issuedAt: nowIso,
      status: 'issued',
      adminUids,
    };

    await withFirestoreErrorHandling(OperationType.UPDATE, `verifiedPayments/${updatedVp.id}`, async () => {
      await setDoc(vpRef, stripUndefinedFields({ ...updatedVp }));
      await updateDoc(doc(db, 'studentFeeAccounts', account.id), {
        verifiedAmountPaidPaise: computed.verifiedPaidPaise,
        remainingBalancePaise: computed.remainingBalancePaise,
        status: computed.status,
        updatedAt: nowIso,
      });
      await setDoc(doc(db, 'paymentReceipts', recId), stripUndefinedFields({ ...newReceipt }));
      await writePaymentVerificationAudit(db, adminUids, {
        paymentClaimId: updatedVp.paymentClaimId,
        verifiedPaymentId: updatedVp.id,
        actorId: admin.loginId,
        action: 'payment_corrected',
        previousValues: `amountPaise=${existingVp.amountPaise}`,
        newValues: `amountPaise=${updatedVp.amountPaise}, newReceipt=${newReceipt.receiptNumber}`,
        reason: input.reason.trim(),
        timestamp: nowIso,
      });
      await writeFinancialAudit(db, adminUids, {
        entityType: 'verified_payment',
        entityId: updatedVp.id,
        actorId: admin.loginId,
        action: 'verified_payment_corrected',
        previousValues: formatInrFromPaise(existingVp.amountPaise),
        newValues: `${formatInrFromPaise(updatedVp.amountPaise)} (receipt ${newReceipt.receiptNumber})`,
        reason: input.reason.trim(),
        timestamp: nowIso,
      });
    });

    return { verifiedPayment: updatedVp, voidedReceiptId, newReceipt };
  }

  async listPaymentVerificationAudit(
    actor: AuthPrincipal | null,
    claimId?: string
  ): Promise<PaymentVerificationAudit[]> {
    ensureRole(actor, ['admin']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'paymentVerificationAudit', async () => {
      const snap = claimId
        ? await getDocs(
            query(collection(db, 'paymentVerificationAudit'), where('paymentClaimId', '==', claimId))
          )
        : await getDocs(collection(db, 'paymentVerificationAudit'));
      return snap.docs
        .map((d) => d.data() as PaymentVerificationAudit)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });
  }
}

// ===========================================================================
// 3. Receipts
// ===========================================================================
export class FirebaseReceiptService implements IReceiptService {
  async listReceiptsForAdmin(actor: AuthPrincipal | null, search?: string): Promise<FeeReceipt[]> {
    ensureRole(actor, ['admin']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'paymentReceipts', async () => {
      const snap = await getDocs(collection(db, 'paymentReceipts'));
      let list = snap.docs.map((d) => d.data() as FeeReceipt);
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (r) =>
            r.receiptNumber.toLowerCase().includes(q) ||
            r.studentId.toLowerCase().includes(q) ||
            r.studentName.toLowerCase().includes(q) ||
            r.paymentReference.toLowerCase().includes(q) ||
            (r.transactionReference ?? '').toLowerCase().includes(q)
        );
      }
      return list.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    });
  }

  async listMyReceipts(actor: AuthPrincipal | null): Promise<FeeReceipt[]> {
    const student = ensureRole(actor, ['student']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'paymentReceipts', async () => {
      const snap = await getDocs(
        query(collection(db, 'paymentReceipts'), where('studentUid', '==', student.uid))
      );
      return snap.docs
        .map((d) => d.data() as FeeReceipt)
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
    });
  }

  async getReceiptById(actor: AuthPrincipal | null, receiptId: string): Promise<FeeReceipt> {
    const active = ensureRole(actor, ['admin', 'teacher', 'student']);
    const db = requireFirestoreDb();
    const snap = await getDoc(doc(db, 'paymentReceipts', receiptId));
    if (!snap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Receipt not found.');
    }
    const receipt = snap.data() as FirestoreReceiptDoc;
    if (active.role === 'admin' || (active.role === 'student' && receipt.studentUid === active.uid)) {
      return receipt;
    }
    throw new FinanceServiceError('UNAUTHORIZED', 'Access denied to this receipt.');
  }

  async getReceiptForVerifiedPayment(
    actor: AuthPrincipal | null,
    verifiedPaymentId: string
  ): Promise<FeeReceipt> {
    const active = ensureRole(actor, ['admin', 'student']);
    const db = requireFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'paymentReceipts'),
        where('verifiedPaymentId', '==', verifiedPaymentId),
        where('status', '==', 'issued')
      )
    );
    if (snap.empty) {
      throw new FinanceServiceError(
        'NOT_FOUND',
        'No issued receipt exists for this payment. Only verified payments generate valid receipts.'
      );
    }
    const receipt = snap.docs[0].data() as FirestoreReceiptDoc;
    if (active.role === 'admin' || (active.role === 'student' && receipt.studentUid === active.uid)) {
      return receipt;
    }
    throw new FinanceServiceError('UNAUTHORIZED', 'Access denied to this receipt.');
  }
}

// ===========================================================================
// 4. Teacher Salary Configurations, Periods & Payments
// ===========================================================================
type FirestoreSalaryConfigDoc = TeacherSalaryConfiguration & { teacherUid: string; adminUids: string[] };
type FirestoreSalaryPeriodDoc = TeacherSalaryPeriod & { teacherUid: string; adminUids: string[] };
type FirestoreSalaryPaymentDoc = TeacherSalaryPayment & { teacherUid: string; adminUids: string[] };

export class FirebaseSalaryService implements ITeacherSalaryService {
  async saveTeacherSalaryConfig(
    actor: AuthPrincipal | null,
    input: SaveTeacherSalaryConfigInput
  ): Promise<TeacherSalaryConfiguration> {
    const admin = ensureRole(actor, ['admin']);
    const teacherIdUpper = input.teacherId.trim().toUpperCase();
    const db = requireFirestoreDb();

    const teachersSnap = await getDocs(
      query(collection(db, 'users'), where('role', '==', 'teacher'))
    );
    const teacherDoc = teachersSnap.docs.find(
      (d) => String(d.data().accountId || '').toUpperCase() === teacherIdUpper
    );
    if (!teacherDoc) {
      throw new FinanceServiceError(
        'INVALID_REFERENCE',
        'Selected teacher account does not exist.',
        'teacherId'
      );
    }
    if (teacherDoc.data().status !== 'active') {
      throw new FinanceServiceError(
        'INACTIVE_REFERENCE',
        'Cannot configure salary for a deactivated teacher account.',
        'teacherId'
      );
    }

    const effCheck = validateIsoDate(input.effectiveFrom, 'Effective date');
    if (!effCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', effCheck.error!, 'effectiveFrom');
    }

    let monthlyAmountPaise: number | undefined;
    let perSessionAmountPaise: number | undefined;
    if (input.salaryModel === 'fixed_monthly') {
      const paise = rupeesToPaise(input.monthlyAmountRupees ?? '');
      if (!Number.isSafeInteger(paise) || paise <= 0) {
        throw new FinanceServiceError(
          'VALIDATION_ERROR',
          'Monthly salary amount must be greater than zero.',
          'monthlyAmountRupees'
        );
      }
      monthlyAmountPaise = paise;
    } else if (input.salaryModel === 'per_session') {
      const paise = rupeesToPaise(input.perSessionAmountRupees ?? '');
      if (!Number.isSafeInteger(paise) || paise <= 0) {
        throw new FinanceServiceError(
          'VALIDATION_ERROR',
          'Per-session rate must be greater than zero.',
          'perSessionAmountRupees'
        );
      }
      perSessionAmountPaise = paise;
    } else {
      throw new FinanceServiceError('VALIDATION_ERROR', 'Invalid salary model.', 'salaryModel');
    }

    const adminUids = await getActiveAdminUids(db);
    const nowIso = new Date().toISOString();
    const existingSnap = await getDocs(
      query(
        collection(db, 'teacherSalaryConfigurations'),
        where('teacherUid', '==', teacherDoc.id)
      )
    );
    const prevActive = existingSnap.docs
      .map((d) => d.data() as TeacherSalaryConfiguration)
      .find((c) => c.status === 'active');

    for (const d of existingSnap.docs) {
      if (d.data().status === 'active') {
        await updateDoc(d.ref, { status: 'inactive', updatedAt: nowIso });
      }
    }

    const id = generateSafeDocId('SCFG');
    const config: FirestoreSalaryConfigDoc = {
      id,
      teacherId: String(teacherDoc.data().accountId || teacherIdUpper),
      teacherUid: teacherDoc.id,
      salaryModel: input.salaryModel,
      monthlyAmountPaise,
      perSessionAmountPaise,
      effectiveFrom: input.effectiveFrom.trim(),
      status: 'active',
      createdBy: admin.loginId,
      adminUids,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await withFirestoreErrorHandling(
      OperationType.CREATE,
      `teacherSalaryConfigurations/${id}`,
      async () => {
        await setDoc(doc(db, 'teacherSalaryConfigurations', id), stripUndefinedFields({ ...config }));
        await writeFinancialAudit(db, adminUids, {
          entityType: 'salary_configuration',
          entityId: config.id,
          actorId: admin.loginId,
          action: prevActive ? 'salary_config_updated' : 'salary_config_created',
          previousValues: prevActive
            ? `${prevActive.id}: ${prevActive.salaryModel} ${formatInrFromPaise(prevActive.monthlyAmountPaise ?? prevActive.perSessionAmountPaise ?? 0)}`
            : undefined,
          newValues: `${config.id} (${config.teacherId}): ${config.salaryModel} ${formatInrFromPaise(monthlyAmountPaise ?? perSessionAmountPaise ?? 0)} effective ${config.effectiveFrom}`,
          timestamp: nowIso,
        });
      }
    );

    return config;
  }

  private computeEligibleSessions(
    teacherId: string,
    periodYYYYMM: string,
    sessions: AttendanceSession[],
    timetable: TimetableEntry[],
    classes: Map<string, ClassRecord>,
    batches: Map<string, BatchRecord>,
    subjects: Map<string, SubjectRecord>
  ): {
    sessionIds: string[];
    items: SalaryEligibleSessionItem[];
    requiresAdminReview: boolean;
    reviewReason?: string;
  } {
    const teacherUpper = teacherId.trim().toUpperCase();
    const monthSessions = sessions.filter(
      (s) => s.teacherId.toUpperCase() === teacherUpper && s.sessionDate.startsWith(periodYYYYMM)
    );
    const draftSessions = monthSessions.filter((s) => s.status === 'draft');

    const seenIds = new Set<string>();
    const items: SalaryEligibleSessionItem[] = [];
    for (const sess of monthSessions) {
      if (sess.status !== 'submitted' && sess.status !== 'corrected') continue;
      if (seenIds.has(sess.id)) continue;
      if (sess.timetableEntryId) {
        const slot = timetable.find((t) => t.entryId === sess.timetableEntryId);
        if (slot && slot.status === 'cancelled') continue;
      }
      seenIds.add(sess.id);
      items.push({
        sessionId: sess.id,
        sessionDate: sess.sessionDate,
        className: classes.get(sess.classId)?.name ?? sess.classId,
        batchName: batches.get(sess.batchId)?.name ?? sess.batchId,
        subjectName: subjects.get(sess.subjectId)?.name ?? sess.subjectId,
        sessionType: sess.sessionType,
      });
    }
    items.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

    const activeTimetableCount = timetable.filter(
      (t) => t.teacherAccountId.toUpperCase() === teacherUpper && t.status === 'active'
    ).length;

    let requiresAdminReview = false;
    let reviewReason: string | undefined;
    if (draftSessions.length > 0) {
      requiresAdminReview = true;
      reviewReason = `${draftSessions.length} unsubmitted draft attendance session(s) exist in ${periodYYYYMM}; review before finalizing payout.`;
    } else if (items.length === 0 && activeTimetableCount > 0) {
      requiresAdminReview = true;
      reviewReason = `Teacher has ${activeTimetableCount} active timetable slot(s) but 0 submitted attendance sessions recorded in ${periodYYYYMM}.`;
    } else if (items.length === 0) {
      requiresAdminReview = true;
      reviewReason = `No completed sessions found in ${periodYYYYMM}; confirm zero payable or adjust with Admin review.`;
    }

    return { sessionIds: items.map((i) => i.sessionId), items, requiresAdminReview, reviewReason };
  }

  async generateSalaryPeriodsForMonth(
    actor: AuthPrincipal | null,
    periodYYYYMM: string
  ): Promise<TeacherSalaryPeriod[]> {
    const admin = ensureRole(actor, ['admin']);
    const periodCheck = validateMonthlyPeriod(periodYYYYMM);
    if (!periodCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', periodCheck.error!, 'periodYYYYMM');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const period = periodYYYYMM.trim();
    const periodEndDate = `${period}-31`;
    const nowIso = new Date().toISOString();

    const [teachersSnap, cfgSnap, periodsSnap, sessionsSnap, ttSnap, clsSnap, batSnap, subSnap] =
      await Promise.all([
        getDocs(
          query(
            collection(db, 'users'),
            where('role', '==', 'teacher'),
            where('status', '==', 'active')
          )
        ),
        getDocs(query(collection(db, 'teacherSalaryConfigurations'), where('status', '==', 'active'))),
        getDocs(query(collection(db, 'teacherSalaryPeriods'), where('period', '==', period))),
        getDocs(collection(db, 'attendanceSessions')),
        getDocs(collection(db, 'timetableEntries')),
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'batches')),
        getDocs(collection(db, 'subjects')),
      ]);

    const configs = cfgSnap.docs.map((d) => d.data() as FirestoreSalaryConfigDoc);
    const existingPeriods = periodsSnap.docs.map((d) => d.data() as FirestoreSalaryPeriodDoc);
    const sessions = sessionsSnap.docs.map((d) => d.data() as AttendanceSession);
    const timetable = ttSnap.docs.map((d) => d.data() as TimetableEntry);
    const classes = new Map(clsSnap.docs.map((d) => [d.id, d.data() as ClassRecord]));
    const batches = new Map(batSnap.docs.map((d) => [d.id, d.data() as BatchRecord]));
    const subjects = new Map(subSnap.docs.map((d) => [d.id, d.data() as SubjectRecord]));

    const affected: TeacherSalaryPeriod[] = [];

    for (const tDoc of teachersSnap.docs) {
      const teacher = tDoc.data();
      const teacherId = String(teacher.accountId || '').toUpperCase();
      const config = configs.find(
        (c) =>
          c.teacherId.toUpperCase() === teacherId &&
          c.status === 'active' &&
          c.effectiveFrom <= periodEndDate
      );
      if (!config) continue;

      const existing = existingPeriods.find((p) => p.teacherId.toUpperCase() === teacherId);
      if (existing) {
        if (
          existing.salaryModel === 'per_session' &&
          existing.paidAmountPaise === 0 &&
          existing.status !== 'on_hold'
        ) {
          const calc = this.computeEligibleSessions(
            teacherId,
            period,
            sessions,
            timetable,
            classes,
            batches,
            subjects
          );
          const rate = config.perSessionAmountPaise ?? existing.ratePaise;
          const payable = calc.sessionIds.length * rate;
          const refreshed: FirestoreSalaryPeriodDoc = {
            ...existing,
            eligibleSessionIds: calc.sessionIds,
            eligibleSessionsSummary: calc.items,
            requiresAdminReview: calc.requiresAdminReview,
            reviewReason: calc.reviewReason,
            payableAmountPaise: payable,
            remainingAmountPaise: payable,
            updatedAt: nowIso,
          };
          await setDoc(
            doc(db, 'teacherSalaryPeriods', refreshed.id),
            stripUndefinedFields({ ...refreshed })
          );
          affected.push(refreshed);
        } else {
          affected.push(existing);
        }
        continue;
      }

      let ratePaise = 0;
      let payableAmountPaise = 0;
      let eligibleSessionIds: string[] = [];
      let eligibleSessionsSummary: SalaryEligibleSessionItem[] = [];
      let requiresAdminReview = false;
      let reviewReason: string | undefined;

      if (config.salaryModel === 'fixed_monthly') {
        ratePaise = config.monthlyAmountPaise ?? 0;
        payableAmountPaise = ratePaise;
      } else {
        ratePaise = config.perSessionAmountPaise ?? 0;
        const calc = this.computeEligibleSessions(
          teacherId,
          period,
          sessions,
          timetable,
          classes,
          batches,
          subjects
        );
        eligibleSessionIds = calc.sessionIds;
        eligibleSessionsSummary = calc.items;
        requiresAdminReview = calc.requiresAdminReview;
        reviewReason = calc.reviewReason;
        payableAmountPaise = eligibleSessionIds.length * ratePaise;
      }

      const id = generateSafeDocId('SPER');
      const newPeriod: FirestoreSalaryPeriodDoc = {
        id,
        teacherId: String(teacher.accountId || teacherId),
        teacherUid: tDoc.id,
        teacherName: String(teacher.name || teacherId),
        salaryConfigurationId: config.id,
        period,
        periodLabel: formatPeriodLabel(period),
        salaryModel: config.salaryModel,
        ratePaise,
        eligibleSessionIds,
        eligibleSessionsSummary,
        requiresAdminReview,
        reviewReason,
        payableAmountPaise,
        paidAmountPaise: 0,
        remainingAmountPaise: payableAmountPaise,
        status: 'pending',
        adminUids,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await setDoc(doc(db, 'teacherSalaryPeriods', id), stripUndefinedFields({ ...newPeriod }));
      await writeFinancialAudit(db, adminUids, {
        entityType: 'salary_period',
        entityId: newPeriod.id,
        actorId: admin.loginId,
        action: 'salary_period_generated',
        newValues: `${newPeriod.teacherId} · ${period} · ${newPeriod.salaryModel} · payable=${formatInrFromPaise(payableAmountPaise)}`,
        timestamp: nowIso,
      });
      affected.push(newPeriod);
    }

    return affected;
  }

  async listAdminTeacherSalarySummaries(
    actor: AuthPrincipal | null,
    periodFilter?: string
  ): Promise<TeacherSalarySummaryView[]> {
    ensureRole(actor, ['admin']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'teacherSalaryPeriods', async () => {
      const [teachersSnap, cfgSnap, periodsSnap, paymentsSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('role', '==', 'teacher'))),
        getDocs(collection(db, 'teacherSalaryConfigurations')),
        getDocs(collection(db, 'teacherSalaryPeriods')),
        getDocs(collection(db, 'teacherSalaryPayments')),
      ]);

      const configs = cfgSnap.docs.map((d) => d.data() as TeacherSalaryConfiguration);
      const allPeriods = periodsSnap.docs.map((d) => d.data() as TeacherSalaryPeriod);
      const allPayments = paymentsSnap.docs.map((d) => d.data() as TeacherSalaryPayment);

      return teachersSnap.docs
        .map((tDoc) => {
          const t = tDoc.data();
          const teacherId = String(t.accountId || '');
          const idUpper = teacherId.toUpperCase();
          const configHistory = configs
            .filter((c) => c.teacherId.toUpperCase() === idUpper)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

          let periods = allPeriods
            .filter((p) => p.teacherId.toUpperCase() === idUpper)
            .sort((a, b) => b.period.localeCompare(a.period));
          let payments = allPayments
            .filter((pm) => pm.teacherId.toUpperCase() === idUpper)
            .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

          if (periodFilter && periodFilter !== 'all') {
            periods = periods.filter((p) => p.period === periodFilter);
            payments = payments.filter((pm) => pm.period === periodFilter);
          }

          return {
            teacherId,
            teacherName: String(t.name || teacherId),
            teacherStatus: (t.status === 'deactivated' ? 'deactivated' : 'active') as
              | 'active'
              | 'deactivated',
            activeConfig: configHistory.find((c) => c.status === 'active') ?? null,
            configHistory,
            periods,
            payments,
          };
        })
        .sort((a, b) => a.teacherId.localeCompare(b.teacherId));
    });
  }

  async setSalaryPeriodHoldStatus(
    actor: AuthPrincipal | null,
    input: { teacherSalaryPeriodId: string; onHold: boolean; reason: string }
  ): Promise<TeacherSalaryPeriod> {
    const admin = ensureRole(actor, ['admin']);
    const reasonCheck = validateRequiredText(input.reason, 'Reason', 5);
    if (!reasonCheck.valid) {
      throw new FinanceServiceError('CORRECTION_REASON_REQUIRED', reasonCheck.error!, 'reason');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const ref = doc(db, 'teacherSalaryPeriods', input.teacherSalaryPeriodId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Teacher salary period not found.');
    }
    const current = snap.data() as FirestoreSalaryPeriodDoc;
    const nowIso = new Date().toISOString();

    const updated: FirestoreSalaryPeriodDoc = {
      ...current,
      status: input.onHold
        ? 'on_hold'
        : current.remainingAmountPaise <= 0 && current.payableAmountPaise > 0
          ? 'paid'
          : current.paidAmountPaise > 0
            ? 'partially_paid'
            : 'pending',
      holdReason: input.onHold ? input.reason.trim() : undefined,
      updatedAt: nowIso,
    };

    await withFirestoreErrorHandling(
      OperationType.UPDATE,
      `teacherSalaryPeriods/${updated.id}`,
      async () => {
        await setDoc(ref, stripUndefinedFields({ ...updated }));
        await writeFinancialAudit(db, adminUids, {
          entityType: 'salary_period',
          entityId: updated.id,
          actorId: admin.loginId,
          action: input.onHold ? 'salary_period_placed_on_hold' : 'salary_period_hold_released',
          previousValues: `status=${current.status}`,
          newValues: `status=${updated.status}`,
          reason: input.reason.trim(),
          timestamp: nowIso,
        });
      }
    );

    return updated;
  }

  async resolveSalaryPeriodReview(
    actor: AuthPrincipal | null,
    input: {
      teacherSalaryPeriodId: string;
      approvedPayableRupees: number | string;
      reason: string;
    }
  ): Promise<TeacherSalaryPeriod> {
    const admin = ensureRole(actor, ['admin']);
    const reasonCheck = validateRequiredText(input.reason, 'Review approval reason', 5);
    if (!reasonCheck.valid) {
      throw new FinanceServiceError('CORRECTION_REASON_REQUIRED', reasonCheck.error!, 'reason');
    }
    const approvedPaise = rupeesToPaise(input.approvedPayableRupees);
    if (!Number.isSafeInteger(approvedPaise) || approvedPaise < 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Approved payable amount must be zero or positive.',
        'approvedPayableRupees'
      );
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const ref = doc(db, 'teacherSalaryPeriods', input.teacherSalaryPeriodId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Teacher salary period not found.');
    }
    const current = snap.data() as FirestoreSalaryPeriodDoc;
    if (approvedPaise < current.paidAmountPaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Approved payable (${formatInrFromPaise(approvedPaise)}) cannot be less than already paid amount (${formatInrFromPaise(current.paidAmountPaise)}).`
      );
    }

    const nowIso = new Date().toISOString();
    const remaining = Math.max(0, approvedPaise - current.paidAmountPaise);
    const nextStatus: TeacherSalaryPeriodStatus =
      current.status === 'on_hold'
        ? 'on_hold'
        : approvedPaise > 0 && remaining <= 0
          ? 'paid'
          : current.paidAmountPaise > 0
            ? 'partially_paid'
            : 'pending';

    const updated: FirestoreSalaryPeriodDoc = {
      ...current,
      payableAmountPaise: approvedPaise,
      remainingAmountPaise: remaining,
      status: nextStatus,
      requiresAdminReview: false,
      reviewReason: `Reviewed & confirmed by ${admin.loginId}: ${input.reason.trim()}`,
      updatedAt: nowIso,
    };

    await withFirestoreErrorHandling(
      OperationType.UPDATE,
      `teacherSalaryPeriods/${updated.id}`,
      async () => {
        await setDoc(ref, stripUndefinedFields({ ...updated }));
        await writeFinancialAudit(db, adminUids, {
          entityType: 'salary_period',
          entityId: updated.id,
          actorId: admin.loginId,
          action: 'salary_period_review_resolved',
          previousValues: `payable=${formatInrFromPaise(current.payableAmountPaise)}, requiresReview=${current.requiresAdminReview}`,
          newValues: `payable=${formatInrFromPaise(updated.payableAmountPaise)}, requiresReview=false`,
          reason: input.reason.trim(),
          timestamp: nowIso,
        });
      }
    );

    return updated;
  }

  async recordSalaryPayment(
    actor: AuthPrincipal | null,
    input: RecordSalaryPaymentInput
  ): Promise<{ payment: TeacherSalaryPayment; period: TeacherSalaryPeriod }> {
    const admin = ensureRole(actor, ['admin']);
    const amountPaise = rupeesToPaise(input.amountRupees);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Salary payment amount must be greater than zero.',
        'amountRupees'
      );
    }
    const dateCheck = validateIsoDate(input.paymentDate, 'Payment date');
    if (!dateCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', dateCheck.error!, 'paymentDate');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const nowIso = new Date().toISOString();
    const refTrimmed = input.paymentReference?.trim() || undefined;

    if (refTrimmed) {
      const dupSnap = await getDocs(
        query(
          collection(db, 'teacherSalaryPayments'),
          where('teacherSalaryPeriodId', '==', input.teacherSalaryPeriodId)
        )
      );
      const dup = dupSnap.docs.some(
        (d) => String(d.data().paymentReference || '').toUpperCase() === refTrimmed.toUpperCase()
      );
      if (dup) {
        throw new FinanceServiceError(
          'DUPLICATE_CLAIM',
          `Payment reference "${refTrimmed}" is already recorded for this salary period.`,
          'paymentReference'
        );
      }
    }

    const txRes = await withFirestoreErrorHandling(
      OperationType.WRITE,
      `teacherSalaryPeriods/${input.teacherSalaryPeriodId}`,
      async () =>
        runTransaction(db, async (tx) => {
          const periodRef = doc(db, 'teacherSalaryPeriods', input.teacherSalaryPeriodId);
          const periodSnap = await tx.get(periodRef);
          if (!periodSnap.exists()) {
            throw new FinanceServiceError(
              'NOT_FOUND',
              'Salary period not found.',
              'teacherSalaryPeriodId'
            );
          }
          const period = periodSnap.data() as FirestoreSalaryPeriodDoc;
          if (period.status === 'on_hold') {
            throw new FinanceServiceError(
              'VALIDATION_ERROR',
              'Cannot record payment while this salary period is On Hold. Release hold first.'
            );
          }
          if (amountPaise > period.remainingAmountPaise) {
            throw new FinanceServiceError(
              'OVERPAYMENT_NOT_ALLOWED',
              `Payment (${formatInrFromPaise(amountPaise)}) exceeds remaining payable amount (${formatInrFromPaise(period.remainingAmountPaise)}).`,
              'amountRupees'
            );
          }

          const paymentId = generateSafeDocId('SPAY');
          const payment: FirestoreSalaryPaymentDoc = {
            id: paymentId,
            teacherSalaryPeriodId: period.id,
            teacherId: period.teacherId,
            teacherUid: period.teacherUid,
            period: period.period,
            amountPaise,
            paymentDate: input.paymentDate.trim(),
            paymentReference: refTrimmed,
            note: input.note?.trim() || undefined,
            recordedBy: admin.loginId,
            adminUids,
            createdAt: nowIso,
          };

          const nextPaid = period.paidAmountPaise + amountPaise;
          const nextRemaining = Math.max(0, period.payableAmountPaise - nextPaid);
          const nextStatus: TeacherSalaryPeriodStatus =
            nextRemaining <= 0 && period.payableAmountPaise > 0 ? 'paid' : 'partially_paid';

          const updatedPeriod: FirestoreSalaryPeriodDoc = {
            ...period,
            paidAmountPaise: nextPaid,
            remainingAmountPaise: nextRemaining,
            status: nextStatus,
            updatedAt: nowIso,
          };

          tx.set(doc(db, 'teacherSalaryPayments', paymentId), stripUndefinedFields({ ...payment }));
          tx.set(periodRef, stripUndefinedFields({ ...updatedPeriod }));
          return { payment, updatedPeriod, prevPeriod: period };
        })
    );

    await writeFinancialAudit(db, adminUids, {
      entityType: 'salary_payment',
      entityId: txRes.payment.id,
      actorId: admin.loginId,
      action: 'salary_payment_recorded',
      previousValues: `paid=${formatInrFromPaise(txRes.prevPeriod.paidAmountPaise)}, remaining=${formatInrFromPaise(txRes.prevPeriod.remainingAmountPaise)}`,
      newValues: `${txRes.prevPeriod.teacherId} (${txRes.prevPeriod.period}): +${formatInrFromPaise(txRes.payment.amountPaise)}, remaining=${formatInrFromPaise(txRes.updatedPeriod.remainingAmountPaise)}`,
      reason: txRes.payment.note ?? 'Manual salary payment tracking entry',
      timestamp: nowIso,
    });

    return { payment: txRes.payment, period: txRes.updatedPeriod };
  }

  async correctSalaryPayment(
    actor: AuthPrincipal | null,
    input: {
      salaryPaymentId: string;
      correctedAmountRupees: number | string;
      reason: string;
    }
  ): Promise<{ payment: TeacherSalaryPayment; period: TeacherSalaryPeriod }> {
    const admin = ensureRole(actor, ['admin']);
    const reasonCheck = validateRequiredText(input.reason, 'Correction reason', 5);
    if (!reasonCheck.valid) {
      throw new FinanceServiceError('CORRECTION_REASON_REQUIRED', reasonCheck.error!, 'reason');
    }
    const newAmountPaise = rupeesToPaise(input.correctedAmountRupees);
    if (!Number.isSafeInteger(newAmountPaise) || newAmountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Corrected salary payment amount must be positive.',
        'correctedAmountRupees'
      );
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const nowIso = new Date().toISOString();

    const payRef = doc(db, 'teacherSalaryPayments', input.salaryPaymentId);
    const paySnap = await getDoc(payRef);
    if (!paySnap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Salary payment record not found.');
    }
    const currentPayment = paySnap.data() as FirestoreSalaryPaymentDoc;
    const periodRef = doc(db, 'teacherSalaryPeriods', currentPayment.teacherSalaryPeriodId);
    const [periodSnap, siblingSnap] = await Promise.all([
      getDoc(periodRef),
      getDocs(
        query(
          collection(db, 'teacherSalaryPayments'),
          where('teacherSalaryPeriodId', '==', currentPayment.teacherSalaryPeriodId)
        )
      ),
    ]);
    if (!periodSnap.exists()) {
      throw new FinanceServiceError('NOT_FOUND', 'Linked salary period not found.');
    }
    const period = periodSnap.data() as FirestoreSalaryPeriodDoc;

    const otherPaid = siblingSnap.docs
      .map((d) => d.data() as TeacherSalaryPayment)
      .filter((pm) => pm.id !== currentPayment.id)
      .reduce((sum, pm) => sum + pm.amountPaise, 0);

    if (otherPaid + newAmountPaise > period.payableAmountPaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Corrected salary total (${formatInrFromPaise(otherPaid + newAmountPaise)}) exceeds payable amount (${formatInrFromPaise(period.payableAmountPaise)}).`
      );
    }

    const updatedPayment: FirestoreSalaryPaymentDoc = {
      ...currentPayment,
      amountPaise: newAmountPaise,
      corrected: true,
      correctionReason: input.reason.trim(),
      updatedAt: nowIso,
    };

    const nextPaid = otherPaid + newAmountPaise;
    const nextRemaining = Math.max(0, period.payableAmountPaise - nextPaid);
    const nextStatus: TeacherSalaryPeriodStatus =
      period.status === 'on_hold'
        ? 'on_hold'
        : nextRemaining <= 0 && period.payableAmountPaise > 0
          ? 'paid'
          : nextPaid > 0
            ? 'partially_paid'
            : 'pending';

    const updatedPeriod: FirestoreSalaryPeriodDoc = {
      ...period,
      paidAmountPaise: nextPaid,
      remainingAmountPaise: nextRemaining,
      status: nextStatus,
      updatedAt: nowIso,
    };

    await withFirestoreErrorHandling(
      OperationType.UPDATE,
      `teacherSalaryPayments/${updatedPayment.id}`,
      async () => {
        await setDoc(payRef, stripUndefinedFields({ ...updatedPayment }));
        await setDoc(periodRef, stripUndefinedFields({ ...updatedPeriod }));
        await writeFinancialAudit(db, adminUids, {
          entityType: 'salary_payment',
          entityId: updatedPayment.id,
          actorId: admin.loginId,
          action: 'salary_payment_corrected',
          previousValues: formatInrFromPaise(currentPayment.amountPaise),
          newValues: `${formatInrFromPaise(updatedPayment.amountPaise)} (remaining ${formatInrFromPaise(updatedPeriod.remainingAmountPaise)})`,
          reason: input.reason.trim(),
          timestamp: nowIso,
        });
      }
    );

    return { payment: updatedPayment, period: updatedPeriod };
  }

  async getMyTeacherSalaryOverview(
    actor: AuthPrincipal | null
  ): Promise<TeacherSalarySummaryView> {
    const teacher = ensureRole(actor, ['teacher']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'teacherSalaryPeriods', async () => {
      const [cfgSnap, perSnap, paySnap] = await Promise.all([
        getDocs(
          query(collection(db, 'teacherSalaryConfigurations'), where('teacherUid', '==', teacher.uid))
        ),
        getDocs(query(collection(db, 'teacherSalaryPeriods'), where('teacherUid', '==', teacher.uid))),
        getDocs(query(collection(db, 'teacherSalaryPayments'), where('teacherUid', '==', teacher.uid))),
      ]);

      const configHistory = cfgSnap.docs
        .map((d) => d.data() as TeacherSalaryConfiguration)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return {
        teacherId: teacher.loginId,
        teacherName: teacher.fullName,
        teacherStatus: teacher.status === 'deactivated' ? 'deactivated' : 'active',
        activeConfig: configHistory.find((c) => c.status === 'active') ?? null,
        configHistory,
        periods: perSnap.docs
          .map((d) => d.data() as TeacherSalaryPeriod)
          .sort((a, b) => b.period.localeCompare(a.period)),
        payments: paySnap.docs
          .map((d) => d.data() as TeacherSalaryPayment)
          .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)),
      };
    });
  }
}

// ===========================================================================
// 5. Financial Reports & Audit History
// ===========================================================================
export class FirebaseFinancialReportService implements IFinancialReportService {
  private readonly feeService = new FirebaseFeeService();

  async getAdminFinancialDashboard(
    actor: AuthPrincipal | null
  ): Promise<AdminFinancialDashboardData> {
    const admin = ensureRole(actor, ['admin']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'financialDashboard', async () => {
      const [
        activeFeeConfig,
        upiConfig,
        feeSnap,
        vpSnap,
        claimsSnap,
        spSnap,
        spaySnap,
      ] = await Promise.all([
        this.feeService.getActiveFeeConfiguration(admin),
        this.feeService.getUpiConfiguration(admin),
        getDocs(collection(db, 'studentFeeAccounts')),
        getDocs(collection(db, 'verifiedPayments')),
        getDocs(collection(db, 'paymentClaims')),
        getDocs(collection(db, 'teacherSalaryPeriods')),
        getDocs(collection(db, 'teacherSalaryPayments')),
      ]);

      const now = new Date();
      const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const currentYear = String(now.getFullYear());

      const verifiedPayments = vpSnap.docs.map((d) => d.data() as VerifiedPayment);
      const claims = claimsSnap.docs.map((d) => d.data() as PaymentClaim);
      const feeAccounts = feeSnap.docs.map((d) => d.data() as StudentFeeAccount);
      const salaryPeriods = spSnap.docs.map((d) => d.data() as TeacherSalaryPeriod);
      const salaryPayments = spaySnap.docs.map((d) => d.data() as TeacherSalaryPayment);

      const totalVerifiedCollectionsPaise = verifiedPayments.reduce((s, v) => s + v.amountPaise, 0);
      const currentMonthCollectionsPaise = verifiedPayments
        .filter((v) => v.paymentDate.startsWith(currentPeriod))
        .reduce((s, v) => s + v.amountPaise, 0);
      const currentYearCollectionsPaise = verifiedPayments
        .filter((v) => v.paymentDate.startsWith(currentYear))
        .reduce((s, v) => s + v.amountPaise, 0);

      const totalOutstandingStudentFeesPaise = feeAccounts.reduce((sum, acc) => {
        return sum + computeStatusFromRecords(acc, verifiedPayments, claims).remainingBalancePaise;
      }, 0);

      const pendingClaims = claims.filter((c) => c.status === 'verification_pending');
      const rejectedClaims = claims.filter((c) => c.status === 'rejected');
      const totalTeacherSalaryPayablePaise = salaryPeriods.reduce(
        (s, sp) => s + sp.payableAmountPaise,
        0
      );
      const totalTeacherSalaryPaidPaise = salaryPayments.reduce((s, pm) => s + pm.amountPaise, 0);

      return {
        totalVerifiedCollectionsPaise,
        totalOutstandingStudentFeesPaise,
        pendingPaymentClaimsPaise: pendingClaims.reduce((s, c) => s + c.amountPaise, 0),
        pendingPaymentClaimsCount: pendingClaims.length,
        verifiedPaymentsCount: verifiedPayments.length,
        rejectedClaimsPaise: rejectedClaims.reduce((s, c) => s + c.amountPaise, 0),
        rejectedClaimsCount: rejectedClaims.length,
        currentMonthCollectionsPaise,
        currentYearCollectionsPaise,
        totalTeacherSalaryPayablePaise,
        totalTeacherSalaryPaidPaise,
        pendingTeacherSalaryPaise: Math.max(
          0,
          totalTeacherSalaryPayablePaise - totalTeacherSalaryPaidPaise
        ),
        netRecordedBalancePaise: totalVerifiedCollectionsPaise - totalTeacherSalaryPaidPaise,
        activeFeeConfig,
        upiConfig,
        currentPeriod,
        currentYear,
      };
    });
  }

  async getFinancialReportSummary(
    actor: AuthPrincipal | null,
    filter: FinancialReportFilter
  ): Promise<FinancialReportSummary> {
    ensureRole(actor, ['admin']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'financialReports', async () => {
      const [feeSnap, vpSnap, claimsSnap, spSnap, spaySnap, placements] = await Promise.all([
        getDocs(collection(db, 'studentFeeAccounts')),
        getDocs(collection(db, 'verifiedPayments')),
        getDocs(collection(db, 'paymentClaims')),
        getDocs(collection(db, 'teacherSalaryPeriods')),
        getDocs(collection(db, 'teacherSalaryPayments')),
        loadPlacementMapForAdmin(db),
      ]);

      const feeAccounts = feeSnap.docs.map((d) => d.data() as StudentFeeAccount);
      const verifiedPayments = vpSnap.docs.map((d) => d.data() as VerifiedPayment);
      const claims = claimsSnap.docs.map((d) => d.data() as PaymentClaim);
      const salaryPeriods = spSnap.docs.map((d) => d.data() as TeacherSalaryPeriod);
      const salaryPayments = spaySnap.docs.map((d) => d.data() as TeacherSalaryPayment);

      const matchesPeriod = (periodKey: string): boolean => {
        if (filter.granularity === 'monthly' && filter.month && filter.month.trim()) {
          return periodKey === filter.month.trim();
        }
        if (filter.granularity === 'yearly' && filter.year && filter.year.trim()) {
          return periodKey.startsWith(filter.year.trim());
        }
        return true;
      };

      const matchesPaymentDate = (dateStr: string): boolean => {
        if (filter.dateFrom && filter.dateFrom.trim() && dateStr < filter.dateFrom.trim()) {
          return false;
        }
        if (filter.dateTo && filter.dateTo.trim() && dateStr > filter.dateTo.trim()) {
          return false;
        }
        return true;
      };
      const hasDateWindow = Boolean(filter.dateFrom?.trim() || filter.dateTo?.trim());

      const filteredAccounts = feeAccounts.filter((acc) => {
        if (!matchesPeriod(acc.feePeriod)) return false;
        const p = placements.get(acc.studentId.toUpperCase());
        if (filter.classId && filter.classId !== 'all' && p?.classId !== filter.classId) {
          return false;
        }
        if (filter.batchId && filter.batchId !== 'all' && p?.batchId !== filter.batchId) {
          return false;
        }
        return true;
      });

      const studentRows: StudentFeeReportRow[] = [];
      let totalExpectedPaise = 0;
      let totalVerifiedCollectionsPaise = 0;
      let totalOutstandingPaise = 0;
      let partialPaymentsCount = 0;
      let pendingVerificationPaise = 0;
      let pendingVerificationCount = 0;
      let rejectedClaimsPaise = 0;
      let rejectedClaimsCount = 0;

      for (const acc of filteredAccounts) {
        const p = placements.get(acc.studentId.toUpperCase());
        const computed = computeStatusFromRecords(acc, verifiedPayments, claims);
        const accountVerified = verifiedPayments.filter(
          (v) => v.feeAccountId === acc.id && (!hasDateWindow || matchesPaymentDate(v.paymentDate))
        );
        const verifiedPaidPaise = accountVerified.reduce((sum, v) => sum + v.amountPaise, 0);
        const accountClaims = claims.filter(
          (c) => c.feeAccountId === acc.id && (!hasDateWindow || matchesPaymentDate(c.paymentDate))
        );
        const pendingClaims = accountClaims.filter((c) => c.status === 'verification_pending');
        const rejectedClaims = accountClaims.filter((c) => c.status === 'rejected');
        const pendingAmt = pendingClaims.reduce((sum, c) => sum + c.amountPaise, 0);
        const rejectedAmt = rejectedClaims.reduce((sum, c) => sum + c.amountPaise, 0);

        totalExpectedPaise += acc.amountDuePaise;
        totalVerifiedCollectionsPaise += verifiedPaidPaise;
        totalOutstandingPaise += computed.remainingBalancePaise;
        if (
          computed.status === 'partially_paid' ||
          (verifiedPaidPaise > 0 && computed.remainingBalancePaise > 0)
        ) {
          partialPaymentsCount++;
        }
        pendingVerificationPaise += pendingAmt;
        pendingVerificationCount += pendingClaims.length;
        rejectedClaimsPaise += rejectedAmt;
        rejectedClaimsCount += rejectedClaims.length;

        studentRows.push({
          studentId: acc.studentId,
          studentName: p?.studentName ?? acc.studentId,
          className: p?.className ?? 'Unassigned Class',
          batchName: p?.batchName ?? 'Unassigned Batch',
          feePeriod: acc.feePeriod,
          expectedPaise: acc.amountDuePaise,
          verifiedPaidPaise,
          pendingClaimsPaise: pendingAmt,
          rejectedClaimsPaise: rejectedAmt,
          outstandingPaise: computed.remainingBalancePaise,
          status: computed.status,
        });
      }

      const filteredSalaryPeriods = salaryPeriods.filter((sp) => {
        if (!matchesPeriod(sp.period)) return false;
        if (
          filter.teacherId &&
          filter.teacherId !== 'all' &&
          sp.teacherId.toUpperCase() !== filter.teacherId.trim().toUpperCase()
        ) {
          return false;
        }
        return true;
      });

      const teacherRows: TeacherSalaryReportRow[] = [];
      let totalSalaryPayablePaise = 0;
      let totalSalaryPaidPaise = 0;
      let pendingSalaryPaise = 0;

      for (const sp of filteredSalaryPeriods) {
        const paidInWindow = salaryPayments
          .filter(
            (pm) =>
              pm.teacherSalaryPeriodId === sp.id &&
              (!hasDateWindow || matchesPaymentDate(pm.paymentDate))
          )
          .reduce((sum, pm) => sum + pm.amountPaise, 0);
        const remaining = Math.max(0, sp.payableAmountPaise - sp.paidAmountPaise);
        totalSalaryPayablePaise += sp.payableAmountPaise;
        totalSalaryPaidPaise += paidInWindow;
        pendingSalaryPaise += remaining;

        teacherRows.push({
          teacherId: sp.teacherId,
          teacherName: sp.teacherName,
          period: sp.period,
          salaryModel: sp.salaryModel,
          payablePaise: sp.payableAmountPaise,
          paidPaise: paidInWindow,
          remainingPaise: remaining,
          status: sp.status,
          requiresAdminReview: sp.requiresAdminReview,
        });
      }

      const periodTitle =
        filter.granularity === 'monthly' && filter.month
          ? formatPeriodLabel(filter.month)
          : filter.granularity === 'yearly' && filter.year
            ? `Year ${filter.year}`
            : 'All Recorded Periods';

      return {
        filter,
        periodTitle,
        feeSummary: {
          totalExpectedPaise,
          totalVerifiedCollectionsPaise,
          totalOutstandingPaise,
          partialPaymentsCount,
          pendingVerificationPaise,
          pendingVerificationCount,
          rejectedClaimsPaise,
          rejectedClaimsCount,
          studentRows: studentRows.sort(
            (a, b) =>
              b.feePeriod.localeCompare(a.feePeriod) || a.studentId.localeCompare(b.studentId)
          ),
        },
        salarySummary: {
          totalSalaryPayablePaise,
          totalSalaryPaidPaise,
          pendingSalaryPaise,
          teacherRows: teacherRows.sort(
            (a, b) => b.period.localeCompare(a.period) || a.teacherId.localeCompare(b.teacherId)
          ),
        },
        netRecordedBalancePaise: totalVerifiedCollectionsPaise - totalSalaryPaidPaise,
      };
    });
  }

  async listFinancialAuditHistory(
    actor: AuthPrincipal | null,
    entityType: 'all' | FinancialAuditEntityType = 'all'
  ): Promise<FinancialAuditEntry[]> {
    ensureRole(actor, ['admin']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'financialAudit', async () => {
      const snap =
        entityType === 'all'
          ? await getDocs(collection(db, 'financialAudit'))
          : await getDocs(
              query(collection(db, 'financialAudit'), where('entityType', '==', entityType))
            );
      return snap.docs
        .map((d) => d.data() as FinancialAuditEntry)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });
  }
}

export const firebaseFeeService = new FirebaseFeeService();
export const firebasePaymentService = new FirebasePaymentService();
export const firebaseReceiptService = new FirebaseReceiptService();
export const firebaseSalaryService = new FirebaseSalaryService();
export const firebaseFinancialReportService = new FirebaseFinancialReportService();
