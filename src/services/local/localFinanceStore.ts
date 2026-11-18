import { DEFAULT_BRANDING_CONFIG } from '../../config/branding';
import type {
  FeeConfiguration,
  FeeReceipt,
  FinancialAuditEntry,
  FinancialNotification,
  PaymentClaim,
  PaymentVerificationAudit,
  PreparedUpiPayment,
  StudentFeeAccount,
  TeacherSalaryConfiguration,
  TeacherSalaryPayment,
  TeacherSalaryPeriod,
  UpiConfiguration,
  VerifiedPayment,
} from '../../types';
import { LocalAcademicStore, sharedLocalAcademicStore } from './localAcademicStore';
import { LocalAttendanceStore, sharedLocalAttendanceStore } from './localAttendanceStore';

const FINANCE_STORAGE_KEY = 'tuition_ecosystem_dev_finance_v1';

export interface FinanceCounters {
  feeConfigSeq: number;
  upiConfigSeq: number;
  feeAccountSeq: number;
  preparedUpiSeq: number;
  paymentClaimSeq: number;
  verifiedPaymentSeq: number;
  verificationAuditSeq: number;
  receiptSeq: number;
  salaryConfigSeq: number;
  salaryPeriodSeq: number;
  salaryPaymentSeq: number;
  financialAuditSeq: number;
  notificationSeq: number;
}

interface PersistedFinanceState {
  feeConfigurations: FeeConfiguration[];
  upiConfigurations: UpiConfiguration[];
  studentFeeAccounts: StudentFeeAccount[];
  preparedUpiPayments: PreparedUpiPayment[];
  paymentClaims: PaymentClaim[];
  verifiedPayments: VerifiedPayment[];
  paymentVerificationAudits: PaymentVerificationAudit[];
  receipts: FeeReceipt[];
  salaryConfigurations: TeacherSalaryConfiguration[];
  salaryPeriods: TeacherSalaryPeriod[];
  salaryPayments: TeacherSalaryPayment[];
  financialAudits: FinancialAuditEntry[];
  notifications: FinancialNotification[];
  counters: FinanceCounters;
}

function getSafeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function formatFinanceId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export function formatReceiptNumber(year: string, seq: number): string {
  return `RCP-${year}-${String(seq).padStart(4, '0')}`;
}

export class LocalFinanceStore {
  feeConfigurations: FeeConfiguration[] = [];
  upiConfigurations: UpiConfiguration[] = [];
  studentFeeAccounts: StudentFeeAccount[] = [];
  preparedUpiPayments: PreparedUpiPayment[] = [];
  paymentClaims: PaymentClaim[] = [];
  verifiedPayments: VerifiedPayment[] = [];
  paymentVerificationAudits: PaymentVerificationAudit[] = [];
  receipts: FeeReceipt[] = [];
  salaryConfigurations: TeacherSalaryConfiguration[] = [];
  salaryPeriods: TeacherSalaryPeriod[] = [];
  salaryPayments: TeacherSalaryPayment[] = [];
  financialAudits: FinancialAuditEntry[] = [];
  notifications: FinancialNotification[] = [];

  counters: FinanceCounters = {
    feeConfigSeq: 1,
    upiConfigSeq: 1,
    feeAccountSeq: 1,
    preparedUpiSeq: 1,
    paymentClaimSeq: 1,
    verifiedPaymentSeq: 1,
    verificationAuditSeq: 1,
    receiptSeq: 1,
    salaryConfigSeq: 1,
    salaryPeriodSeq: 1,
    salaryPaymentSeq: 1,
    financialAuditSeq: 1,
    notificationSeq: 1,
  };

  readonly academicStore: LocalAcademicStore;
  readonly attendanceStore: LocalAttendanceStore;
  centreName: string;
  private readonly skipPersistence: boolean;

