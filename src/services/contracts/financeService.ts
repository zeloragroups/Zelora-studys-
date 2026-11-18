import type {
  AdminFinancialDashboardData,
  AuthPrincipal,
  FeeConfiguration,
  FeeFrequency,
  FeeReceipt,
  FinancialAuditEntityType,
  FinancialAuditEntry,
  FinancialNotification,
  FinancialReportFilter,
  FinancialReportSummary,
  PaymentClaimDetailView,
  PaymentVerificationAudit,
  PreparedUpiPayment,
  StudentFeeAccountStatus,
  StudentFeeAccountView,
  StudentFeeDashboardData,
  TeacherSalaryConfiguration,
  TeacherSalaryModel,
  TeacherSalaryPayment,
  TeacherSalaryPeriod,
  TeacherSalarySummaryView,
  UpiConfiguration,
  VerifiedPayment,
} from '../../types';

export type FinanceServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_REFERENCE'
  | 'INACTIVE_REFERENCE'
  | 'DUPLICATE_CLAIM'
  | 'DUPLICATE_VERIFICATION'
  | 'OVERPAYMENT_NOT_ALLOWED'
  | 'CORRECTION_REASON_REQUIRED'
  | 'REJECTION_REASON_REQUIRED'
  | 'CONFIRMATION_REQUIRED'
  | 'NO_ACTIVE_CONFIG'
  | 'UPI_DISABLED';

export class FinanceServiceError extends Error {
  code: FinanceServiceErrorCode;
  field?: string;

  constructor(code: FinanceServiceErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'FinanceServiceError';
    this.code = code;
    this.field = field;
  }
}

export interface SaveFeeConfigurationInput {
  amountRupees: number | string;
  frequency: FeeFrequency;
  effectiveFrom: string; // YYYY-MM-DD
  dueDayOfMonth: number;
  yearlyDueDate?: string;
  reminderLeadDays?: number;
  note?: string;
  applyToUnpaidCurrentAccounts?: boolean;
  syncPeriod?: string; // Optional immediate generation for YYYY-MM or YYYY-YYYY
}

export interface SaveUpiConfigurationInput {
  upiId: string;
  payeeName: string;
  description?: string;
  status: 'active' | 'inactive';
}

export interface StudentFeeAccountsFilter {
  search?: string;
  classId?: string;
  batchId?: string;
  feePeriod?: string;
  status?: 'all' | StudentFeeAccountStatus;
}

export interface IFeeConfigurationService {
  getActiveFeeConfiguration(actor: AuthPrincipal | null): Promise<FeeConfiguration | null>;
  listFeeConfigurationHistory(actor: AuthPrincipal | null): Promise<FeeConfiguration[]>;
  saveFeeConfiguration(
    actor: AuthPrincipal | null,
    input: SaveFeeConfigurationInput
  ): Promise<{ config: FeeConfiguration; generatedAccountsCount: number; updatedUnpaidCount: number }>;
  getUpiConfiguration(actor: AuthPrincipal | null): Promise<UpiConfiguration | null>;
  saveUpiConfiguration(
    actor: AuthPrincipal | null,
    input: SaveUpiConfigurationInput
  ): Promise<UpiConfiguration>;
}

export interface IStudentFeeService {
  generateFeeAccountsForPeriod(
    actor: AuthPrincipal | null,
    feePeriod: string
  ): Promise<{ createdCount: number; skippedCount: number }>;
  listAdminStudentFeeAccounts(
    actor: AuthPrincipal | null,
    filter?: StudentFeeAccountsFilter
  ): Promise<StudentFeeAccountView[]>;
  getStudentFeeDashboard(actor: AuthPrincipal | null): Promise<StudentFeeDashboardData>;
}

export interface PrepareUpiPaymentInput {
  feeAccountId: string;
  amountRupees: number | string;
  idempotencyKey?: string;
}

export interface SubmitPaymentClaimInput {
  feeAccountId: string;
  preparedPaymentId?: string;
  paymentReference?: string;
  amountRupees: number | string;
  transactionReference: string;
  paymentDate: string; // YYYY-MM-DD
  studentNote?: string;
}

export interface IPaymentClaimService {
  prepareUpiPayment(
    actor: AuthPrincipal | null,
    input: PrepareUpiPaymentInput
  ): Promise<PreparedUpiPayment>;
  submitPaymentClaim(
    actor: AuthPrincipal | null,
    input: SubmitPaymentClaimInput
  ): Promise<PaymentClaimDetailView>;
  listAdminPaymentClaims(
    actor: AuthPrincipal | null,
    statusFilter?: 'all' | 'verification_pending' | 'verified' | 'rejected'
  ): Promise<PaymentClaimDetailView[]>;
}

