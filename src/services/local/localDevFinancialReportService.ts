import type {
  AdminFinancialDashboardData,
  AuthPrincipal,
  FinancialAuditEntityType,
  FinancialAuditEntry,
  FinancialReportFilter,
  FinancialReportSummary,
  StudentFeeReportRow,
  TeacherSalaryReportRow,
} from '../../types';
import { formatPeriodLabel } from '../../utils/currency';
import { type IFinancialReportService } from '../contracts/financeService';
import {
  computeFeeAccountStatus,
  getStudentPlacementInfo,
  requireAdminActor,
} from './localFinanceHelpers';
import { LocalFinanceStore, sharedLocalFinanceStore } from './localFinanceStore';

export class LocalDevFinancialReportService implements IFinancialReportService {
  private readonly store: LocalFinanceStore;

  constructor(store: LocalFinanceStore = sharedLocalFinanceStore) {
    this.store = store;
  }

  async getAdminFinancialDashboard(
    actor: AuthPrincipal | null
  ): Promise<AdminFinancialDashboardData> {
    requireAdminActor(this.store, actor, 'reports:view_financial');

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYear = String(now.getFullYear());

    // Strictly count ONLY VerifiedPayment records in confirmed collections
    const totalVerifiedCollectionsPaise = this.store.verifiedPayments.reduce(
      (sum, vp) => sum + vp.amountPaise,
      0
    );

    const currentMonthCollectionsPaise = this.store.verifiedPayments
      .filter((vp) => vp.paymentDate.startsWith(currentPeriod))
      .reduce((sum, vp) => sum + vp.amountPaise, 0);

    const currentYearCollectionsPaise = this.store.verifiedPayments
      .filter((vp) => vp.paymentDate.startsWith(currentYear))
      .reduce((sum, vp) => sum + vp.amountPaise, 0);

    const totalOutstandingStudentFeesPaise = this.store.studentFeeAccounts.reduce((sum, acc) => {
      const computed = computeFeeAccountStatus(this.store, acc);
      return sum + computed.remainingBalancePaise;
    }, 0);

    const pendingClaims = this.store.paymentClaims.filter(
      (c) => c.status === 'verification_pending'
    );
    const pendingPaymentClaimsPaise = pendingClaims.reduce((sum, c) => sum + c.amountPaise, 0);

    const rejectedClaims = this.store.paymentClaims.filter((c) => c.status === 'rejected');
    const rejectedClaimsPaise = rejectedClaims.reduce((sum, c) => sum + c.amountPaise, 0);

    const totalTeacherSalaryPayablePaise = this.store.salaryPeriods.reduce(
      (sum, sp) => sum + sp.payableAmountPaise,
      0
    );
    const totalTeacherSalaryPaidPaise = this.store.salaryPayments.reduce(
      (sum, pm) => sum + pm.amountPaise,
      0
    );
    const pendingTeacherSalaryPaise = Math.max(
      0,
      totalTeacherSalaryPayablePaise - totalTeacherSalaryPaidPaise
    );

    // Explicitly defined Net Recorded Balance = Confirmed Fee Collections - Recorded Salary Payments
    const netRecordedBalancePaise = totalVerifiedCollectionsPaise - totalTeacherSalaryPaidPaise;

    return {
      totalVerifiedCollectionsPaise,
      totalOutstandingStudentFeesPaise,
      pendingPaymentClaimsPaise,
      pendingPaymentClaimsCount: pendingClaims.length,
      verifiedPaymentsCount: this.store.verifiedPayments.length,
      rejectedClaimsPaise,
      rejectedClaimsCount: rejectedClaims.length,
      currentMonthCollectionsPaise,
      currentYearCollectionsPaise,
      totalTeacherSalaryPayablePaise,
      totalTeacherSalaryPaidPaise,
      pendingTeacherSalaryPaise,
      netRecordedBalancePaise,
      activeFeeConfig:
        this.store.feeConfigurations.find((c) => c.status === 'active') ?? null,
      upiConfig: this.store.upiConfigurations[0] ?? null,
      currentPeriod,
      currentYear,
    };
  }