  constructor(options?: {
    academicStore?: LocalAcademicStore;
    attendanceStore?: LocalAttendanceStore;
    centreName?: string;
    allowFixturesInTest?: boolean;
    skipPersistence?: boolean;
  }) {
    this.academicStore = options?.academicStore ?? sharedLocalAcademicStore;
    this.attendanceStore = options?.attendanceStore ?? sharedLocalAttendanceStore;
    this.centreName = options?.centreName ?? DEFAULT_BRANDING_CONFIG.centreName;
    this.skipPersistence = Boolean(options?.skipPersistence);
    this.initialize(Boolean(options?.allowFixturesInTest));
  }

  private initialize(allowFixturesInTest: boolean): void {
    const isDev = Boolean(import.meta.env?.DEV);

    if (!this.skipPersistence) {
      const storage = getSafeStorage();
      const raw = storage?.getItem(FINANCE_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<PersistedFinanceState>;
          if (
            Array.isArray(parsed.feeConfigurations) &&
            Array.isArray(parsed.upiConfigurations) &&
            Array.isArray(parsed.studentFeeAccounts) &&
            Array.isArray(parsed.preparedUpiPayments) &&
            Array.isArray(parsed.paymentClaims) &&
            Array.isArray(parsed.verifiedPayments) &&
            Array.isArray(parsed.paymentVerificationAudits) &&
            Array.isArray(parsed.receipts) &&
            Array.isArray(parsed.salaryConfigurations) &&
            Array.isArray(parsed.salaryPeriods) &&
            Array.isArray(parsed.salaryPayments) &&
            Array.isArray(parsed.financialAudits) &&
            Array.isArray(parsed.notifications) &&
            parsed.counters
          ) {
            this.feeConfigurations = parsed.feeConfigurations;
            this.upiConfigurations = parsed.upiConfigurations;
            this.studentFeeAccounts = parsed.studentFeeAccounts;
            this.preparedUpiPayments = parsed.preparedUpiPayments;
            this.paymentClaims = parsed.paymentClaims;
            this.verifiedPayments = parsed.verifiedPayments;
            this.paymentVerificationAudits = parsed.paymentVerificationAudits;
            this.receipts = parsed.receipts;
            this.salaryConfigurations = parsed.salaryConfigurations;
            this.salaryPeriods = parsed.salaryPeriods;
            this.salaryPayments = parsed.salaryPayments;
            this.financialAudits = parsed.financialAudits;
            this.notifications = parsed.notifications;
            this.counters = parsed.counters;
            return;
          }
        } catch {
          storage?.removeItem(FINANCE_STORAGE_KEY);
        }
      }
    }

    if (!isDev && !allowFixturesInTest) {
      return;
    }

    // Seed realistic DEMO DATA for local development & regression test baselines.
    const octTs = '2026-10-05T10:30:00.000Z';
    const novTs = '2026-11-06T14:20:00.000Z';

    this.feeConfigurations = [
      {
        id: 'FCFG-0001',
        amountPaise: 250000, // INR 2,500
        frequency: 'monthly',
        effectiveFrom: '2026-10-01',
        dueDayOfMonth: 25,
        dueDateConfiguration: '25th of each month',
        reminderLeadDays: 5,
        status: 'active',
        note: 'Standard monthly tuition fee structure (DEMO DATA)',
        createdBy: 'ADM-0001',
        createdAt: '2026-10-01T08:00:00.000Z',
        updatedAt: '2026-10-01T08:00:00.000Z',
      },
    ];

    this.upiConfigurations = [
      {
        id: 'UPIC-0001',
        upiId: 'brightpath.tuition@okicici',
        payeeName: 'BrightPath Tuition Academy',
        description: 'Monthly Tuition Fee Payment',
        status: 'active',
        updatedBy: 'ADM-0001',
        updatedAt: '2026-10-01T08:05:00.000Z',
      },
    ];

