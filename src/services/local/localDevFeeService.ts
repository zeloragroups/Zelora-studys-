import type {
  AuthPrincipal,
  FeeConfiguration,
  FinancialNotification,
  StudentFeeAccount,
  StudentFeeAccountView,
  StudentFeeDashboardData,
  UpiConfiguration,
} from '../../types';
import {
  computeMonthlyDueDate,
  formatInrFromPaise,
  formatPeriodLabel,
  rupeesToPaise,
} from '../../utils/currency';
import {
  validateIsoDate,
  validateMonthlyPeriod,
  validateRequiredText,
  validateUpiId,
  validateYearlyPeriod,
} from '../../utils/validation';
import {
  FinanceServiceError,
  type IFeeConfigurationService,
  type IFinancialNotificationService,
  type IStudentFeeService,
  type SaveFeeConfigurationInput,
  type SaveUpiConfigurationInput,
  type StudentFeeAccountsFilter,
} from '../contracts/financeService';
import {
  appendFinancialAudit,
  buildPaymentClaimDetailView,
  buildStudentFeeAccountView,
  computeFeeAccountStatus,
  getTodayIsoDate,
  requireActiveActor,
  requireAdminActor,
  requireStudentActor,
  syncDueRemindersForStudent,
} from './localFinanceHelpers';
import { formatFinanceId, LocalFinanceStore, sharedLocalFinanceStore } from './localFinanceStore';