export interface IPaymentVerificationService {
  verifyPaymentClaim(
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
  }>;
  rejectPaymentClaim(
    actor: AuthPrincipal | null,
    input: {
      claimId: string;
      rejectionReason: string;
      verificationNote?: string;
    }
  ): Promise<PaymentClaimDetailView>;
  correctVerifiedPayment(
    actor: AuthPrincipal | null,
    input: {
      verifiedPaymentId: string;
      correctedAmountRupees: number | string;
      reason: string;
    }
  ): Promise<{ verifiedPayment: VerifiedPayment; voidedReceiptId?: string; newReceipt?: FeeReceipt }>;
  listPaymentVerificationAudit(
    actor: AuthPrincipal | null,
    claimId?: string
  ): Promise<PaymentVerificationAudit[]>;
}

export interface IReceiptService {
  listReceiptsForAdmin(
    actor: AuthPrincipal | null,
    search?: string
  ): Promise<FeeReceipt[]>;
  listMyReceipts(actor: AuthPrincipal | null): Promise<FeeReceipt[]>;
  getReceiptById(actor: AuthPrincipal | null, receiptId: string): Promise<FeeReceipt>;
  getReceiptForVerifiedPayment(
    actor: AuthPrincipal | null,
    verifiedPaymentId: string
  ): Promise<FeeReceipt>;
}

export interface SaveTeacherSalaryConfigInput {
  teacherId: string;
  salaryModel: TeacherSalaryModel;
  monthlyAmountRupees?: number | string;
  perSessionAmountRupees?: number | string;
  effectiveFrom: string; // YYYY-MM-DD
}

export interface RecordSalaryPaymentInput {
  teacherSalaryPeriodId: string;
  amountRupees: number | string;
  paymentDate: string; // YYYY-MM-DD
  paymentReference?: string;
  note?: string;
}

export interface ITeacherSalaryService {
  saveTeacherSalaryConfig(
    actor: AuthPrincipal | null,
    input: SaveTeacherSalaryConfigInput
  ): Promise<TeacherSalaryConfiguration>;
  generateSalaryPeriodsForMonth(
    actor: AuthPrincipal | null,
    periodYYYYMM: string
  ): Promise<TeacherSalaryPeriod[]>;
  listAdminTeacherSalarySummaries(
    actor: AuthPrincipal | null,
    periodFilter?: string
  ): Promise<TeacherSalarySummaryView[]>;
  setSalaryPeriodHoldStatus(
    actor: AuthPrincipal | null,
    input: {
      teacherSalaryPeriodId: string;
      onHold: boolean;
      reason: string;
    }
  ): Promise<TeacherSalaryPeriod>;
  resolveSalaryPeriodReview(
    actor: AuthPrincipal | null,
    input: {
      teacherSalaryPeriodId: string;
      approvedPayableRupees: number | string;
      reason: string;
    }
  ): Promise<TeacherSalaryPeriod>;
  recordSalaryPayment(
    actor: AuthPrincipal | null,
    input: RecordSalaryPaymentInput
  ): Promise<{ payment: TeacherSalaryPayment; period: TeacherSalaryPeriod }>;
  correctSalaryPayment(
    actor: AuthPrincipal | null,
    input: {
      salaryPaymentId: string;
      correctedAmountRupees: number | string;
      reason: string;
    }
  ): Promise<{ payment: TeacherSalaryPayment; period: TeacherSalaryPeriod }>;
  getMyTeacherSalaryOverview(actor: AuthPrincipal | null): Promise<TeacherSalarySummaryView>;
}

export interface IFinancialReportService {
  getAdminFinancialDashboard(actor: AuthPrincipal | null): Promise<AdminFinancialDashboardData>;
  getFinancialReportSummary(
    actor: AuthPrincipal | null,
    filter: FinancialReportFilter
  ): Promise<FinancialReportSummary>;
  listFinancialAuditHistory(
    actor: AuthPrincipal | null,
    entityType?: 'all' | FinancialAuditEntityType
  ): Promise<FinancialAuditEntry[]>;
}

export interface IFinancialNotificationService {
  listMyFinancialNotifications(actor: AuthPrincipal | null): Promise<FinancialNotification[]>;
  markFinancialNotificationRead(
    actor: AuthPrincipal | null,
    notificationId: string
  ): Promise<FinancialNotification>;
  markAllFinancialNotificationsRead(actor: AuthPrincipal | null): Promise<void>;
}