    this.studentFeeAccounts = [
      {
        id: 'FEE-0002',
        studentId: 'STU-0001',
        feeConfigurationId: 'FCFG-0001',
        feePeriod: '2026-11',
        periodLabel: 'November 2026',
        frequency: 'monthly',
        amountDuePaise: 250000,
        verifiedAmountPaidPaise: 100000, // INR 1,000 partial verified; INR 1,500 remaining
        remainingBalancePaise: 150000,
        dueAt: '2026-11-25',
        status: 'partially_paid',
        createdAt: '2026-11-01T08:00:00.000Z',
        updatedAt: novTs,
      },
      {
        id: 'FEE-0001',
        studentId: 'STU-0001',
        feeConfigurationId: 'FCFG-0001',
        feePeriod: '2026-10',
        periodLabel: 'October 2026',
        frequency: 'monthly',
        amountDuePaise: 250000,
        verifiedAmountPaidPaise: 250000,
        remainingBalancePaise: 0,
        dueAt: '2026-10-25',
        status: 'paid',
        createdAt: '2026-10-01T08:10:00.000Z',
        updatedAt: octTs,
      },
    ];

    this.paymentClaims = [
      {
        id: 'PCLM-0002',
        paymentReference: 'PAYREF-202611-0002',
        studentId: 'STU-0001',
        feeAccountId: 'FEE-0002',
        feePeriod: '2026-11',
        amountPaise: 100000,
        transactionReference: 'UTR631098452102',
        paymentDate: '2026-11-06',
        studentNote: 'First partial installment via UPI (DEMO DATA)',
        status: 'verified',
        duplicateTransactionFlag: false,
        submittedAt: '2026-11-06T11:10:00.000Z',
        verifiedBy: 'ADM-0001',
        verifiedAt: novTs,
        verificationNote: 'Matched in centre ledger statement (DEMO DATA)',
      },
      {
        id: 'PCLM-0001',
        paymentReference: 'PAYREF-202610-0001',
        studentId: 'STU-0001',
        feeAccountId: 'FEE-0001',
        feePeriod: '2026-10',
        amountPaise: 250000,
        transactionReference: 'UTR627812390041',
        paymentDate: '2026-10-05',
        studentNote: 'Full October tuition fee (DEMO DATA)',
        status: 'verified',
        duplicateTransactionFlag: false,
        submittedAt: '2026-10-05T09:15:00.000Z',
        verifiedBy: 'ADM-0001',
        verifiedAt: octTs,
        verificationNote: 'Matched in centre ledger statement (DEMO DATA)',
      },
    ];

    this.verifiedPayments = [
      {
        id: 'VPAY-0002',
        paymentClaimId: 'PCLM-0002',
        paymentReference: 'PAYREF-202611-0002',
        studentId: 'STU-0001',
        feeAccountId: 'FEE-0002',
        feePeriod: '2026-11',
        amountPaise: 100000,
        transactionReference: 'UTR631098452102',
        paymentDate: '2026-11-06',
        verifiedBy: 'ADM-0001',
        verifiedAt: novTs,
        verificationNote: 'Matched in centre ledger statement (DEMO DATA)',
      },
      {
        id: 'VPAY-0001',
        paymentClaimId: 'PCLM-0001',
        paymentReference: 'PAYREF-202610-0001',
        studentId: 'STU-0001',
        feeAccountId: 'FEE-0001',
        feePeriod: '2026-10',
        amountPaise: 250000,
        transactionReference: 'UTR627812390041',
        paymentDate: '2026-10-05',
        verifiedBy: 'ADM-0001',
        verifiedAt: octTs,
        verificationNote: 'Matched in centre ledger statement (DEMO DATA)',
      },
    ];

    this.paymentVerificationAudits = [
      {
        id: 'PVAUD-0002',
        paymentClaimId: 'PCLM-0002',
        verifiedPaymentId: 'VPAY-0002',
        actorId: 'ADM-0001',
        action: 'payment_verified',
        previousValues: 'status=verification_pending, remaining=250000',
        newValues: 'status=verified, amountPaise=100000, remaining=150000',
        reason: 'Matched in centre ledger statement (DEMO DATA)',
        timestamp: novTs,
      },
      {
        id: 'PVAUD-0001',
        paymentClaimId: 'PCLM-0001',
        verifiedPaymentId: 'VPAY-0001',
        actorId: 'ADM-0001',
        action: 'payment_verified',
        previousValues: 'status=verification_pending, remaining=250000',
        newValues: 'status=verified, amountPaise=250000, remaining=0',
        reason: 'Matched in centre ledger statement (DEMO DATA)',
        timestamp: octTs,
      },
    ];

