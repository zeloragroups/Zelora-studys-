import type {
  AuthPrincipal,
  SalaryEligibleSessionItem,
  TeacherSalaryConfiguration,
  TeacherSalaryPayment,
  TeacherSalaryPeriod,
  TeacherSalaryPeriodStatus,
  TeacherSalarySummaryView,
} from '../../types';
import { formatInrFromPaise, formatPeriodLabel, rupeesToPaise } from '../../utils/currency';
import {
  validateIsoDate,
  validateMonthlyPeriod,
  validateRequiredText,
} from '../../utils/validation';
import {
  FinanceServiceError,
  type ITeacherSalaryService,
  type RecordSalaryPaymentInput,
  type SaveTeacherSalaryConfigInput,
} from '../contracts/financeService';
import {
  appendFinancialAudit,
  requireAdminActor,
  requireTeacherActor,
} from './localFinanceHelpers';
import { formatFinanceId, LocalFinanceStore, sharedLocalFinanceStore } from './localFinanceStore';

export class LocalDevSalaryService implements ITeacherSalaryService {
  private readonly store: LocalFinanceStore;

  constructor(store: LocalFinanceStore = sharedLocalFinanceStore) {
    this.store = store;
  }

  async saveTeacherSalaryConfig(
    actor: AuthPrincipal | null,
    input: SaveTeacherSalaryConfigInput
  ): Promise<TeacherSalaryConfiguration> {
    const admin = requireAdminActor(this.store, actor, 'salaries:manage');
    const teacherIdUpper = input.teacherId.trim().toUpperCase();
    const teacherAcc = this.store.academicStore.accountStore.findAccountById(teacherIdUpper);
    if (!teacherAcc || teacherAcc.role !== 'teacher') {
      throw new FinanceServiceError('INVALID_REFERENCE', 'Selected teacher account does not exist.', 'teacherId');
    }
    if (teacherAcc.status !== 'active') {
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

    const nowIso = new Date().toISOString();
    const prevActive = this.store.salaryConfigurations.find(
      (c) => c.teacherId.toUpperCase() === teacherIdUpper && c.status === 'active'
    );

    // Mark previous active config inactive without altering historical salary periods
    this.store.salaryConfigurations = this.store.salaryConfigurations.map((c) =>
      c.teacherId.toUpperCase() === teacherIdUpper && c.status === 'active'
        ? { ...c, status: 'inactive', updatedAt: nowIso }
        : c
    );

    const seq = this.store.counters.salaryConfigSeq;
    const id = formatFinanceId('SCFG', seq);
    this.store.counters.salaryConfigSeq = seq + 1;

    const config: TeacherSalaryConfiguration = {
      id,
      teacherId: teacherAcc.accountId,
      salaryModel: input.salaryModel,
      monthlyAmountPaise,
      perSessionAmountPaise,
      effectiveFrom: input.effectiveFrom.trim(),
      status: 'active',
      createdBy: admin.loginId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    this.store.salaryConfigurations = [config, ...this.store.salaryConfigurations];

    appendFinancialAudit(this.store, {
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

    this.store.save();
    return { ...config };
  }

  private computeEligibleSessionsForTeacherMonth(
    teacherId: string,
    periodYYYYMM: string
  ): {
    sessionIds: string[];
    items: SalaryEligibleSessionItem[];
    requiresAdminReview: boolean;
    reviewReason?: string;
  } {
    const teacherUpper = teacherId.trim().toUpperCase();
    const monthSessions = this.store.attendanceStore.sessions.filter(
      (s) =>
        s.teacherId.toUpperCase() === teacherUpper &&
        s.sessionDate.startsWith(periodYYYYMM)
    );

    const draftSessions = monthSessions.filter((s) => s.status === 'draft');

    // Only completed (submitted/corrected) sessions whose timetable slot is NOT cancelled qualify.
    const seenIds = new Set<string>();
    const items: SalaryEligibleSessionItem[] = [];

    for (const sess of monthSessions) {
      if (sess.status !== 'submitted' && sess.status !== 'corrected') {
        continue;
      }
      if (seenIds.has(sess.id)) {
        continue; // Prevent duplicate session counting
      }
      if (sess.timetableEntryId) {
        const slot = this.store.academicStore.timetable.find(
          (t) => t.entryId === sess.timetableEntryId
        );
        if (slot && slot.status === 'cancelled') {
          continue; // Exclude cancelled timetable sessions
        }
      }
      seenIds.add(sess.id);

      const cls = this.store.academicStore.classes.find((c) => c.classId === sess.classId);
      const bat = this.store.academicStore.batches.find((b) => b.batchId === sess.batchId);
      const sub = this.store.academicStore.subjects.find((sb) => sb.subjectId === sess.subjectId);

      items.push({
        sessionId: sess.id,
        sessionDate: sess.sessionDate,
        className: cls?.name ?? sess.classId,
        batchName: bat?.name ?? sess.batchId,
        subjectName: sub?.name ?? sess.subjectId,
        sessionType: sess.sessionType,
      });
    }

    items.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));

    const activeTimetableCount = this.store.academicStore.timetable.filter(
      (t) => t.teacherAccountId.toUpperCase() === teacherUpper && t.status === 'active'
    ).length;

    let requiresAdminReview = false;
    let reviewReason: string | undefined;

    if (draftSessions.length > 0) {
      requiresAdminReview = true;
      reviewReason = `${draftSessions.length} unsubmitted draft attendance session(s) exist in ${periodYYYYMM}; review before finalizing payout.`;
    } else if (items.length === 0 && activeTimetableCount > 0) {
      requiresAdminReview = true;
      reviewReason = `Teacher has ${activeTimetableCount} active timetable slot(s) but 0 submitted attendance sessions recorded in ${periodYYYYMM}. Source session data is insufficient; Admin review required.`;
    } else if (items.length === 0) {
      requiresAdminReview = true;
      reviewReason = `No completed sessions found in ${periodYYYYMM}; confirm zero payable or adjust with Admin review.`;
    }

    return {
      sessionIds: items.map((i) => i.sessionId),
      items,
      requiresAdminReview,
      reviewReason,
    };
  }

  async generateSalaryPeriodsForMonth(
    actor: AuthPrincipal | null,
    periodYYYYMM: string
  ): Promise<TeacherSalaryPeriod[]> {
    const admin = requireAdminActor(this.store, actor, 'salaries:manage');
    const periodCheck = validateMonthlyPeriod(periodYYYYMM);
    if (!periodCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', periodCheck.error!, 'periodYYYYMM');
    }
    const period = periodYYYYMM.trim();
    const periodEndDate = `${period}-31`;
    const nowIso = new Date().toISOString();

    const activeTeachers = this.store.academicStore.accountStore
      .getAllAccounts()
      .filter((a) => a.role === 'teacher' && a.status === 'active');

    const affectedPeriods: TeacherSalaryPeriod[] = [];

    for (const teacher of activeTeachers) {
      // Pick active configuration effective on or before end of requested month
      const config = this.store.salaryConfigurations.find(
        (c) =>
          c.teacherId.toUpperCase() === teacher.accountId.toUpperCase() &&
          c.status === 'active' &&
          c.effectiveFrom <= periodEndDate
      );
      if (!config) {
        continue;
      }

      const existingIdx = this.store.salaryPeriods.findIndex(
        (p) =>
          p.teacherId.toUpperCase() === teacher.accountId.toUpperCase() &&
          p.period === period
      );

      if (existingIdx !== -1) {
        const existing = this.store.salaryPeriods[existingIdx];
        // Refresh per-session calculation ONLY if zero payments have been recorded yet & not on hold
        if (
          existing.salaryModel === 'per_session' &&
          existing.paidAmountPaise === 0 &&
          existing.status !== 'on_hold'
        ) {
          const calc = this.computeEligibleSessionsForTeacherMonth(teacher.accountId, period);
          const rate = config.perSessionAmountPaise ?? existing.ratePaise;
          const payable = calc.sessionIds.length * rate;
          const refreshed: TeacherSalaryPeriod = {
            ...existing,
            eligibleSessionIds: calc.sessionIds,
            eligibleSessionsSummary: calc.items,
            requiresAdminReview: calc.requiresAdminReview,
            reviewReason: calc.reviewReason,
            payableAmountPaise: payable,
            remainingAmountPaise: payable,
            updatedAt: nowIso,
          };
          this.store.salaryPeriods = [
            ...this.store.salaryPeriods.slice(0, existingIdx),
            refreshed,
            ...this.store.salaryPeriods.slice(existingIdx + 1),
          ];
          affectedPeriods.push({ ...refreshed });
        } else {
          affectedPeriods.push({ ...existing });
        }
        continue;
      }

      const seq = this.store.counters.salaryPeriodSeq;
      const id = formatFinanceId('SPER', seq);
      this.store.counters.salaryPeriodSeq = seq + 1;

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
        const calc = this.computeEligibleSessionsForTeacherMonth(teacher.accountId, period);
        eligibleSessionIds = calc.sessionIds;
        eligibleSessionsSummary = calc.items;
        requiresAdminReview = calc.requiresAdminReview;
        reviewReason = calc.reviewReason;
        payableAmountPaise = eligibleSessionIds.length * ratePaise;
      }

      const newPeriod: TeacherSalaryPeriod = {
        id,
        teacherId: teacher.accountId,
        teacherName: teacher.name,
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
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      this.store.salaryPeriods = [newPeriod, ...this.store.salaryPeriods];
      affectedPeriods.push({ ...newPeriod });

      appendFinancialAudit(this.store, {
        entityType: 'salary_period',
        entityId: newPeriod.id,
        actorId: admin.loginId,
        action: 'salary_period_generated',
        newValues: `${teacher.accountId} · ${period} · ${newPeriod.salaryModel} · payable=${formatInrFromPaise(payableAmountPaise)}`,
        timestamp: nowIso,
      });
    }

    this.store.save();
    return affectedPeriods;
  }

  async listAdminTeacherSalarySummaries(
    actor: AuthPrincipal | null,
    periodFilter?: string
  ): Promise<TeacherSalarySummaryView[]> {
    requireAdminActor(this.store, actor, 'salaries:manage');

    const teachers = this.store.academicStore.accountStore
      .getAllAccounts()
      .filter((a) => a.role === 'teacher')
      .sort((a, b) => a.accountId.localeCompare(b.accountId));

    return teachers.map((t) => this.buildSummaryForTeacher(t.accountId, t.name, t.status, periodFilter));
  }

  private buildSummaryForTeacher(
    teacherId: string,
    teacherName: string,
    teacherStatus: 'active' | 'deactivated',
    periodFilter?: string
  ): TeacherSalarySummaryView {
    const idUpper = teacherId.trim().toUpperCase();
    const configHistory = this.store.salaryConfigurations
      .filter((c) => c.teacherId.toUpperCase() === idUpper)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => ({ ...c }));

    const activeConfig = configHistory.find((c) => c.status === 'active') ?? null;

    let periods = this.store.salaryPeriods
      .filter((p) => p.teacherId.toUpperCase() === idUpper)
      .sort((a, b) => b.period.localeCompare(a.period))
      .map((p) => ({ ...p }));

    if (periodFilter && periodFilter !== 'all') {
      periods = periods.filter((p) => p.period === periodFilter);
    }

    let payments = this.store.salaryPayments
      .filter((pm) => pm.teacherId.toUpperCase() === idUpper)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .map((pm) => ({ ...pm }));

    if (periodFilter && periodFilter !== 'all') {
      payments = payments.filter((pm) => pm.period === periodFilter);
    }

    return {
      teacherId,
      teacherName,
      teacherStatus,
      activeConfig,
      configHistory,
      periods,
      payments,
    };
  }

  private recomputeSalaryPeriod(
    periodId: string,
    nowIso = new Date().toISOString()
  ): TeacherSalaryPeriod {
    const idx = this.store.salaryPeriods.findIndex((p) => p.id === periodId);
    if (idx === -1) {
      throw new FinanceServiceError('NOT_FOUND', 'Teacher salary period not found.');
    }
    const current = this.store.salaryPeriods[idx];
    const paidSum = this.store.salaryPayments
      .filter((pm) => pm.teacherSalaryPeriodId === current.id)
      .reduce((sum, pm) => sum + pm.amountPaise, 0);

    const remaining = Math.max(0, current.payableAmountPaise - paidSum);
    let nextStatus: TeacherSalaryPeriodStatus;
    if (current.status === 'on_hold') {
      nextStatus = 'on_hold';
    } else if (current.payableAmountPaise > 0 && remaining <= 0) {
      nextStatus = 'paid';
    } else if (paidSum > 0) {
      nextStatus = 'partially_paid';
    } else {
      nextStatus = 'pending';
    }

    const updated: TeacherSalaryPeriod = {
      ...current,
      paidAmountPaise: paidSum,
      remainingAmountPaise: remaining,
      status: nextStatus,
      updatedAt: nowIso,
    };
    this.store.salaryPeriods = [
      ...this.store.salaryPeriods.slice(0, idx),
      updated,
      ...this.store.salaryPeriods.slice(idx + 1),
    ];
    return updated;
  }

  async setSalaryPeriodHoldStatus(
    actor: AuthPrincipal | null,
    input: {
      teacherSalaryPeriodId: string;
      onHold: boolean;
      reason: string;
    }
  ): Promise<TeacherSalaryPeriod> {
    const admin = requireAdminActor(this.store, actor, 'salaries:manage');
    const reasonCheck = validateRequiredText(input.reason, 'Reason', 5);
    if (!reasonCheck.valid) {
      throw new FinanceServiceError('CORRECTION_REASON_REQUIRED', reasonCheck.error!, 'reason');
    }

    const idx = this.store.salaryPeriods.findIndex((p) => p.id === input.teacherSalaryPeriodId);
    if (idx === -1) {
      throw new FinanceServiceError('NOT_FOUND', 'Teacher salary period not found.');
    }
    const current = this.store.salaryPeriods[idx];
    const nowIso = new Date().toISOString();

    const updated: TeacherSalaryPeriod = {
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

    this.store.salaryPeriods = [
      ...this.store.salaryPeriods.slice(0, idx),
      updated,
      ...this.store.salaryPeriods.slice(idx + 1),
    ];

    appendFinancialAudit(this.store, {
      entityType: 'salary_period',
      entityId: updated.id,
      actorId: admin.loginId,
      action: input.onHold ? 'salary_period_placed_on_hold' : 'salary_period_hold_released',
      previousValues: `status=${current.status}`,
      newValues: `status=${updated.status}`,
      reason: input.reason.trim(),
      timestamp: nowIso,
    });

    this.store.save();
    return { ...updated };
  }

  async resolveSalaryPeriodReview(
    actor: AuthPrincipal | null,
    input: {
      teacherSalaryPeriodId: string;
      approvedPayableRupees: number | string;
      reason: string;
    }
  ): Promise<TeacherSalaryPeriod> {
    const admin = requireAdminActor(this.store, actor, 'salaries:manage');
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

    const idx = this.store.salaryPeriods.findIndex((p) => p.id === input.teacherSalaryPeriodId);
    if (idx === -1) {
      throw new FinanceServiceError('NOT_FOUND', 'Teacher salary period not found.');
    }
    const current = this.store.salaryPeriods[idx];
    if (approvedPaise < current.paidAmountPaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Approved payable (${formatInrFromPaise(approvedPaise)}) cannot be less than already paid amount (${formatInrFromPaise(current.paidAmountPaise)}).`
      );
    }

    const nowIso = new Date().toISOString();
    const updated: TeacherSalaryPeriod = {
      ...current,
      payableAmountPaise: approvedPaise,
      requiresAdminReview: false,
      reviewReason: `Reviewed & confirmed by ${admin.loginId}: ${input.reason.trim()}`,
      updatedAt: nowIso,
    };

    this.store.salaryPeriods = [
      ...this.store.salaryPeriods.slice(0, idx),
      updated,
      ...this.store.salaryPeriods.slice(idx + 1),
    ];

    const recomputed = this.recomputeSalaryPeriod(updated.id, nowIso);

    appendFinancialAudit(this.store, {
      entityType: 'salary_period',
      entityId: recomputed.id,
      actorId: admin.loginId,
      action: 'salary_period_review_resolved',
      previousValues: `payable=${formatInrFromPaise(current.payableAmountPaise)}, requiresReview=${current.requiresAdminReview}`,
      newValues: `payable=${formatInrFromPaise(recomputed.payableAmountPaise)}, requiresReview=false`,
      reason: input.reason.trim(),
      timestamp: nowIso,
    });

    this.store.save();
    return { ...recomputed };
  }

  async recordSalaryPayment(
    actor: AuthPrincipal | null,
    input: RecordSalaryPaymentInput
  ): Promise<{ payment: TeacherSalaryPayment; period: TeacherSalaryPeriod }> {
    const admin = requireAdminActor(this.store, actor, 'salaries:manage');

    const period = this.store.salaryPeriods.find(
      (p) => p.id === input.teacherSalaryPeriodId
    );
    if (!period) {
      throw new FinanceServiceError('NOT_FOUND', 'Salary period not found.', 'teacherSalaryPeriodId');
    }
    if (period.status === 'on_hold') {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Cannot record payment while this salary period is On Hold. Release hold first.'
      );
    }

    const amountPaise = rupeesToPaise(input.amountRupees);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Salary payment amount must be greater than zero.',
        'amountRupees'
      );
    }
    if (amountPaise > period.remainingAmountPaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Payment (${formatInrFromPaise(amountPaise)}) exceeds remaining payable amount (${formatInrFromPaise(period.remainingAmountPaise)}).`,
        'amountRupees'
      );
    }

    const dateCheck = validateIsoDate(input.paymentDate, 'Payment date');
    if (!dateCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', dateCheck.error!, 'paymentDate');
    }

    const refTrimmed = input.paymentReference?.trim() || undefined;
    if (refTrimmed) {
      const dupRef = this.store.salaryPayments.some(
        (pm) =>
          pm.teacherSalaryPeriodId === period.id &&
          (pm.paymentReference ?? '').toUpperCase() === refTrimmed.toUpperCase()
      );
      if (dupRef) {
        throw new FinanceServiceError(
          'DUPLICATE_CLAIM',
          `Payment reference "${refTrimmed}" is already recorded for this salary period.`,
          'paymentReference'
        );
      }
    }

    const seq = this.store.counters.salaryPaymentSeq;
    const id = formatFinanceId('SPAY', seq);
    this.store.counters.salaryPaymentSeq = seq + 1;
    const nowIso = new Date().toISOString();

    const payment: TeacherSalaryPayment = {
      id,
      teacherSalaryPeriodId: period.id,
      teacherId: period.teacherId,
      period: period.period,
      amountPaise,
      paymentDate: input.paymentDate.trim(),
      paymentReference: refTrimmed,
      note: input.note?.trim() || undefined,
      recordedBy: admin.loginId,
      createdAt: nowIso,
    };

    this.store.salaryPayments = [payment, ...this.store.salaryPayments];
    const updatedPeriod = this.recomputeSalaryPeriod(period.id, nowIso);

    appendFinancialAudit(this.store, {
      entityType: 'salary_payment',
      entityId: payment.id,
      actorId: admin.loginId,
      action: 'salary_payment_recorded',
      previousValues: `paid=${formatInrFromPaise(period.paidAmountPaise)}, remaining=${formatInrFromPaise(period.remainingAmountPaise)}`,
      newValues: `${period.teacherId} (${period.period}): +${formatInrFromPaise(payment.amountPaise)}, remaining=${formatInrFromPaise(updatedPeriod.remainingAmountPaise)}`,
      reason: payment.note ?? 'Manual salary payment tracking entry',
      timestamp: nowIso,
    });

    this.store.save();
    return { payment: { ...payment }, period: { ...updatedPeriod } };
  }

  async correctSalaryPayment(
    actor: AuthPrincipal | null,
    input: {
      salaryPaymentId: string;
      correctedAmountRupees: number | string;
      reason: string;
    }
  ): Promise<{ payment: TeacherSalaryPayment; period: TeacherSalaryPeriod }> {
    const admin = requireAdminActor(this.store, actor, 'salaries:manage');
    const reasonCheck = validateRequiredText(input.reason, 'Correction reason', 5);
    if (!reasonCheck.valid) {
      throw new FinanceServiceError('CORRECTION_REASON_REQUIRED', reasonCheck.error!, 'reason');
    }

    const pmIdx = this.store.salaryPayments.findIndex((p) => p.id === input.salaryPaymentId);
    if (pmIdx === -1) {
      throw new FinanceServiceError('NOT_FOUND', 'Salary payment record not found.');
    }
    const currentPayment = this.store.salaryPayments[pmIdx];
    const period = this.store.salaryPeriods.find(
      (p) => p.id === currentPayment.teacherSalaryPeriodId
    );
    if (!period) {
      throw new FinanceServiceError('NOT_FOUND', 'Linked salary period not found.');
    }

    const newAmountPaise = rupeesToPaise(input.correctedAmountRupees);
    if (!Number.isSafeInteger(newAmountPaise) || newAmountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Corrected salary payment amount must be positive.',
        'correctedAmountRupees'
      );
    }

    const otherPaid = this.store.salaryPayments
      .filter((pm) => pm.teacherSalaryPeriodId === period.id && pm.id !== currentPayment.id)
      .reduce((sum, pm) => sum + pm.amountPaise, 0);

    if (otherPaid + newAmountPaise > period.payableAmountPaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Corrected salary total (${formatInrFromPaise(otherPaid + newAmountPaise)}) exceeds payable amount (${formatInrFromPaise(period.payableAmountPaise)}).`
      );
    }

    const nowIso = new Date().toISOString();
    const updatedPayment: TeacherSalaryPayment = {
      ...currentPayment,
      amountPaise: newAmountPaise,
      corrected: true,
      correctionReason: input.reason.trim(),
      updatedAt: nowIso,
    };

    this.store.salaryPayments = [
      ...this.store.salaryPayments.slice(0, pmIdx),
      updatedPayment,
      ...this.store.salaryPayments.slice(pmIdx + 1),
    ];

    const updatedPeriod = this.recomputeSalaryPeriod(period.id, nowIso);

    appendFinancialAudit(this.store, {
      entityType: 'salary_payment',
      entityId: updatedPayment.id,
      actorId: admin.loginId,
      action: 'salary_payment_corrected',
      previousValues: formatInrFromPaise(currentPayment.amountPaise),
      newValues: `${formatInrFromPaise(updatedPayment.amountPaise)} (remaining ${formatInrFromPaise(updatedPeriod.remainingAmountPaise)})`,
      reason: input.reason.trim(),
      timestamp: nowIso,
    });

    this.store.save();
    return { payment: { ...updatedPayment }, period: { ...updatedPeriod } };
  }

  async getMyTeacherSalaryOverview(
    actor: AuthPrincipal | null
  ): Promise<TeacherSalarySummaryView> {
    const teacher = requireTeacherActor(this.store, actor);
    const acc = this.store.academicStore.accountStore.findAccountById(teacher.loginId);
    return this.buildSummaryForTeacher(
      teacher.loginId,
      acc?.name ?? teacher.fullName,
      (acc?.status ?? teacher.status) === 'deactivated' ? 'deactivated' : 'active'
    );
  }
}

export const localDevSalaryService = new LocalDevSalaryService();
