import {
  hasPermission,
  type AuthPrincipal,
  type FinancialAuditEntityType,
  type FinancialAuditEntry,
  type FinancialNotification,
  type FinancialNotificationType,
  type PaymentClaimDetailView,
  type PaymentVerificationAudit,
  type PaymentVerificationAuditAction,
  type PermissionAction,
  type StudentFeeAccount,
  type StudentFeeAccountStatus,
  type StudentFeeAccountView,
} from '../../types';
import { formatInrFromPaise } from '../../utils/currency';
import { FinanceServiceError } from '../contracts/financeService';
import { formatFinanceId, LocalFinanceStore } from './localFinanceStore';

export function requireActiveActor(
  store: LocalFinanceStore,
  actor: AuthPrincipal | null
): AuthPrincipal {
  if (!actor) {
    throw new FinanceServiceError('UNAUTHORIZED', 'Authentication is required.');
  }
  if (actor.status !== 'active') {
    throw new FinanceServiceError('UNAUTHORIZED', 'Active account status is required.');
  }
  if (actor.role !== 'admin') {
    const acc = store.academicStore.accountStore.findAccountById(actor.loginId);
    if (!acc || acc.status !== 'active') {
      throw new FinanceServiceError('UNAUTHORIZED', 'Account is deactivated or not found.');
    }
  }
  return actor;
}

export function requireAdminActor(
  store: LocalFinanceStore,
  actor: AuthPrincipal | null,
  permission: PermissionAction = 'fees:configure_structure'
): AuthPrincipal {
  const active = requireActiveActor(store, actor);
  if (active.role !== 'admin' || !hasPermission(active.role, permission)) {
    throw new FinanceServiceError(
      'UNAUTHORIZED',
      'Access denied. Only an authorized active Admin may perform this financial action.'
    );
  }
  return active;
}

export function requireTeacherActor(
  store: LocalFinanceStore,
  actor: AuthPrincipal | null
): AuthPrincipal {
  const active = requireActiveActor(store, actor);
  if (active.role !== 'teacher') {
    throw new FinanceServiceError(
      'UNAUTHORIZED',
      'Access denied. Only an authorized active Teacher may access personal salary records.'
    );
  }
  return active;
}

export function requireStudentActor(
  store: LocalFinanceStore,
  actor: AuthPrincipal | null,
  permission: PermissionAction = 'fees:view_receipts'
): AuthPrincipal {
  const active = requireActiveActor(store, actor);
  if (active.role !== 'student' || !hasPermission(active.role, permission)) {
    throw new FinanceServiceError(
      'UNAUTHORIZED',
      'Access denied. Only an authorized active Student / Parent account may perform this action.'
    );
  }
  return active;
}

export function appendFinancialAudit(
  store: LocalFinanceStore,
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
): FinancialAuditEntry {
  const seq = store.counters.financialAuditSeq;
  const id = formatFinanceId('FAUD', seq);
  store.counters.financialAuditSeq = seq + 1;

  const entry: FinancialAuditEntry = {
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    actorId: input.actorId,
    action: input.action,
    previousValues: input.previousValues,
    newValues: input.newValues,
    reason: input.reason,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };

  store.financialAudits = [entry, ...store.financialAudits];
  return entry;
}

export function appendPaymentVerificationAudit(
  store: LocalFinanceStore,
  input: {
    paymentClaimId: string;
    verifiedPaymentId?: string;
    actorId: string;
    action: PaymentVerificationAuditAction;
    previousValues?: string;
    newValues?: string;
    reason?: string;
    timestamp?: string;
  }
): PaymentVerificationAudit {
  const seq = store.counters.verificationAuditSeq;
  const id = formatFinanceId('PVAUD', seq);
  store.counters.verificationAuditSeq = seq + 1;

  const entry: PaymentVerificationAudit = {
    id,
    paymentClaimId: input.paymentClaimId,
    verifiedPaymentId: input.verifiedPaymentId,
    actorId: input.actorId,
    action: input.action,
    previousValues: input.previousValues,
    newValues: input.newValues,
    reason: input.reason,
    timestamp: input.timestamp ?? new Date().toISOString(),
  };

  store.paymentVerificationAudits = [entry, ...store.paymentVerificationAudits];
  return entry;
}