    this.receipts = [
      {
        id: 'REC-0002',
        receiptNumber: 'RCP-2026-0002',
        verifiedPaymentId: 'VPAY-0002',
        paymentClaimId: 'PCLM-0002',
        paymentReference: 'PAYREF-202611-0002',
        transactionReference: 'UTR631098452102',
        centreName: this.centreName,
        studentId: 'STU-0001',
        studentName: 'Aarav Mehta',
        className: 'Class 10 — Foundation',
        batchName: 'Morning Batch A',
        feePeriod: '2026-11',
        periodLabel: 'November 2026',
        paymentDate: '2026-11-06',
        amountPaise: 100000,
        totalFeeDuePaise: 250000,
        totalAmountPaidAfterPaise: 100000,
        remainingBalancePaise: 150000,
        verificationStatus: 'verified',
        issuedBy: 'ADM-0001',
        issuedAt: novTs,
        status: 'issued',
      },
      {
        id: 'REC-0001',
        receiptNumber: 'RCP-2026-0001',
        verifiedPaymentId: 'VPAY-0001',
        paymentClaimId: 'PCLM-0001',
        paymentReference: 'PAYREF-202610-0001',
        transactionReference: 'UTR627812390041',
        centreName: this.centreName,
        studentId: 'STU-0001',
        studentName: 'Aarav Mehta',
        className: 'Class 10 — Foundation',
        batchName: 'Morning Batch A',
        feePeriod: '2026-10',
        periodLabel: 'October 2026',
        paymentDate: '2026-10-05',
        amountPaise: 250000,
        totalFeeDuePaise: 250000,
        totalAmountPaidAfterPaise: 250000,
        remainingBalancePaise: 0,
        verificationStatus: 'verified',
        issuedBy: 'ADM-0001',
        issuedAt: octTs,
        status: 'issued',
      },
    ];

    this.salaryConfigurations = [
      {
        id: 'SCFG-0001',
        teacherId: 'TCH-0001',
        salaryModel: 'fixed_monthly',
        monthlyAmountPaise: 2800000, // INR 28,000
        effectiveFrom: '2026-10-01',
        status: 'active',
        createdBy: 'ADM-0001',
        createdAt: '2026-10-01T08:15:00.000Z',
        updatedAt: '2026-10-01T08:15:00.000Z',
      },
    ];

    this.salaryPeriods = [
      {
        id: 'SPER-0002',
        teacherId: 'TCH-0001',
        teacherName: 'Priya Nair',
        salaryConfigurationId: 'SCFG-0001',
        period: '2026-11',
        periodLabel: 'November 2026',
        salaryModel: 'fixed_monthly',
        ratePaise: 2800000,
        eligibleSessionIds: [],
        eligibleSessionsSummary: [],
        requiresAdminReview: false,
        payableAmountPaise: 2800000,
        paidAmountPaise: 1000000,
        remainingAmountPaise: 1800000,
        status: 'partially_paid',
        createdAt: '2026-11-01T08:15:00.000Z',
        updatedAt: '2026-11-08T12:00:00.000Z',
      },
      {
        id: 'SPER-0001',
        teacherId: 'TCH-0001',
        teacherName: 'Priya Nair',
        salaryConfigurationId: 'SCFG-0001',
        period: '2026-10',
        periodLabel: 'October 2026',
        salaryModel: 'fixed_monthly',
        ratePaise: 2800000,
        eligibleSessionIds: [],
        eligibleSessionsSummary: [],
        requiresAdminReview: false,
        payableAmountPaise: 2800000,
        paidAmountPaise: 2800000,
        remainingAmountPaise: 0,
        status: 'paid',
        createdAt: '2026-10-01T08:20:00.000Z',
        updatedAt: '2026-10-31T16:00:00.000Z',
      },
    ];

