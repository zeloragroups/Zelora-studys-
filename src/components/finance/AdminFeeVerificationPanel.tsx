import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileCheck2,
  Pencil,
  Receipt,
  Search,
  Settings2,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FinanceServiceError } from '../../services/contracts/financeService';
import { feeService } from '../../services';
import { paymentService } from '../../services';
import { receiptService } from '../../services';
import type {
  BatchRecord,
  ClassRecord,
  FeeConfiguration,
  FeeFrequency,
  FeeReceipt,
  PaymentClaimDetailView,
  StudentFeeAccountStatus,
  StudentFeeAccountView,
  UpiConfiguration,
} from '../../types';
import { formatInrFromPaise, paiseToRupees } from '../../utils/currency';
import { formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

export type FeeVerificationPanelSection =
  | 'fee_config'
  | 'student_accounts'
  | 'verification_queue'
  | 'upi_config'
  | 'receipts';

interface AdminFeeVerificationPanelProps {
  section: FeeVerificationPanelSection;
  activeFeeConfig: FeeConfiguration | null;
  feeConfigHistory: FeeConfiguration[];
  upiConfig: UpiConfiguration | null;
  studentAccounts: StudentFeeAccountView[];
  claims: PaymentClaimDetailView[];
  receipts: FeeReceipt[];
  classes: ClassRecord[];
  batches: BatchRecord[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
  onOpenReceipt: (receipt: FeeReceipt) => void;
}

const FEE_STATUS_META: Record<
  StudentFeeAccountStatus,
  { tone: SemanticTone; label: string }
> = {
  paid: { tone: 'nominal', label: 'Paid' },
  partially_paid: { tone: 'warning', label: 'Partially Paid' },
  verification_pending: { tone: 'warning', label: 'Verification Pending' },
  overdue: { tone: 'danger', label: 'Overdue' },
  unpaid: { tone: 'neutral', label: 'Unpaid' },
};

const CLAIM_STATUS_META: Record<
  'verification_pending' | 'verified' | 'rejected',
  { tone: SemanticTone; label: string }
> = {
  verification_pending: { tone: 'warning', label: 'Verification Pending' },
  verified: { tone: 'nominal', label: 'Verified' },
  rejected: { tone: 'danger', label: 'Rejected' },
};

export function AdminFeeVerificationPanel({
  section,
  activeFeeConfig,
  feeConfigHistory,
  upiConfig,
  studentAccounts,
  claims,
  receipts,
  classes,
  batches,
  onRefresh,
  onToast,
  onOpenReceipt,
}: AdminFeeVerificationPanelProps) {
  const { principal } = useAuth();

  // Fee Configuration Form State
  const [feeAmountRupees, setFeeAmountRupees] = useState(
    activeFeeConfig ? String(paiseToRupees(activeFeeConfig.amountPaise)) : '2500'
  );
  const [feeFrequency, setFeeFrequency] = useState<FeeFrequency>(
    activeFeeConfig?.frequency ?? 'monthly'
  );
  const [effectiveFrom, setEffectiveFrom] = useState(
    activeFeeConfig?.effectiveFrom ?? new Date().toISOString().slice(0, 10)
  );
  const [dueDayOfMonth, setDueDayOfMonth] = useState(
    String(activeFeeConfig?.dueDayOfMonth ?? 25)
  );
  const [yearlyDueDate, setYearlyDueDate] = useState(
    activeFeeConfig?.yearlyDueDate ?? '06-30'
  );
  const [reminderLeadDays, setReminderLeadDays] = useState(
    String(activeFeeConfig?.reminderLeadDays ?? 5)
  );
  const [feeNote, setFeeNote] = useState(activeFeeConfig?.note ?? '');
  const [applyToUnpaidCurrent, setApplyToUnpaidCurrent] = useState(false);
  const [syncPeriodInput, setSyncPeriodInput] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [generatePeriodInput, setGeneratePeriodInput] = useState(
    new Date().toISOString().slice(0, 7)
  );

  // Student Accounts Filters
  const [accountSearch, setAccountSearch] = useState('');
  const [accountPeriodFilter, setAccountPeriodFilter] = useState('');
  const [accountClassFilter, setAccountClassFilter] = useState('all');
  const [accountBatchFilter, setAccountBatchFilter] = useState('all');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'all' | StudentFeeAccountStatus>('all');
  const [inspectAccount, setInspectAccount] = useState<StudentFeeAccountView | null>(null);

  // Verification Queue Filter & Action Modals
  const [claimFilter, setClaimFilter] = useState<
    'verification_pending' | 'verified' | 'rejected' | 'all'
  >('verification_pending');
  const [verifyTarget, setVerifyTarget] = useState<PaymentClaimDetailView | null>(null);
  const [confirmIndependentCheck, setConfirmIndependentCheck] = useState(false);
  const [verificationNote, setVerificationNote] = useState('');

  const [rejectTarget, setRejectTarget] = useState<PaymentClaimDetailView | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  const [correctPaymentTarget, setCorrectPaymentTarget] = useState<PaymentClaimDetailView | null>(null);
  const [correctedAmountRupees, setCorrectedAmountRupees] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  // UPI Configuration State
  const [upiId, setUpiId] = useState(upiConfig?.upiId ?? 'brightpath.tuition@okaxis');
  const [payeeName, setPayeeName] = useState(
    upiConfig?.payeeName ?? 'BrightPath Tuition Academy'
  );
  const [upiDescription, setUpiDescription] = useState(
    upiConfig?.description ?? 'Monthly Tuition Fee Payment'
  );
  const [upiStatus, setUpiStatus] = useState<'active' | 'inactive'>(
    upiConfig?.status ?? 'active'
  );

  // Receipts search
  const [receiptSearch, setReceiptSearch] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!principal || principal.role !== 'admin') return null;

  const extractErr = (err: unknown) =>
    err instanceof FinanceServiceError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Operation could not be completed.';

  // Handlers
  const handleSaveFeeConfig = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await feeService.saveFeeConfiguration(principal, {
        amountRupees: feeAmountRupees,
        frequency: feeFrequency,
        effectiveFrom,
        dueDayOfMonth: Number(dueDayOfMonth),
        yearlyDueDate: feeFrequency === 'yearly' ? yearlyDueDate : undefined,
        reminderLeadDays: Number(reminderLeadDays),
        note: feeNote.trim() || undefined,
        applyToUnpaidCurrentAccounts: applyToUnpaidCurrent,
        syncPeriod: syncPeriodInput.trim() || undefined,
      });
      onToast(
        `Fee structure saved (${formatInrFromPaise(res.config.amountPaise)} / ${res.config.frequency}). Generated ${res.generatedAccountsCount} account(s), updated ${res.updatedUnpaidCount} unpaid account(s).`
      );
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateAccounts = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await feeService.generateFeeAccountsForPeriod(
        principal,
        generatePeriodInput
      );
      onToast(
        `Period ${generatePeriodInput}: created ${res.createdCount} student fee account(s), skipped ${res.skippedCount} existing.`
      );
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveUpiConfig = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const saved = await feeService.saveUpiConfiguration(principal, {
        upiId,
        payeeName,
        description: upiDescription,
        status: upiStatus,
      });
      onToast(`UPI configuration saved (${saved.upiId} · ${saved.status}).`);
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!verifyTarget) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await paymentService.verifyPaymentClaim(principal, {
        claimId: verifyTarget.claim.id,
        confirmIndependentCheck,
        verificationNote: verificationNote.trim() || undefined,
      });
      setVerifyTarget(null);
      setConfirmIndependentCheck(false);
      setVerificationNote('');
      onToast(
        `Payment verified for ${res.claim.studentName}. Receipt ${res.receipt.receiptNumber} issued.`
      );
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReject = async (e: FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await paymentService.rejectPaymentClaim(principal, {
        claimId: rejectTarget.claim.id,
        rejectionReason,
        verificationNote: rejectNote.trim() || undefined,
      });
      setRejectTarget(null);
      setRejectionReason('');
      setRejectNote('');
      onToast('Payment claim rejected with recorded reason. Student fee balance unchanged.');
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCorrectPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!correctPaymentTarget || !correctPaymentTarget.receipt) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await paymentService.correctVerifiedPayment(principal, {
        verifiedPaymentId: correctPaymentTarget.receipt.verifiedPaymentId,
        correctedAmountRupees,
        reason: correctionReason,
      });
      setCorrectPaymentTarget(null);
      setCorrectedAmountRupees('');
      setCorrectionReason('');
      onToast(
        `Verified payment corrected. Prior receipt voided; revised receipt ${res.newReceipt?.receiptNumber ?? ''} issued.`
      );
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Views
  const filteredAccounts = studentAccounts.filter((item) => {
    if (accountClassFilter !== 'all' && item.classId !== accountClassFilter) return false;
    if (accountBatchFilter !== 'all' && item.batchId !== accountBatchFilter) return false;
    if (accountStatusFilter !== 'all' && item.account.status !== accountStatusFilter) return false;
    if (accountPeriodFilter.trim()) {
      const p = accountPeriodFilter.trim().toLowerCase();
      if (
        !item.account.feePeriod.toLowerCase().includes(p) &&
        !item.account.periodLabel.toLowerCase().includes(p)
      ) {
        return false;
      }
    }
    if (accountSearch.trim()) {
      const q = accountSearch.trim().toLowerCase();
      const hay = `${item.account.studentId} ${item.studentName} ${item.className} ${item.batchName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const filteredClaims = claims.filter((item) =>
    claimFilter === 'all' ? true : item.claim.status === claimFilter
  );

  const filteredReceipts = receipts.filter((r) => {
    if (!receiptSearch.trim()) return true;
    const q = receiptSearch.trim().toLowerCase();
    return `${r.receiptNumber} ${r.studentId} ${r.studentName} ${r.paymentReference} ${r.transactionReference ?? ''} ${r.periodLabel}`
      .toLowerCase()
      .includes(q);
  });

  // Table Columns
  const feeConfigColumns: TableColumn<FeeConfiguration>[] = [
    {
      key: 'id',
      header: 'Config ID',
      render: (r) => <span className="font-mono text-xs">{r.id}</span>,
    },
    {
      key: 'amount',
      header: 'Fixed Amount',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatInrFromPaise(r.amountPaise)}</span>,
    },
    {
      key: 'frequency',
      header: 'Frequency & Due Rule',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold capitalize text-[#17172B] dark:text-[#F8FAFC]">{r.frequency}</p>
          <p className="text-[#687086] dark:text-[#A6B0C3]">{r.dueDateConfiguration}</p>
        </div>
      ),
    },
    {
      key: 'effective',
      header: 'Effective From',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums">{formatShortDate(r.effectiveFrom)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (r) => (
        <StatusText
          tone={r.status === 'active' ? 'nominal' : 'neutral'}
          label={r.status === 'active' ? 'Active' : 'Historical'}
        />
      ),
    },
  ];

  const accountColumns: TableColumn<StudentFeeAccountView>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <div>
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">{row.studentName}</p>
          <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
            {row.account.studentId} · {row.className} ({row.batchName})
          </p>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Period & Due',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium text-[#17172B] dark:text-[#F8FAFC]">{row.account.periodLabel}</p>
          <p className="font-mono text-[#687086] dark:text-[#A6B0C3] tabular-nums">
            Due {formatShortDate(row.account.dueAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Fee Due',
      align: 'right',
      render: (row) => formatInrFromPaise(row.account.amountDuePaise),
    },
    {
      key: 'verified',
      header: 'Verified Paid',
      align: 'right',
      render: (row) => (
        <span className="text-[#168A62] dark:text-[#22C58B] font-semibold">
          {formatInrFromPaise(row.account.verifiedAmountPaidPaise)}
        </span>
      ),
    },
    {
      key: 'pending',
      header: 'Pending Claims',
      align: 'right',
      render: (row) =>
        row.pendingClaimsPaise > 0 ? (
          <span className="text-[#B7791F] dark:text-[#F5B942]">
            {formatInrFromPaise(row.pendingClaimsPaise)} ({row.pendingClaimsCount})
          </span>
        ) : (
          <span className="text-[#687086] dark:text-[#A6B0C3]">—</span>
        ),
    },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'right',
      render: (row) => (
        <span className="font-semibold">{formatInrFromPaise(row.account.remainingBalancePaise)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const meta = FEE_STATUS_META[row.account.status];
        return <StatusText tone={meta.tone} label={meta.label} />;
      },
    },
    {
      key: 'actions',
      header: 'Inspect',
      align: 'right',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setInspectAccount(row)}
          iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
        >
          Details
        </Button>
      ),
    },
  ];

  const claimColumns: TableColumn<PaymentClaimDetailView>[] = [
    {
      key: 'student',
      header: 'Student & Period',
      render: (row) => (
        <div>
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">{row.studentName}</p>
          <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
            {row.claim.studentId} · {row.periodLabel}
          </p>
        </div>
      ),
    },
    {
      key: 'references',
      header: 'Payment Ref & Student UTR',
      render: (row) => (
        <div className="space-y-0.5 text-xs">
          <p className="font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC]">
            {row.claim.transactionReference}
          </p>
          <p className="font-mono text-[#687086] dark:text-[#A6B0C3]">
            {row.claim.paymentReference} · {formatShortDate(row.claim.paymentDate)}
          </p>
          {row.claim.duplicateTransactionFlag && (
            <StatusText tone="danger" label="Duplicate UTR Flagged" />
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Claimed Amount',
      align: 'right',
      render: (row) => (
        <span className="font-semibold">{formatInrFromPaise(row.claim.amountPaise)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Verification State',
      render: (row) => {
        const meta = CLAIM_STATUS_META[row.claim.status];
        return <StatusText tone={meta.tone} label={meta.label} />;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="inline-flex flex-wrap justify-end gap-1.5">
          {row.claim.status === 'verification_pending' && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setConfirmIndependentCheck(false);
                  setVerificationNote('');
                  setVerifyTarget(row);
                }}
                iconLeft={<CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Verify
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setRejectionReason('');
                  setRejectNote('');
                  setRejectTarget(row);
                }}
                iconLeft={<XCircle className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Reject
              </Button>
            </>
          )}
          {row.claim.status === 'verified' && row.receipt && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (row.receipt) onOpenReceipt(row.receipt);
                }}
                iconLeft={<Receipt className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Receipt
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setCorrectedAmountRupees(String(paiseToRupees(row.claim.amountPaise)));
                  setCorrectionReason('');
                  setCorrectPaymentTarget(row);
                }}
                iconLeft={<Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Correct
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const receiptColumns: TableColumn<FeeReceipt>[] = [
    {
      key: 'number',
      header: 'Receipt Number',
      render: (r) => (
        <div>
          <p className="font-mono font-semibold text-[#7552D9] dark:text-[#C4B5FD]">
            {r.receiptNumber}
          </p>
          <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
            {formatShortDate(r.issuedAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div>
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">{r.studentName}</p>
          <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
            {r.studentId} · {r.periodLabel}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Verified Amount',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatInrFromPaise(r.amountPaise)}</span>,
    },
    {
      key: 'status',
      header: 'Receipt Status',
      render: (r) => (
        <StatusText
          tone={r.status === 'issued' ? 'nominal' : 'danger'}
          label={r.status === 'issued' ? 'Issued' : 'Voided'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Open',
      align: 'right',
      render: (r) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              const latest = await receiptService.getReceiptById(principal, r.id);
              onOpenReceipt(latest);
            } catch {
              onOpenReceipt(r);
            }
          }}
          iconLeft={<Receipt className="w-3.5 h-3.5" aria-hidden="true" />}
        >
          View / Print
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {formError && (
        <div
          role="alert"
          className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/40 bg-[#D94C5C]/8 dark:bg-[#F16B75]/12 p-4 text-sm text-[#D94C5C] dark:text-[#F16B75]"
        >
          {formError}
        </div>
      )}

      {/* 1. FEE CONFIGURATION SECTION */}
      {section === 'fee_config' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-5">
            <Card
              title="Common Fixed Fee Structure"
              subtitle="Set the shared INR fee amount, cadence, due date rule, and lead days for reminders. Previously paid/historical periods remain untouched."
              className="lg:col-span-3"
            >
              <form onSubmit={handleSaveFeeConfig} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Fixed Fee Amount (INR)"
                    type="number"
                    min="1"
                    step="0.01"
                    value={feeAmountRupees}
                    onChange={(e) => setFeeAmountRupees(e.target.value)}
                    required
                  />
                  <div className="space-y-1.5">
                    <label
                      htmlFor="fee-frequency-select"
                      className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]"
                    >
                      Fee Frequency
                    </label>
                    <select
                      id="fee-frequency-select"
                      value={feeFrequency}
                      onChange={(e) => setFeeFrequency(e.target.value as FeeFrequency)}
                      className="w-full min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] border border-[#E5E7EF] dark:border-[#303A55] focus:border-[#7552D9] dark:focus:border-[#8B5CF6]"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Input
                    label="Effective From"
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    required
                  />
                  {feeFrequency === 'monthly' ? (
                    <Input
                      label="Monthly Due Day (1–28)"
                      type="number"
                      min="1"
                      max="28"
                      value={dueDayOfMonth}
                      onChange={(e) => setDueDayOfMonth(e.target.value)}
                      required
                    />
                  ) : (
                    <Input
                      label="Yearly Due Date (MM-DD or YYYY-MM-DD)"
                      value={yearlyDueDate}
                      onChange={(e) => setYearlyDueDate(e.target.value)}
                      placeholder="06-30"
                      required
                    />
                  )}
                  <Input
                    label="Reminder Lead Days"
                    type="number"
                    min="0"
                    max="30"
                    value={reminderLeadDays}
                    onChange={(e) => setReminderLeadDays(e.target.value)}
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Generate Accounts for Period (Optional)"
                    value={syncPeriodInput}
                    onChange={(e) => setSyncPeriodInput(e.target.value)}
                    placeholder={feeFrequency === 'monthly' ? '2026-11' : '2026-2027'}
                    hint={
                      feeFrequency === 'monthly'
                        ? 'Format YYYY-MM to auto-create missing accounts.'
                        : 'Format YYYY or YYYY-YYYY.'
                    }
                  />
                  <Input
                    label="Configuration Note (Optional)"
                    value={feeNote}
                    onChange={(e) => setFeeNote(e.target.value)}
                    placeholder="e.g. Standard Academic Tuition Fee"
                  />
                </div>

                <label className="flex items-start gap-2.5 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3 text-xs text-[#434960] dark:text-[#D4DCEB] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToUnpaidCurrent}
                    onChange={(e) => setApplyToUnpaidCurrent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-[#7552D9]"
                  />
                  <span>
                    Apply updated amount only to <strong>currently unpaid</strong> accounts for the synced period (never modifies paid or partially paid historical accounts).
                  </span>
                </label>

                <Button
                  type="submit"
                  loading={submitting}
                  iconLeft={<Settings2 className="w-4 h-4" aria-hidden="true" />}
                >
                  Save Common Fee Structure
                </Button>
              </form>
            </Card>

            <Card
              title="Generate Period Fee Accounts"
              subtitle="Create fee accounts for all active students without duplicating existing records."
              className="lg:col-span-2"
            >
              <div className="space-y-4">
                <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-4 space-y-1.5">
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">Current Active Fee</p>
                  <p className="text-2xl font-bold font-mono text-[#7552D9] dark:text-[#C4B5FD] tabular-nums">
                    {activeFeeConfig ? formatInrFromPaise(activeFeeConfig.amountPaise) : 'Not Set'}
                  </p>
                  <p className="text-xs text-[#434960] dark:text-[#D4DCEB]">
                    {activeFeeConfig
                      ? `${activeFeeConfig.frequency} · ${activeFeeConfig.dueDateConfiguration}`
                      : 'Save a fee configuration to enable account generation.'}
                  </p>
                </div>

                <Input
                  label="Target Period Code"
                  value={generatePeriodInput}
                  onChange={(e) => setGeneratePeriodInput(e.target.value)}
                  placeholder="2026-12"
                  hint="Monthly: YYYY-MM (e.g., 2026-12). Yearly: YYYY or YYYY-YYYY."
                />

                <Button
                  variant="secondary"
                  className="w-full"
                  loading={submitting}
                  onClick={handleGenerateAccounts}
                >
                  Generate Student Fee Accounts
                </Button>
              </div>
            </Card>
          </div>

          <Card
            title="Fee Configuration History"
            subtitle="Preserved audit trail of active and historical fee templates."
          >
            <Table
              columns={feeConfigColumns}
              rows={feeConfigHistory}
              rowKey={(r) => r.id}
              emptyTitle="No fee configurations recorded"
              mobileCardRender={(r) => (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">{r.id}</span>
                    <StatusText
                      tone={r.status === 'active' ? 'nominal' : 'neutral'}
                      label={r.status === 'active' ? 'Active' : 'Historical'}
                    />
                  </div>
                  <p className="font-mono text-base font-bold tabular-nums">
                    {formatInrFromPaise(r.amountPaise)} / {r.frequency}
                  </p>
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                    {r.dueDateConfiguration} · Effective {formatShortDate(r.effectiveFrom)}
                  </p>
                </div>
              )}
            />
          </Card>
        </div>
      )}

      {/* 2. STUDENT FEE ACCOUNTS SECTION */}
      {section === 'student_accounts' && (
        <div className="space-y-5">
          <Card title="Filter Student Fee Accounts" padding="sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="Student ID or name..."
                  aria-label="Search student fee accounts"
                  className="w-full min-h-[44px] rounded-xl pl-9 pr-3 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC]"
                />
              </div>

              <input
                type="text"
                value={accountPeriodFilter}
                onChange={(e) => setAccountPeriodFilter(e.target.value)}
                placeholder="Period (e.g. 2026-11)"
                aria-label="Filter by fee period"
                className="w-full min-h-[44px] rounded-xl px-3 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC]"
              />

              <select
                value={accountClassFilter}
                onChange={(e) => setAccountClassFilter(e.target.value)}
                aria-label="Filter by class"
                className="w-full min-h-[44px] rounded-xl px-3 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC]"
              >
                <option value="all">All Classes</option>
                {classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={accountBatchFilter}
                onChange={(e) => setAccountBatchFilter(e.target.value)}
                aria-label="Filter by batch"
                className="w-full min-h-[44px] rounded-xl px-3 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC]"
              >
                <option value="all">All Batches</option>
                {batches.map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.name}
                  </option>
                ))}
              </select>

              <select
                value={accountStatusFilter}
                onChange={(e) =>
                  setAccountStatusFilter(e.target.value as 'all' | StudentFeeAccountStatus)
                }
                aria-label="Filter by fee status"
                className="w-full min-h-[44px] rounded-xl px-3 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC]"
              >
                <option value="all">All Statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="verification_pending">Verification Pending</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </Card>

          <Card
            title={`Student Fee Accounts (${filteredAccounts.length})`}
            subtitle="Only Admin-verified payments reduce remaining fee balances. Pending claims are displayed separately."
          >
            <Table
              columns={accountColumns}
              rows={filteredAccounts}
              rowKey={(r) => r.account.id}
              emptyTitle="No matching student fee accounts"
              emptyDescription="Try clearing filters or generating fee accounts for the target period."
              mobileCardRender={(row) => {
                const meta = FEE_STATUS_META[row.account.status];
                return (
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-[#17172B] dark:text-[#F8FAFC]">
                          {row.studentName}
                        </p>
                        <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                          {row.account.studentId} · {row.account.periodLabel}
                        </p>
                      </div>
                      <StatusText tone={meta.tone} label={meta.label} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums pt-1">
                      <div>
                        <span className="block text-[#687086] dark:text-[#A6B0C3] font-sans">Due</span>
                        <span>{formatInrFromPaise(row.account.amountDuePaise)}</span>
                      </div>
                      <div>
                        <span className="block text-[#687086] dark:text-[#A6B0C3] font-sans">Verified</span>
                        <span className="text-[#168A62] dark:text-[#22C58B]">
                          {formatInrFromPaise(row.account.verifiedAmountPaidPaise)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[#687086] dark:text-[#A6B0C3] font-sans">Remaining</span>
                        <span className="font-bold">{formatInrFromPaise(row.account.remainingBalancePaise)}</span>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => setInspectAccount(row)}
                    >
                      Inspect Claims & Receipts
                    </Button>
                  </div>
                );
              }}
            />
          </Card>
        </div>
      )}

      {/* 3. PAYMENT VERIFICATION QUEUE SECTION */}
      {section === 'verification_queue' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Verification status filter">
              {(
                [
                  { id: 'verification_pending', label: 'Pending Review' },
                  { id: 'verified', label: 'Verified' },
                  { id: 'rejected', label: 'Rejected' },
                  { id: 'all', label: 'All Claims' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={claimFilter === tab.id}
                  onClick={() => setClaimFilter(tab.id)}
                  className={
                    claimFilter === tab.id
                      ? 'min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#7552D9] dark:bg-[#8B5CF6] text-white cursor-pointer'
                      : 'min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55] text-[#434960] dark:text-[#A6B0C3] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] cursor-pointer'
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
              Manual verification confirms actual receipt in bank/UPI ledger before generating receipts.
            </p>
          </div>

          <Card
            title={`Payment Claims (${filteredClaims.length})`}
            subtitle="Inspect UTR / transaction references, check duplicate flags, and verify or reject claims."
          >
            <Table
              columns={claimColumns}
              rows={filteredClaims}
              rowKey={(r) => r.claim.id}
              emptyTitle="No payment claims in this queue"
              emptyDescription="Student-submitted payment claims will appear here for Admin verification."
              mobileCardRender={(row) => {
                const meta = CLAIM_STATUS_META[row.claim.status];
                return (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{row.studentName}</p>
                        <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                          {row.claim.studentId} · {row.periodLabel}
                        </p>
                      </div>
                      <StatusText tone={meta.tone} label={meta.label} />
                    </div>
                    <div className="text-xs space-y-1 font-mono">
                      <p>UTR: {row.claim.transactionReference}</p>
                      <p>Amount: {formatInrFromPaise(row.claim.amountPaise)}</p>
                      {row.claim.duplicateTransactionFlag && (
                        <StatusText tone="danger" label="Duplicate UTR Flagged" />
                      )}
                    </div>
                    {row.claim.status === 'verification_pending' && (
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setFormError(null);
                            setConfirmIndependentCheck(false);
                            setVerifyTarget(row);
                          }}
                        >
                          Verify
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setFormError(null);
                            setRejectionReason('');
                            setRejectTarget(row);
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                    {row.claim.status === 'verified' && row.receipt && (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => row.receipt && onOpenReceipt(row.receipt)}
                        >
                          Receipt
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCorrectedAmountRupees(String(paiseToRupees(row.claim.amountPaise)));
                            setCorrectionReason('');
                            setCorrectPaymentTarget(row);
                          }}
                        >
                          Correct
                        </Button>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          </Card>
        </div>
      )}

      {/* 4. UPI CONFIGURATION SECTION */}
      {section === 'upi_config' && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card
            title="Admin UPI Payment Configuration"
            subtitle="Control the active UPI ID and payee details embedded into student Pay Now UPI URIs."
            className="lg:col-span-3"
          >
            <form onSubmit={handleSaveUpiConfig} className="space-y-4">
              <Input
                label="Official Centre UPI ID (VPA)"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="centre.tuition@okaxis"
                required
              />
              <Input
                label="Payee Display Name"
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                placeholder="BrightPath Tuition Academy"
                required
              />
              <Input
                label="Default Transaction Note"
                value={upiDescription}
                onChange={(e) => setUpiDescription(e.target.value)}
                placeholder="Monthly Tuition Fee Payment"
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="upi-status-select"
                  className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]"
                >
                  UPI Pay Now Availability
                </label>
                <select
                  id="upi-status-select"
                  value={upiStatus}
                  onChange={(e) => setUpiStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] border border-[#E5E7EF] dark:border-[#303A55]"
                >
                  <option value="active">Active (Students can launch UPI Pay Now)</option>
                  <option value="inactive">Inactive / Temporarily Disabled</option>
                </select>
              </div>
              <Button
                type="submit"
                loading={submitting}
                iconLeft={<Smartphone className="w-4 h-4" aria-hidden="true" />}
              >
                Save UPI Settings
              </Button>
            </form>
          </Card>

          <Card
            title="Manual Verification Policy"
            subtitle="How Pay Now interacts with student fee balances."
            className="lg:col-span-2"
          >
            <div className="space-y-3 text-xs text-[#434960] dark:text-[#D4DCEB] leading-relaxed">
              <p>
                <strong>No Automatic Bank Verification:</strong> Opening a UPI app via{' '}
                <code className="font-mono">upi://pay</code> prepares the payment reference only.
              </p>
              <p>
                Students submit their UTR / transaction reference after paying. Only Admin review
                and explicit verification reduces the remaining fee balance and issues a receipt.
              </p>
              <div className="pt-2 border-t border-[#E5E7EF] dark:border-[#303A55]">
                <StatusText
                  tone={upiConfig?.status === 'active' ? 'nominal' : 'warning'}
                  label={
                    upiConfig?.status === 'active'
                      ? `Active UPI: ${upiConfig.upiId}`
                      : 'UPI Pay Now Currently Inactive'
                  }
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 5. DIGITAL RECEIPTS ARCHIVE */}
      {section === 'receipts' && (
        <div className="space-y-5">
          <Card title="Search Issued Receipts" padding="sm">
            <div className="relative max-w-md">
              <Search
                className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={receiptSearch}
                onChange={(e) => setReceiptSearch(e.target.value)}
                placeholder="Search receipt number (RCP-2026-...), student ID, name, or UTR..."
                aria-label="Search digital receipts"
                className="w-full min-h-[44px] rounded-xl pl-9 pr-3 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC]"
              />
            </div>
          </Card>

          <Card
            title={`Digital Receipts (${filteredReceipts.length})`}
            subtitle="Generated exclusively from Admin-verified fee payments. Voided receipts remain preserved for audit traceability."
          >
            <Table
              columns={receiptColumns}
              rows={filteredReceipts}
              rowKey={(r) => r.id}
              emptyTitle="No matching receipts"
              mobileCardRender={(r) => (
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono font-semibold text-sm text-[#7552D9] dark:text-[#C4B5FD]">
                        {r.receiptNumber}
                      </p>
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                        {r.studentName} ({r.studentId})
                      </p>
                    </div>
                    <StatusText
                      tone={r.status === 'issued' ? 'nominal' : 'danger'}
                      label={r.status === 'issued' ? 'Issued' : 'Voided'}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span>{r.periodLabel}</span>
                    <span className="font-mono font-bold tabular-nums">
                      {formatInrFromPaise(r.amountPaise)}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={() => onOpenReceipt(r)}
                  >
                    View / Print Receipt
                  </Button>
                </div>
              )}
            />
          </Card>
        </div>
      )}

      {/* Inspect Student Fee Account Modal */}
      <Modal
        open={Boolean(inspectAccount)}
        onClose={() => setInspectAccount(null)}
        title={
          inspectAccount
            ? `${inspectAccount.studentName} · ${inspectAccount.account.periodLabel}`
            : 'Fee Account'
        }
        subtitle="Verified payments, pending/rejected claims, and issued receipts."
        maxWidthClass="max-w-2xl"
      >
        {inspectAccount && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426] p-4 font-mono tabular-nums text-xs">
              <div>
                <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Total Due</span>
                <span className="font-bold text-sm">{formatInrFromPaise(inspectAccount.account.amountDuePaise)}</span>
              </div>
              <div>
                <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Verified Paid</span>
                <span className="font-bold text-sm text-[#168A62] dark:text-[#22C58B]">
                  {formatInrFromPaise(inspectAccount.account.verifiedAmountPaidPaise)}
                </span>
              </div>
              <div>
                <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Pending Claims</span>
                <span className="font-bold text-sm text-[#B7791F] dark:text-[#F5B942]">
                  {formatInrFromPaise(inspectAccount.pendingClaimsPaise)}
                </span>
              </div>
              <div>
                <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Remaining</span>
                <span className="font-bold text-sm">
                  {formatInrFromPaise(inspectAccount.account.remainingBalancePaise)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3]">
                Claims & Verification History ({inspectAccount.claims.length})
              </h4>
              {inspectAccount.claims.length === 0 ? (
                <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">No payment claims submitted for this period.</p>
              ) : (
                <div className="space-y-2">
                  {inspectAccount.claims.map((c) => {
                    const meta = CLAIM_STATUS_META[c.status];
                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-mono font-semibold">
                            {formatInrFromPaise(c.amountPaise)} · UTR: {c.transactionReference}
                          </p>
                          <p className="text-[#687086] dark:text-[#A6B0C3]">
                            Ref {c.paymentReference} · Paid {formatShortDate(c.paymentDate)}
                          </p>
                          {c.rejectionReason && (
                            <p className="text-[#D94C5C] dark:text-[#F16B75] mt-1">
                              Rejected: {c.rejectionReason}
                            </p>
                          )}
                        </div>
                        <StatusText tone={meta.tone} label={meta.label} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {inspectAccount.receipts.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3]">
                  Issued Receipts
                </h4>
                <div className="flex flex-wrap gap-2">
                  {inspectAccount.receipts.map((rec) => (
                    <Button
                      key={rec.id}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setInspectAccount(null);
                        onOpenReceipt(rec);
                      }}
                      iconLeft={<FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      {rec.receiptNumber} ({formatInrFromPaise(rec.amountPaise)})
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Verify Payment Claim Modal */}
      <Modal
        open={Boolean(verifyTarget)}
        onClose={() => setVerifyTarget(null)}
        title="Verify Student Payment Claim"
        subtitle="Explicit confirmation required after checking the centre bank or UPI statement."
      >
        {verifyTarget && (
          <form onSubmit={handleConfirmVerify} className="space-y-4">
            <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426] p-4 space-y-1.5 text-xs">
              <p>
                <strong>Student:</strong> {verifyTarget.studentName} ({verifyTarget.claim.studentId})
              </p>
              <p>
                <strong>Period:</strong> {verifyTarget.periodLabel}
              </p>
              <p className="font-mono">
                <strong>Claimed Amount:</strong> {formatInrFromPaise(verifyTarget.claim.amountPaise)}
              </p>
              <p className="font-mono">
                <strong>UTR / Transaction Ref:</strong> {verifyTarget.claim.transactionReference}
              </p>
              <p className="font-mono">
                <strong>Internal Ref:</strong> {verifyTarget.claim.paymentReference}
              </p>
            </div>

            {verifyTarget.claim.duplicateTransactionFlag && (
              <div
                role="alert"
                className="rounded-xl border border-[#B7791F]/40 bg-[#B7791F]/10 p-3 flex items-start gap-2 text-xs text-[#B7791F] dark:text-[#F5B942]"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  This UTR matches another existing claim ({verifyTarget.claim.duplicateOfClaimIds?.join(', ')}). Verify carefully before approving.
                </span>
              </div>
            )}

            <label className="flex items-start gap-2.5 rounded-xl border border-[#7552D9]/30 dark:border-[#8B5CF6]/40 bg-[#F1EEFA]/70 dark:bg-[#202844]/70 p-3.5 text-xs text-[#17172B] dark:text-[#F8FAFC] cursor-pointer">
              <input
                type="checkbox"
                checked={confirmIndependentCheck}
                onChange={(e) => setConfirmIndependentCheck(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#7552D9]"
              />
              <span>
                I confirm that I have independently verified receipt of{' '}
                <strong>{formatInrFromPaise(verifyTarget.claim.amountPaise)}</strong> against UTR{' '}
                <strong className="font-mono">{verifyTarget.claim.transactionReference}</strong> in the centre bank/UPI statement.
              </span>
            </label>

            <Input
              label="Verification Note (Optional)"
              value={verificationNote}
              onChange={(e) => setVerificationNote(e.target.value)}
              placeholder="e.g. Verified in Axis UPI settlement statement"
            />

            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setVerifyTarget(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={submitting}
                disabled={!confirmIndependentCheck}
              >
                Confirm Verify & Issue Receipt
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reject Payment Claim Modal */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject Payment Claim"
        subtitle="A clear reason is mandatory. The student fee balance will remain unchanged."
      >
        {rejectTarget && (
          <form onSubmit={handleConfirmReject} className="space-y-4">
            <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426] p-3.5 text-xs space-y-1">
              <p>
                <strong>{rejectTarget.studentName}</strong> · {rejectTarget.periodLabel}
              </p>
              <p className="font-mono">
                {formatInrFromPaise(rejectTarget.claim.amountPaise)} · UTR {rejectTarget.claim.transactionReference}
              </p>
            </div>
            <Input
              label="Rejection Reason (Mandatory, min 5 characters)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. UTR not found in bank settlement statement"
              required
            />
            <Input
              label="Internal Note (Optional)"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Optional note for audit trail"
            />
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setRejectTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" loading={submitting}>
                Reject Claim
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Correct Verified Payment Modal */}
      <Modal
        open={Boolean(correctPaymentTarget)}
        onClose={() => setCorrectPaymentTarget(null)}
        title="Audited Payment Correction"
        subtitle="Supersedes the prior receipt, issues a revised receipt, and logs previous/new values with reason."
      >
        {correctPaymentTarget && (
          <form onSubmit={handleConfirmCorrectPayment} className="space-y-4">
            <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426] p-3.5 text-xs space-y-1">
              <p>
                <strong>Student:</strong> {correctPaymentTarget.studentName} ({correctPaymentTarget.claim.studentId})
              </p>
              <p className="font-mono">
                <strong>Current Verified Amount:</strong> {formatInrFromPaise(correctPaymentTarget.claim.amountPaise)}
              </p>
              <p className="font-mono">
                <strong>Current Receipt:</strong> {correctPaymentTarget.receipt?.receiptNumber}
              </p>
            </div>
            <Input
              label="Corrected Verified Amount (INR)"
              type="number"
              min="1"
              step="0.01"
              value={correctedAmountRupees}
              onChange={(e) => setCorrectedAmountRupees(e.target.value)}
              required
            />
            <Input
              label="Audit Correction Reason (Mandatory)"
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g. Adjusted bank settlement figure after reconciliation"
              required
            />
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setCorrectPaymentTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Apply Correction & Reissue Receipt
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