export function enqueueFinancialNotification(
  store: LocalFinanceStore,
  input: {
    recipientId: string;
    notificationType: FinancialNotificationType;
    relatedRecordId: string;
    dedupeKey: string;
    title: string;
    message: string;
  }
): FinancialNotification | null {
  if (store.notifications.some((n) => n.dedupeKey === input.dedupeKey)) {
    return null;
  }
  const seq = store.counters.notificationSeq;
  const id = formatFinanceId('FNOT', seq);
  store.counters.notificationSeq = seq + 1;

  const item: FinancialNotification = {
    id,
    recipientId: input.recipientId.trim().toUpperCase(),
    notificationType: input.notificationType,
    relatedRecordId: input.relatedRecordId,
    dedupeKey: input.dedupeKey,
    title: input.title,
    message: input.message,
    createdAt: new Date().toISOString(),
  };
  store.notifications = [item, ...store.notifications];
  return item;
}

export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function computeFeeAccountStatus(
  store: LocalFinanceStore,
  account: StudentFeeAccount,
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
  const verifiedPaidPaise = store.verifiedPayments
    .filter((vp) => vp.feeAccountId === account.id)
    .reduce((sum, vp) => sum + vp.amountPaise, 0);

  const remainingBalancePaise = Math.max(0, account.amountDuePaise - verifiedPaidPaise);

  const accountClaims = store.paymentClaims.filter((c) => c.feeAccountId === account.id);
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

export function recomputeAndPersistFeeAccount(
  store: LocalFinanceStore,
  accountId: string,
  nowIso = new Date().toISOString()
): StudentFeeAccount {
  const idx = store.studentFeeAccounts.findIndex((a) => a.id === accountId);
  if (idx === -1) {
    throw new FinanceServiceError('NOT_FOUND', `Fee account "${accountId}" not found.`);
  }
  const current = store.studentFeeAccounts[idx];
  const computed = computeFeeAccountStatus(store, current);
  const updated: StudentFeeAccount = {
    ...current,
    verifiedAmountPaidPaise: computed.verifiedPaidPaise,
    remainingBalancePaise: computed.remainingBalancePaise,
    status: computed.status,
    updatedAt: nowIso,
  };
  store.studentFeeAccounts = [
    ...store.studentFeeAccounts.slice(0, idx),
    updated,
    ...store.studentFeeAccounts.slice(idx + 1),
  ];
  return updated;
}

export function getStudentPlacementInfo(store: LocalFinanceStore, studentId: string) {
  const normalized = studentId.trim().toUpperCase();
  const account = store.academicStore.accountStore.findAccountById(normalized);
  const activeEnrolment = store.academicStore.enrolments.find(
    (e) => e.status === 'active' && e.studentAccountId.toUpperCase() === normalized
  );
  const classId = activeEnrolment?.classId ?? account?.classId;
  const batchId = activeEnrolment?.batchId ?? account?.batchId;
  const cls = classId
    ? store.academicStore.classes.find((c) => c.classId === classId)
    : undefined;
  const bat = batchId
    ? store.academicStore.batches.find((b) => b.batchId === batchId)
    : undefined;

  return {
    studentId: account?.accountId ?? normalized,
    studentName: account?.name ?? normalized,
    studentStatus: account?.status === 'active' ? ('active' as const) : ('deactivated' as const),
    classId,
    className: cls?.name ?? account?.className ?? 'Unassigned Class',
    batchId,
    batchName: bat?.name ?? account?.batchName ?? 'Unassigned Batch',
  };
}

export function buildStudentFeeAccountView(
  store: LocalFinanceStore,
  account: StudentFeeAccount
): StudentFeeAccountView {
  const placement = getStudentPlacementInfo(store, account.studentId);
  const computed = computeFeeAccountStatus(store, account);

  const syncedAccount: StudentFeeAccount = {
    ...account,
    verifiedAmountPaidPaise: computed.verifiedPaidPaise,
    remainingBalancePaise: computed.remainingBalancePaise,
    status: computed.status,
  };

  const claims = store.paymentClaims
    .filter((c) => c.feeAccountId === account.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const verifiedPayments = store.verifiedPayments
    .filter((v) => v.feeAccountId === account.id)
    .sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt));

  const receipts = store.receipts
    .filter((r) => r.studentId === account.studentId && r.feePeriod === account.feePeriod)
    .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

  return {
    account: syncedAccount,
    studentName: placement.studentName,
    studentStatus: placement.studentStatus,
    classId: placement.classId,
    className: placement.className,
    batchId: placement.batchId,
    batchName: placement.batchName,
    pendingClaimsPaise: computed.pendingClaimsPaise,
    pendingClaimsCount: computed.pendingClaimsCount,
    rejectedClaimsCount: computed.rejectedClaimsCount,
    isOverdue: computed.isOverdue,
    claims,
    verifiedPayments,
    receipts,
  };
}