    this.salaryPayments = [
      {
        id: 'SPAY-0002',
        teacherSalaryPeriodId: 'SPER-0002',
        teacherId: 'TCH-0001',
        period: '2026-11',
        amountPaise: 1000000, // INR 10,000 advance
        paymentDate: '2026-11-08',
        paymentReference: 'SAL-202611-ADV',
        note: 'Mid-month partial salary payout (DEMO DATA)',
        recordedBy: 'ADM-0001',
        createdAt: '2026-11-08T12:00:00.000Z',
      },
      {
        id: 'SPAY-0001',
        teacherSalaryPeriodId: 'SPER-0001',
        teacherId: 'TCH-0001',
        period: '2026-10',
        amountPaise: 2800000,
        paymentDate: '2026-10-31',
        paymentReference: 'SAL-202610-FULL',
        note: 'October full salary settlement (DEMO DATA)',
        recordedBy: 'ADM-0001',
        createdAt: '2026-10-31T16:00:00.000Z',
      },
    ];

    this.financialAudits = [
      {
        id: 'FAUD-0003',
        entityType: 'salary_payment',
        entityId: 'SPAY-0002',
        actorId: 'ADM-0001',
        action: 'salary_payment_recorded',
        newValues: 'TCH-0001 · 2026-11 · amountPaise=1000000',
        reason: 'Seeded partial salary record (DEMO DATA)',
        timestamp: '2026-11-08T12:00:00.000Z',
      },
      {
        id: 'FAUD-0002',
        entityType: 'verified_payment',
        entityId: 'VPAY-0002',
        actorId: 'ADM-0001',
        action: 'payment_verified',
        newValues: 'PCLM-0002 verified for STU-0001 (amountPaise=100000), receipt RCP-2026-0002 issued',
        reason: 'Seeded historical verification (DEMO DATA)',
        timestamp: novTs,
      },
      {
        id: 'FAUD-0001',
        entityType: 'fee_configuration',
        entityId: 'FCFG-0001',
        actorId: 'ADM-0001',
        action: 'fee_config_created',
        newValues: 'frequency=monthly, amountPaise=250000, dueDay=25',
        reason: 'Seeded initial monthly fee configuration (DEMO DATA)',
        timestamp: '2026-10-01T08:00:00.000Z',
      },
    ];

    this.notifications = [
      {
        id: 'FNOT-0001',
        recipientId: 'STU-0001',
        notificationType: 'receipt_issued',
        relatedRecordId: 'REC-0002',
        dedupeKey: 'receipt_issued:REC-0002:STU-0001',
        title: 'Digital Receipt Issued (RCP-2026-0002)',
        message:
          'Verified partial payment of ₹1,000 for November 2026. Remaining balance: ₹1,500.',
        createdAt: novTs,
      },
    ];

    this.counters = {
      feeConfigSeq: 2,
      upiConfigSeq: 2,
      feeAccountSeq: 3,
      preparedUpiSeq: 1,
      paymentClaimSeq: 3,
      verifiedPaymentSeq: 3,
      verificationAuditSeq: 3,
      receiptSeq: 3,
      salaryConfigSeq: 2,
      salaryPeriodSeq: 3,
      salaryPaymentSeq: 3,
      financialAuditSeq: 4,
      notificationSeq: 2,
    };
  }

  save(): void {
    if (this.skipPersistence) {
      return;
    }
    const storage = getSafeStorage();
    if (!storage) {
      return;
    }
    const payload: PersistedFinanceState = {
      feeConfigurations: this.feeConfigurations,
      upiConfigurations: this.upiConfigurations,
      studentFeeAccounts: this.studentFeeAccounts,
      preparedUpiPayments: this.preparedUpiPayments,
      paymentClaims: this.paymentClaims,
      verifiedPayments: this.verifiedPayments,
      paymentVerificationAudits: this.paymentVerificationAudits,
      receipts: this.receipts,
      salaryConfigurations: this.salaryConfigurations,
      salaryPeriods: this.salaryPeriods,
      salaryPayments: this.salaryPayments,
      financialAudits: this.financialAudits,
      notifications: this.notifications,
      counters: this.counters,
    };
    storage.setItem(FINANCE_STORAGE_KEY, JSON.stringify(payload));
  }
}

export const sharedLocalFinanceStore = new LocalFinanceStore();