function computeDueDateForPeriod(
  config: FeeConfiguration,
  feePeriod: string
): string {
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

export class LocalDevFeeService
  implements IFeeConfigurationService, IStudentFeeService, IFinancialNotificationService
{
  private readonly store: LocalFinanceStore;

  constructor(store: LocalFinanceStore = sharedLocalFinanceStore) {
    this.store = store;
  }

  async getActiveFeeConfiguration(
    actor: AuthPrincipal | null
  ): Promise<FeeConfiguration | null> {
    requireActiveActor(this.store, actor);
    const active = this.store.feeConfigurations.find((c) => c.status === 'active');
    return active ? { ...active } : null;
  }

  async listFeeConfigurationHistory(
    actor: AuthPrincipal | null
  ): Promise<FeeConfiguration[]> {
    requireAdminActor(this.store, actor, 'fees:configure_structure');
    return [...this.store.feeConfigurations]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({ ...c }));
  }

  async saveFeeConfiguration(
    actor: AuthPrincipal | null,
    input: SaveFeeConfigurationInput
  ): Promise<{
    config: FeeConfiguration;
    generatedAccountsCount: number;
    updatedUnpaidCount: number;
  }> {
    const admin = requireAdminActor(this.store, actor, 'fees:configure_structure');

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

    const nowIso = new Date().toISOString();
    const prevActive = this.store.feeConfigurations.find((c) => c.status === 'active');

    // Preserve previous configurations cleanly as inactive history
    this.store.feeConfigurations = this.store.feeConfigurations.map((c) =>
      c.status === 'active' ? { ...c, status: 'inactive', updatedAt: nowIso } : c
    );

    const seq = this.store.counters.feeConfigSeq;
    const id = formatFinanceId('FCFG', seq);
    this.store.counters.feeConfigSeq = seq + 1;

    const dueDesc =
      input.frequency === 'monthly'
        ? `${dueDay}${dueDay === 1 ? 'st' : dueDay === 2 ? 'nd' : dueDay === 3 ? 'rd' : 'th'} of each month`
        : input.yearlyDueDate?.trim()
          ? `Yearly due date: ${input.yearlyDueDate.trim()}`
          : `Yearly (${dueDay}th of start month)`;

    const config: FeeConfiguration = {
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
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.store.feeConfigurations = [config, ...this.store.feeConfigurations];

    appendFinancialAudit(this.store, {
      entityType: 'fee_configuration',
      entityId: config.id,
      actorId: admin.loginId,
      action: prevActive ? 'fee_config_updated' : 'fee_config_created',
      previousValues: prevActive
        ? `${prevActive.id}: ${prevActive.frequency} ${formatInrFromPaise(prevActive.amountPaise)} (due ${prevActive.dueDateConfiguration})`
        : undefined,
      newValues: `${config.id}: ${config.frequency} ${formatInrFromPaise(config.amountPaise)} effective ${config.effectiveFrom} (${config.dueDateConfiguration})`,
      reason: config.note ?? 'Admin fee configuration update',
      timestamp: nowIso,
    });

    let generatedAccountsCount = 0;
    let updatedUnpaidCount = 0;

    if (input.syncPeriod && input.syncPeriod.trim()) {
      const targetPeriod = input.syncPeriod.trim();
      const res = this.internalGenerateOrSyncAccountsForPeriod(
        admin.loginId,
        config,
        targetPeriod,
        Boolean(input.applyToUnpaidCurrentAccounts)
      );
      generatedAccountsCount = res.createdCount;
      updatedUnpaidCount = res.updatedUnpaidCount;
    }

    this.store.save();
    return {
      config: { ...config },
      generatedAccountsCount,
      updatedUnpaidCount,
    };
  }

  async getUpiConfiguration(actor: AuthPrincipal | null): Promise<UpiConfiguration | null> {
    requireActiveActor(this.store, actor);
    const latest = this.store.upiConfigurations[0];
    return latest ? { ...latest } : null;
  }

  async saveUpiConfiguration(
    actor: AuthPrincipal | null,
    input: SaveUpiConfigurationInput
  ): Promise<UpiConfiguration> {
    const admin = requireAdminActor(this.store, actor, 'fees:configure_structure');

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

    const nowIso = new Date().toISOString();
    const prev = this.store.upiConfigurations[0];
    const seq = this.store.counters.upiConfigSeq;
    const id = formatFinanceId('UPIC', seq);
    this.store.counters.upiConfigSeq = seq + 1;

    const nextConfig: UpiConfiguration = {
      id,
      upiId: input.upiId.trim(),
      payeeName: input.payeeName.trim(),
      description: input.description?.trim() || undefined,
      status: input.status,
      updatedBy: admin.loginId,
      updatedAt: nowIso,
    };

    this.store.upiConfigurations = [nextConfig, ...this.store.upiConfigurations];

    appendFinancialAudit(this.store, {
      entityType: 'upi_configuration',
      entityId: nextConfig.id,
      actorId: admin.loginId,
      action: prev ? 'upi_config_updated' : 'upi_config_created',
      previousValues: prev ? `${prev.upiId} (${prev.payeeName}, ${prev.status})` : undefined,
      newValues: `${nextConfig.upiId} (${nextConfig.payeeName}, ${nextConfig.status})`,
      timestamp: nowIso,
    });

    this.store.save();
    return { ...nextConfig };
  }

  async generateFeeAccountsForPeriod(
    actor: AuthPrincipal | null,
    feePeriod: string
  ): Promise<{ createdCount: number; skippedCount: number }> {
    const admin = requireAdminActor(this.store, actor, 'fees:configure_structure');
    const activeConfig = this.store.feeConfigurations.find((c) => c.status === 'active');
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

    const res = this.internalGenerateOrSyncAccountsForPeriod(admin.loginId, activeConfig, trimmed, false);
    this.store.save();
    return { createdCount: res.createdCount, skippedCount: res.skippedCount };
  }

  private internalGenerateOrSyncAccountsForPeriod(
    adminId: string,
    config: FeeConfiguration,
    feePeriod: string,
    updateEligibleUnpaid: boolean
  ): { createdCount: number; skippedCount: number; updatedUnpaidCount: number } {
    const activeStudents = this.store.academicStore.accountStore
      .getAllAccounts()
      .filter((acc) => acc.role === 'student' && acc.status === 'active');

    const nowIso = new Date().toISOString();
    const dueAt = computeDueDateForPeriod(config, feePeriod);
    const periodLabel = formatPeriodLabel(feePeriod);

    let createdCount = 0;
    let skippedCount = 0;
    let updatedUnpaidCount = 0;

    for (const stu of activeStudents) {
      const existingIdx = this.store.studentFeeAccounts.findIndex(
        (a) =>
          a.studentId.toUpperCase() === stu.accountId.toUpperCase() &&
          a.feePeriod === feePeriod
      );

      if (existingIdx !== -1) {
        const existing = this.store.studentFeeAccounts[existingIdx];
        const computed = computeFeeAccountStatus(this.store, existing);
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
          const updated: StudentFeeAccount = {
            ...existing,
            feeConfigurationId: config.id,
            frequency: config.frequency,
            amountDuePaise: config.amountPaise,
            remainingBalancePaise: config.amountPaise,
            dueAt,
            updatedAt: nowIso,
          };
          updated.status = computeFeeAccountStatus(this.store, updated).status;
          this.store.studentFeeAccounts = [
            ...this.store.studentFeeAccounts.slice(0, existingIdx),
            updated,
            ...this.store.studentFeeAccounts.slice(existingIdx + 1),
          ];
          appendFinancialAudit(this.store, {
            entityType: 'fee_account',
            entityId: updated.id,
            actorId: adminId,
            action: 'unpaid_fee_account_synced_to_new_config',
            previousValues: prevSummary,
            newValues: `${config.id} ${formatInrFromPaise(config.amountPaise)} due ${dueAt}`,
            reason: `Applied ${config.id} (effective ${config.effectiveFrom}) to unpaid period with zero payments/claims`,
            timestamp: nowIso,
          });
          updatedUnpaidCount++;
        } else {
          skippedCount++;
        }
        continue;
      }

      const seq = this.store.counters.feeAccountSeq;
      const id = formatFinanceId('FEE', seq);
      this.store.counters.feeAccountSeq = seq + 1;

      const today = getTodayIsoDate();
      const created: StudentFeeAccount = {
        id,
        studentId: stu.accountId,
        feeConfigurationId: config.id,
        feePeriod,
        periodLabel,
        frequency: config.frequency,
        amountDuePaise: config.amountPaise,
        verifiedAmountPaidPaise: 0,
        remainingBalancePaise: config.amountPaise,
        dueAt,
        status: today > dueAt ? 'overdue' : 'unpaid',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.store.studentFeeAccounts = [created, ...this.store.studentFeeAccounts];
      createdCount++;
    }

    return { createdCount, skippedCount, updatedUnpaidCount };
  }

  async listAdminStudentFeeAccounts(
    actor: AuthPrincipal | null,
    filter?: StudentFeeAccountsFilter
  ): Promise<StudentFeeAccountView[]> {
    requireAdminActor(this.store, actor, 'fees:configure_structure');

    let views = this.store.studentFeeAccounts.map((acc) =>
      buildStudentFeeAccountView(this.store, acc)
    );

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
  }

  async getStudentFeeDashboard(
    actor: AuthPrincipal | null
  ): Promise<StudentFeeDashboardData> {
    const student = requireStudentActor(this.store, actor, 'fees:view_receipts');
    const normalizedId = student.loginId.trim().toUpperCase();

    // Generate on-demand in-app due reminders for this student
    syncDueRemindersForStudent(this.store, normalizedId);

    const activeFeeConfig =
      this.store.feeConfigurations.find((c) => c.status === 'active') ?? null;
    const upiConfig = this.store.upiConfigurations[0] ?? null;

    const accounts = this.store.studentFeeAccounts
      .filter((a) => a.studentId.toUpperCase() === normalizedId)
      .map((a) => buildStudentFeeAccountView(this.store, a))
      .sort((a, b) => b.account.feePeriod.localeCompare(a.account.feePeriod));

    const totalDuePaise = accounts.reduce((sum, v) => sum + v.account.amountDuePaise, 0);
    const totalVerifiedPaidPaise = accounts.reduce(
      (sum, v) => sum + v.account.verifiedAmountPaidPaise,
      0
    );
    const totalPendingClaimsPaise = accounts.reduce(
      (sum, v) => sum + v.pendingClaimsPaise,
      0
    );
    const totalRemainingBalancePaise = accounts.reduce(
      (sum, v) => sum + v.account.remainingBalancePaise,
      0
    );

    const notifications = this.store.notifications
      .filter((n) => n.recipientId.toUpperCase() === normalizedId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({ ...n }));

    const unreadNotificationCount = notifications.filter((n) => !n.readAt).length;

    const receipts = this.store.receipts
      .filter((r) => r.studentId.toUpperCase() === normalizedId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .map((r) => ({ ...r }));

    const claims = this.store.paymentClaims
      .filter((c) => c.studentId.toUpperCase() === normalizedId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((c) => buildPaymentClaimDetailView(this.store, c));

    return {
      activeFeeConfig: activeFeeConfig ? { ...activeFeeConfig } : null,
      upiConfig: upiConfig ? { ...upiConfig } : null,
      accounts,
      totalDuePaise,
      totalVerifiedPaidPaise,
      totalPendingClaimsPaise,
      totalRemainingBalancePaise,
      notifications,
      unreadNotificationCount,
      receipts,
      claims,
    };
  }

  async listMyFinancialNotifications(
    actor: AuthPrincipal | null
  ): Promise<FinancialNotification[]> {
    const active = requireActiveActor(this.store, actor);
    const recipient = active.role === 'admin' ? 'ADM-0001' : active.loginId.trim().toUpperCase();
    return this.store.notifications
      .filter((n) => n.recipientId.toUpperCase() === recipient)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((n) => ({ ...n }));
  }

  async markFinancialNotificationRead(
    actor: AuthPrincipal | null,
    notificationId: string
  ): Promise<FinancialNotification> {
    const active = requireActiveActor(this.store, actor);
    const idx = this.store.notifications.findIndex((n) => n.id === notificationId);
    if (idx === -1) {
      throw new FinanceServiceError('NOT_FOUND', 'Financial notification not found.');
    }
    const target = this.store.notifications[idx];
    const allowedRecipient =
      active.role === 'admin'
        ? target.recipientId.toUpperCase().startsWith('ADM-')
        : target.recipientId.toUpperCase() === active.loginId.trim().toUpperCase();

    if (!allowedRecipient) {
      throw new FinanceServiceError(
        'UNAUTHORIZED',
        'Access denied to another user notification.'
      );
    }

    const updated: FinancialNotification = {
      ...target,
      readAt: target.readAt ?? new Date().toISOString(),
    };
    this.store.notifications = [
      ...this.store.notifications.slice(0, idx),
      updated,
      ...this.store.notifications.slice(idx + 1),
    ];
    this.store.save();
    return { ...updated };
  }

  async markAllFinancialNotificationsRead(actor: AuthPrincipal | null): Promise<void> {
    const active = requireActiveActor(this.store, actor);
    const nowIso = new Date().toISOString();
    const loginUpper = active.loginId.trim().toUpperCase();

    this.store.notifications = this.store.notifications.map((n) => {
      const match =
        active.role === 'admin'
          ? n.recipientId.toUpperCase().startsWith('ADM-')
          : n.recipientId.toUpperCase() === loginUpper;
      return match && !n.readAt ? { ...n, readAt: nowIso } : n;
    });
    this.store.save();
  }
}

export const localDevFeeService = new LocalDevFeeService();