  async getFinancialReportSummary(
    actor: AuthPrincipal | null,
    filter: FinancialReportFilter
  ): Promise<FinancialReportSummary> {
    requireAdminActor(this.store, actor, 'reports:view_financial');

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

    // 1. Fee Accounts matching period + class/batch filters
    const filteredAccounts = this.store.studentFeeAccounts.filter((acc) => {
      if (!matchesPeriod(acc.feePeriod)) return false;
      const placement = getStudentPlacementInfo(this.store, acc.studentId);
      if (filter.classId && filter.classId !== 'all' && placement.classId !== filter.classId) {
        return false;
      }
      if (filter.batchId && filter.batchId !== 'all' && placement.batchId !== filter.batchId) {
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
      const placement = getStudentPlacementInfo(this.store, acc.studentId);
      const computed = computeFeeAccountStatus(this.store, acc);

      const accountVerified = this.store.verifiedPayments.filter(
        (v) =>
          v.feeAccountId === acc.id &&
          (!hasDateWindow || matchesPaymentDate(v.paymentDate))
      );
      const verifiedPaidPaise = accountVerified.reduce((sum, v) => sum + v.amountPaise, 0);

      const accountClaims = this.store.paymentClaims.filter(
        (c) =>
          c.feeAccountId === acc.id &&
          (!hasDateWindow || matchesPaymentDate(c.paymentDate))
      );
      const pendingClaims = accountClaims.filter((c) => c.status === 'verification_pending');
      const rejectedClaims = accountClaims.filter((c) => c.status === 'rejected');

      const pendingAmt = pendingClaims.reduce((sum, c) => sum + c.amountPaise, 0);
      const rejectedAmt = rejectedClaims.reduce((sum, c) => sum + c.amountPaise, 0);

      totalExpectedPaise += acc.amountDuePaise;
      totalVerifiedCollectionsPaise += verifiedPaidPaise;
      totalOutstandingPaise += computed.remainingBalancePaise;
      if (computed.status === 'partially_paid' || (verifiedPaidPaise > 0 && computed.remainingBalancePaise > 0)) {
        partialPaymentsCount++;
      }
      pendingVerificationPaise += pendingAmt;
      pendingVerificationCount += pendingClaims.length;
      rejectedClaimsPaise += rejectedAmt;
      rejectedClaimsCount += rejectedClaims.length;

      studentRows.push({
        studentId: acc.studentId,
        studentName: placement.studentName,
        className: placement.className,
        batchName: placement.batchName,
        feePeriod: acc.feePeriod,
        expectedPaise: acc.amountDuePaise,
        verifiedPaidPaise,
        pendingClaimsPaise: pendingAmt,
        rejectedClaimsPaise: rejectedAmt,
        outstandingPaise: computed.remainingBalancePaise,
        status: computed.status,
      });
    }

    // 2. Teacher Salary Periods matching period + teacher filters
    const filteredSalaryPeriods = this.store.salaryPeriods.filter((sp) => {
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
      const periodPayments = this.store.salaryPayments.filter(
        (pm) =>
          pm.teacherSalaryPeriodId === sp.id &&
          (!hasDateWindow || matchesPaymentDate(pm.paymentDate))
      );
      const paidInWindow = periodPayments.reduce((sum, pm) => sum + pm.amountPaise, 0);
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
            b.feePeriod.localeCompare(a.feePeriod) ||
            a.studentId.localeCompare(b.studentId)
        ),
      },
      salarySummary: {
        totalSalaryPayablePaise,
        totalSalaryPaidPaise,
        pendingSalaryPaise,
        teacherRows: teacherRows.sort(
          (a, b) =>
            b.period.localeCompare(a.period) || a.teacherId.localeCompare(b.teacherId)
        ),
      },
      netRecordedBalancePaise: totalVerifiedCollectionsPaise - totalSalaryPaidPaise,
    };
  }

  async listFinancialAuditHistory(
    actor: AuthPrincipal | null,
    entityType: 'all' | FinancialAuditEntityType = 'all'
  ): Promise<FinancialAuditEntry[]> {
    requireAdminActor(this.store, actor, 'reports:view_financial');
    const items =
      entityType === 'all'
        ? this.store.financialAudits
        : this.store.financialAudits.filter((a) => a.entityType === entityType);
    return [...items]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .map((a) => ({ ...a }));
  }
}

export const localDevFinancialReportService = new LocalDevFinancialReportService();
