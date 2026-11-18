/**
 * Phase 7 — Fee Management, UPI Payment Preparation, Manual Payment Verification,
 * Digital Receipts & Teacher Salary Management Domain Models.
 *
 * Currency rule: All monetary values are stored internally as integer paise (1 INR = 100 paise)
 * to eliminate IEEE-754 floating-point precision drift.
 */

export type FeeFrequency = 'monthly' | 'yearly';

export interface FeeConfiguration {
  id: string; // e.g., FCFG-0001
  amountPaise: number;
  frequency: FeeFrequency;
  effectiveFrom: string; // YYYY-MM-DD
  dueDayOfMonth: number; // 1..28 for monthly due date calculation
  yearlyDueDate?: string; // MM-DD or YYYY-MM-DD for yearly fee due date
  dueDateConfiguration: string; // Human-readable & machine summary (e.g., "10th of each month")
  reminderLeadDays: number; // Days prior to due date for in-app upcoming-due reminder
  status: 'active' | 'inactive';
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpiConfiguration {
  id: string; // e.g., UPIC-0001
  upiId: string;
  payeeName: string;
  description?: string;
  status: 'active' | 'inactive';
  updatedBy: string;
  updatedAt: string;
}

export type StudentFeeAccountStatus =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'verification_pending';

export interface StudentFeeAccount {
  id: string; // e.g., FEE-0001
  studentId: string; // e.g., STU-0001
  feeConfigurationId: string;
  feePeriod: string; // YYYY-MM (monthly) or YYYY / YYYY-YYYY (yearly)
  periodLabel: string;
  frequency: FeeFrequency;
  amountDuePaise: number;
  verifiedAmountPaidPaise: number;
  remainingBalancePaise: number;
  dueAt: string; // YYYY-MM-DD
  status: StudentFeeAccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudentFeeAccountView {
  account: StudentFeeAccount;
  studentName: string;
  studentStatus: 'active' | 'deactivated';
  classId?: string;
  className: string;
  batchId?: string;
  batchName: string;
  pendingClaimsPaise: number;
  pendingClaimsCount: number;
  rejectedClaimsCount: number;
  isOverdue: boolean;
  claims: PaymentClaim[];
  verifiedPayments: VerifiedPayment[];
  receipts: FeeReceipt[];
}

export type PreparedUpiStatus = 'payment_prepared' | 'claim_submitted' | 'expired';

export interface PreparedUpiPayment {
  id: string; // e.g., PREQ-0001
  paymentReference: string; // Unique internal payment ref e.g., PAYREF-202611-0001
  studentId: string;
  feeAccountId: string;
  feePeriod: string;
  amountPaise: number;
  upiId: string;
  payeeName: string;
  description: string;
  upiUri: string;
  paymentType: 'partial' | 'full';
  status: PreparedUpiStatus;
  idempotencyKey: string;
  preparedAt: string;
  claimId?: string;
}

export type PaymentClaimStatus = 'verification_pending' | 'verified' | 'rejected';

export interface PaymentClaim {
  id: string; // e.g., PCLM-0001
  paymentReference: string;
  preparedPaymentId?: string;
  studentId: string;
  feeAccountId: string;
  feePeriod: string;
  amountPaise: number;
  transactionReference: string; // Student-entered UTR / UPI transaction reference (unverified claim)
  paymentDate: string; // YYYY-MM-DD
  studentNote?: string;
  status: PaymentClaimStatus;
  duplicateTransactionFlag: boolean;
  duplicateOfClaimIds?: string[];
  submittedAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNote?: string;
  rejectionReason?: string;
}

export interface PaymentClaimDetailView {
  claim: PaymentClaim;
  studentName: string;
  className: string;
  batchName: string;
  periodLabel: string;
  accountRemainingBeforeVerificationPaise: number;
  receipt?: FeeReceipt;
}

export interface VerifiedPayment {
  id: string; // e.g., VPAY-0001
  paymentClaimId: string;
  paymentReference: string;
  studentId: string;
  feeAccountId: string;
  feePeriod: string;
  amountPaise: number;
  transactionReference: string;
  paymentDate: string;
  verifiedBy: string;
  verifiedAt: string;
  verificationNote?: string;
  corrected?: boolean;
  correctionReason?: string;
  updatedAt?: string;
}

export type PaymentVerificationAuditAction =
  | 'claim_submitted'
  | 'payment_verified'
  | 'payment_rejected'
  | 'payment_corrected';

export interface PaymentVerificationAudit {
  id: string; // e.g., PVAUD-0001
  paymentClaimId: string;
  verifiedPaymentId?: string;
  actorId: string;
  action: PaymentVerificationAuditAction;
  previousValues?: string;
  newValues?: string;
  reason?: string;
  timestamp: string;
}

export interface FeeReceipt {
  id: string; // e.g., REC-0001
  receiptNumber: string; // e.g., RCP-2026-0001
  verifiedPaymentId: string;
  paymentClaimId: string;
  paymentReference: string;
  transactionReference?: string;
  centreName: string;
  studentId: string;
  studentName: string;
  className: string;
  batchName: string;
  feePeriod: string;
  periodLabel: string;
  paymentDate: string;
  amountPaise: number; // Verified payment amount covered by this receipt
  totalFeeDuePaise: number;
  totalAmountPaidAfterPaise: number;
  remainingBalancePaise: number;
  verificationStatus: 'verified' | 'voided';
  issuedBy: string;
  issuedAt: string;
  status: 'issued' | 'voided';
  voidReason?: string;
}

export type TeacherSalaryModel = 'fixed_monthly' | 'per_session';

export interface TeacherSalaryConfiguration {
  id: string; // e.g., SCFG-0001
  teacherId: string; // e.g., TCH-0001
  salaryModel: TeacherSalaryModel;
  monthlyAmountPaise?: number;
  perSessionAmountPaise?: number;
  effectiveFrom: string; // YYYY-MM-DD
  status: 'active' | 'inactive';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type TeacherSalaryPeriodStatus = 'pending' | 'partially_paid' | 'paid' | 'on_hold';

export interface SalaryEligibleSessionItem {
  sessionId: string;
  sessionDate: string;
  className: string;
  batchName: string;
  subjectName: string;
  sessionType: 'regular' | 'examination';
}

export interface TeacherSalaryPeriod {
  id: string; // e.g., SPER-0001
  teacherId: string;
  teacherName: string;
  salaryConfigurationId: string;
  period: string; // YYYY-MM
  periodLabel: string;
  salaryModel: TeacherSalaryModel;
  ratePaise: number;
  eligibleSessionIds: string[];
  eligibleSessionsSummary: SalaryEligibleSessionItem[];
  requiresAdminReview: boolean;
  reviewReason?: string;
  payableAmountPaise: number;
  paidAmountPaise: number;
  remainingAmountPaise: number;
  status: TeacherSalaryPeriodStatus;
  holdReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherSalaryPayment {
  id: string; // e.g., SPAY-0001
  teacherSalaryPeriodId: string;
  teacherId: string;
  period: string;
  amountPaise: number;
  paymentDate: string; // YYYY-MM-DD
  paymentReference?: string;
  note?: string;
  recordedBy: string;
  createdAt: string;
  corrected?: boolean;
  correctionReason?: string;
  updatedAt?: string;
}

export interface TeacherSalarySummaryView {
  teacherId: string;
  teacherName: string;
  teacherStatus: 'active' | 'deactivated';
  activeConfig: TeacherSalaryConfiguration | null;
  configHistory: TeacherSalaryConfiguration[];
  periods: TeacherSalaryPeriod[];
  payments: TeacherSalaryPayment[];
}

export type FinancialAuditEntityType =
  | 'fee_configuration'
  | 'upi_configuration'
  | 'fee_account'
  | 'payment_claim'
  | 'verified_payment'
  | 'fee_receipt'
  | 'salary_configuration'
  | 'salary_period'
  | 'salary_payment';

export interface FinancialAuditEntry {
  id: string; // e.g., FAUD-0001
  entityType: FinancialAuditEntityType;
  entityId: string;
  actorId: string;
  action: string;
  previousValues?: string;
  newValues?: string;
  reason?: string;
  timestamp: string;
}

export type FinancialNotificationType =
  | 'upcoming_due'
  | 'due_today'
  | 'overdue_fee'
  | 'claim_received'
  | 'payment_verified'
  | 'payment_rejected'
  | 'receipt_issued';

export interface FinancialNotification {
  id: string; // e.g., FNOT-0001
  recipientId: string;
  notificationType: FinancialNotificationType;
  relatedRecordId: string;
  dedupeKey: string;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
}

export interface AdminFinancialDashboardData {
  totalVerifiedCollectionsPaise: number;
  totalOutstandingStudentFeesPaise: number;
  pendingPaymentClaimsPaise: number;
  pendingPaymentClaimsCount: number;
  verifiedPaymentsCount: number;
  rejectedClaimsPaise: number;
  rejectedClaimsCount: number;
  currentMonthCollectionsPaise: number;
  currentYearCollectionsPaise: number;
  totalTeacherSalaryPayablePaise: number;
  totalTeacherSalaryPaidPaise: number;
  pendingTeacherSalaryPaise: number;
  netRecordedBalancePaise: number; // Explicitly Verified Fee Collections - Recorded Salary Payments
  activeFeeConfig: FeeConfiguration | null;
  upiConfig: UpiConfiguration | null;
  currentPeriod: string;
  currentYear: string;
}

export interface StudentFeeDashboardData {
  activeFeeConfig: FeeConfiguration | null;
  upiConfig: UpiConfiguration | null;
  accounts: StudentFeeAccountView[];
  totalDuePaise: number;
  totalVerifiedPaidPaise: number;
  totalPendingClaimsPaise: number;
  totalRemainingBalancePaise: number;
  notifications: FinancialNotification[];
  unreadNotificationCount: number;
  receipts: FeeReceipt[];
  claims: PaymentClaimDetailView[];
}

export interface FinancialReportFilter {
  granularity: 'monthly' | 'yearly';
  month?: string; // YYYY-MM
  year?: string; // YYYY
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  classId?: string;
  batchId?: string;
  teacherId?: string;
}

export interface StudentFeeReportRow {
  studentId: string;
  studentName: string;
  className: string;
  batchName: string;
  feePeriod: string;
  expectedPaise: number;
  verifiedPaidPaise: number;
  pendingClaimsPaise: number;
  rejectedClaimsPaise: number;
  outstandingPaise: number;
  status: StudentFeeAccountStatus;
}

export interface TeacherSalaryReportRow {
  teacherId: string;
  teacherName: string;
  period: string;
  salaryModel: TeacherSalaryModel;
  payablePaise: number;
  paidPaise: number;
  remainingPaise: number;
  status: TeacherSalaryPeriodStatus;
  requiresAdminReview: boolean;
}

export interface FinancialReportSummary {
  filter: FinancialReportFilter;
  periodTitle: string;
  feeSummary: {
    totalExpectedPaise: number;
    totalVerifiedCollectionsPaise: number;
    totalOutstandingPaise: number;
    partialPaymentsCount: number;
    pendingVerificationPaise: number;
    pendingVerificationCount: number;
    rejectedClaimsPaise: number;
    rejectedClaimsCount: number;
    studentRows: StudentFeeReportRow[];
  };
  salarySummary: {
    totalSalaryPayablePaise: number;
    totalSalaryPaidPaise: number;
    pendingSalaryPaise: number;
    teacherRows: TeacherSalaryReportRow[];
  };
  netRecordedBalancePaise: number;
}