export function buildPaymentClaimDetailView(
  store: LocalFinanceStore,
  claim: PaymentClaimDetailView['claim']
): PaymentClaimDetailView {
  const placement = getStudentPlacementInfo(store, claim.studentId);
  const account = store.studentFeeAccounts.find((a) => a.id === claim.feeAccountId);
  const vp = store.verifiedPayments.find((v) => v.paymentClaimId === claim.id);
  const receipt = vp
    ? store.receipts.find((r) => r.verifiedPaymentId === vp.id && r.status === 'issued')
    : undefined;

  return {
    claim,
    studentName: placement.studentName,
    className: placement.className,
    batchName: placement.batchName,
    periodLabel: account?.periodLabel ?? claim.feePeriod,
    accountRemainingBeforeVerificationPaise: account?.remainingBalancePaise ?? 0,
    receipt,
  };
}

/**
 * Generates in-app due-date reminders on demand when Fee screens load.
 * Local development limitation: runs on screen/workflow open rather than background cron;
 * production scheduled reminders require Cloud Scheduler + Cloud Functions once Firebase is connected.
 */
export function syncDueRemindersForStudent(
  store: LocalFinanceStore,
  studentId: string,
  todayIso = getTodayIsoDate()
): void {
  const normalized = studentId.trim().toUpperCase();
  const activeConfig = store.feeConfigurations.find((c) => c.status === 'active');
  const leadDays = activeConfig?.reminderLeadDays ?? 5;

  const accounts = store.studentFeeAccounts.filter(
    (a) => a.studentId.toUpperCase() === normalized
  );
  let mutated = false;

  const todayMs = new Date(`${todayIso}T00:00:00Z`).getTime();

  for (const acc of accounts) {
    const computed = computeFeeAccountStatus(store, acc, todayIso);
    if (computed.remainingBalancePaise <= 0) {
      continue;
    }
    const dueMs = new Date(`${acc.dueAt}T00:00:00Z`).getTime();
    if (Number.isNaN(dueMs) || Number.isNaN(todayMs)) {
      continue;
    }
    const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const added = enqueueFinancialNotification(store, {
        recipientId: normalized,
        notificationType: 'overdue_fee',
        relatedRecordId: acc.id,
        dedupeKey: `overdue_fee:${acc.id}:${acc.dueAt}`,
        title: `Overdue Fee — ${acc.periodLabel}`,
        message: `Remaining balance of ${formatInrFromPaise(computed.remainingBalancePaise)} was due on ${acc.dueAt}.`,
      });
      if (added) mutated = true;
    } else if (diffDays === 0) {
      const added = enqueueFinancialNotification(store, {
        recipientId: normalized,
        notificationType: 'due_today',
        relatedRecordId: acc.id,
        dedupeKey: `due_today:${acc.id}:${acc.dueAt}`,
        title: `Fee Due Today — ${acc.periodLabel}`,
        message: `Remaining balance of ${formatInrFromPaise(computed.remainingBalancePaise)} is due today (${acc.dueAt}).`,
      });
      if (added) mutated = true;
    } else if (diffDays <= leadDays) {
      const added = enqueueFinancialNotification(store, {
        recipientId: normalized,
        notificationType: 'upcoming_due',
        relatedRecordId: acc.id,
        dedupeKey: `upcoming_due:${acc.id}:${acc.dueAt}`,
        title: `Upcoming Fee Due — ${acc.periodLabel}`,
        message: `Remaining balance of ${formatInrFromPaise(computed.remainingBalancePaise)} is due on ${acc.dueAt} (in ${diffDays} day${diffDays === 1 ? '' : 's'}).`,
      });
      if (added) mutated = true;
    }
  }

  if (mutated) {
    store.save();
  }
}
