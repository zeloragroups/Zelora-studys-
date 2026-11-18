import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  IndianRupee,
  Receipt,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FinanceServiceError } from '../../services/contracts/financeService';
import {
  feeService,
  isFirebaseConnectedMode,
  paymentService,
  receiptService,
} from '../../services';
import type {
  FeeReceipt,
  PaymentClaimDetailView,
  PreparedUpiPayment,
  StudentFeeAccountStatus,
  StudentFeeAccountView,
  StudentFeeDashboardData,
} from '../../types';
import { formatInrFromPaise, paiseToRupees } from '../../utils/currency';
import { formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { ReceiptPreviewModal } from './ReceiptPreviewModal';

const ACCOUNT_STATUS_META: Record<
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

export function StudentFeesModule() {
  const { principal } = useAuth();
  const [dashboard, setDashboard] = useState<StudentFeeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Pay Now & Claim Submission State
  const [payModalAccount, setPayModalAccount] = useState<StudentFeeAccountView | null>(null);
  const [payAmountRupees, setPayAmountRupees] = useState('');
  const [preparedUpi, setPreparedUpi] = useState<PreparedUpiPayment | null>(null);
  const [upiLaunchedNotice, setUpiLaunchedNotice] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Claim fields
  const [transactionRef, setTransactionRef] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [studentNote, setStudentNote] = useState('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Receipt Preview
  const [previewReceipt, setPreviewReceipt] = useState<FeeReceipt | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 4000);
  };

  const loadDashboard = useCallback(async () => {
    if (!principal || principal.role !== 'student') {
      setError('Student or Parent authentication is required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await feeService.getStudentFeeDashboard(principal);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load fee account.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (!principal || principal.role !== 'student') {
    return (
      <Card title="Access Restricted">
        <p className="text-sm text-[#D94C5C] dark:text-[#F16B75]">
          Only authenticated Student / Parent accounts can inspect their fee ledger and receipts.
        </p>
      </Card>
    );
  }

  const openPayModal = (item: StudentFeeAccountView) => {
    setPayError(null);
    setPreparedUpi(null);
    setUpiLaunchedNotice(false);
    setTransactionRef('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setStudentNote('');
    setPayAmountRupees(String(paiseToRupees(item.account.remainingBalancePaise)));
    setPayModalAccount(item);
  };

  const handlePrepareUpi = async (e: FormEvent) => {
    e.preventDefault();
    if (!payModalAccount) return;
    setPayError(null);
    setClaimSubmitting(true);
    try {
      const prep = await paymentService.prepareUpiPayment(principal, {
        feeAccountId: payModalAccount.account.id,
        amountRupees: payAmountRupees,
      });
      setPreparedUpi(prep);
    } catch (err) {
      setPayError(
        err instanceof FinanceServiceError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not prepare UPI payment.'
      );
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleCopyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback ignored cleanly if clipboard permissions restricted
    }
  };

  const handleSubmitClaim = async (e: FormEvent) => {
    e.preventDefault();
    if (!payModalAccount) return;
    setPayError(null);
    setClaimSubmitting(true);
    try {
      await paymentService.submitPaymentClaim(principal, {
        feeAccountId: payModalAccount.account.id,
        preparedPaymentId: preparedUpi?.id,
        paymentReference: preparedUpi?.paymentReference,
        amountRupees: payAmountRupees,
        transactionReference: transactionRef,
        paymentDate,
        studentNote: studentNote.trim() || undefined,
      });
      setPayModalAccount(null);
      setPreparedUpi(null);
      showToast(
        'Payment claim submitted (Verification Pending). Balance will update after Admin verifies your transaction.'
      );
      await loadDashboard();
    } catch (err) {
      setPayError(
        err instanceof FinanceServiceError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unable to submit payment claim.'
      );
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    await feeService.markFinancialNotificationRead(principal, id);
    await loadDashboard();
  };

  const handleMarkAllRead = async () => {
    await feeService.markAllFinancialNotificationsRead(principal);
    await loadDashboard();
  };

  const accountColumns: TableColumn<StudentFeeAccountView>[] = [
    {
      key: 'period',
      header: 'Fee Period',
      render: (r) => (
        <div>
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
            {r.account.periodLabel}
          </p>
          <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
            Due {formatShortDate(r.account.dueAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Total Due',
      align: 'right',
      render: (r) => formatInrFromPaise(r.account.amountDuePaise),
    },
    {
      key: 'verified',
      header: 'Verified Paid',
      align: 'right',
      render: (r) => (
        <span className="text-[#168A62] dark:text-[#22C58B] font-semibold">
          {formatInrFromPaise(r.account.verifiedAmountPaidPaise)}
        </span>
      ),
    },
    {
      key: 'pending',
      header: 'Pending Claims',
      align: 'right',
      render: (r) =>
        r.pendingClaimsPaise > 0 ? (
          <span className="text-[#B7791F] dark:text-[#F5B942]">
            {formatInrFromPaise(r.pendingClaimsPaise)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'right',
      render: (r) => (
        <span className="font-semibold">{formatInrFromPaise(r.account.remainingBalancePaise)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const meta = ACCOUNT_STATUS_META[r.account.status];
        return <StatusText tone={meta.tone} label={meta.label} />;
      },
    },
    {
      key: 'action',
      header: 'Pay',
      align: 'right',
      render: (r) =>
        r.account.remainingBalancePaise > 0 ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => openPayModal(r)}
            iconLeft={<Smartphone className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            Pay Now
          </Button>
        ) : (
          <StatusText tone="nominal" label="Settled" />
        ),
    },
  ];

  const claimColumns: TableColumn<PaymentClaimDetailView>[] = [
    {
      key: 'period',
      header: 'Period & Date',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">{r.periodLabel}</p>
          <p className="font-mono text-[#687086] dark:text-[#A6B0C3]">
            Paid {formatShortDate(r.claim.paymentDate)}
          </p>
        </div>
      ),
    },
    {
      key: 'utr',
      header: 'UTR / Transaction Reference',
      render: (r) => (
        <div className="text-xs font-mono">
          <p className="font-semibold">{r.claim.transactionReference}</p>
          <p className="text-[#687086] dark:text-[#A6B0C3]">{r.claim.paymentReference}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatInrFromPaise(r.claim.amountPaise)}</span>,
    },
    {
      key: 'status',
      header: 'Verification Status',
      render: (r) => {
        const meta = CLAIM_STATUS_META[r.claim.status];
        return (
          <div className="space-y-0.5">
            <StatusText tone={meta.tone} label={meta.label} />
            {r.claim.rejectionReason && (
              <p className="text-xs text-[#D94C5C] dark:text-[#F16B75]">
                {r.claim.rejectionReason}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'receipt',
      header: 'Receipt',
      align: 'right',
      render: (r) =>
        r.receipt ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              if (!r.receipt) return;
              try {
                const latest = await receiptService.getReceiptById(principal, r.receipt.id);
                setPreviewReceipt(latest);
              } catch {
                setPreviewReceipt(r.receipt);
              }
            }}
            iconLeft={<Receipt className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            {r.receipt.receiptNumber}
          </Button>
        ) : (
          <span className="text-xs text-[#687086] dark:text-[#A6B0C3]">Pending verification</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Student & Parent Fee Portal · ${principal.loginId} (${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo Mode'})`}
        title="Fees, UPI Pay Now & Digital Receipts"
        subtitle="Check your fee due, verified payments, pay full or partial installments via UPI, submit payment claims, and view verified receipts."
        rightSlot={
          dashboard && (
            <StatusText
              tone={dashboard.totalRemainingBalancePaise > 0 ? 'warning' : 'nominal'}
              label={
                dashboard.totalRemainingBalancePaise > 0
                  ? `${formatInrFromPaise(dashboard.totalRemainingBalancePaise)} Remaining`
                  : 'All Fees Settled'
              }
            />
          )
        }
      />

      {toast && (
        <div
          role="status"
          className="no-print rounded-xl border border-[#168A62]/30 dark:border-[#22C58B]/40 bg-[#168A62]/8 dark:bg-[#22C58B]/12 px-4 py-3 text-sm text-[#168A62] dark:text-[#22C58B] flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{toast}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/40 bg-[#D94C5C]/8 dark:bg-[#F16B75]/12 p-4 text-sm text-[#D94C5C] dark:text-[#F16B75]"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-[#F1EEFA] dark:bg-[#202844]/70 animate-pulse"
            />
          ))}
        </div>
      ) : (
        dashboard && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Total Fee Due"
                value={formatInrFromPaise(dashboard.totalDuePaise)}
                caption={`${dashboard.accounts.length} fee period(s)`}
                icon={<IndianRupee className="w-4 h-4" />}
              />
              <StatTile
                label="Verified Amount Paid"
                value={formatInrFromPaise(dashboard.totalVerifiedPaidPaise)}
                caption={`${dashboard.receipts.filter((r) => r.status === 'issued').length} receipt(s) issued`}
                icon={<CheckCircle2 className="w-4 h-4" />}
              />
              <StatTile
                label="Remaining Balance"
                value={formatInrFromPaise(dashboard.totalRemainingBalancePaise)}
                caption="Reduced only after Admin verification"
                icon={<AlertTriangle className="w-4 h-4" />}
                accent={dashboard.totalRemainingBalancePaise > 0}
              />
              <StatTile
                label="Pending Verification Claims"
                value={formatInrFromPaise(dashboard.totalPendingClaimsPaise)}
                caption="Submitted claims under review"
                icon={<Clock className="w-4 h-4" />}
              />
            </div>

            {/* In-App Fee Reminders */}
            {dashboard.notifications.length > 0 && (
              <Card
                title={`In-App Fee Reminders & Payment Updates (${dashboard.unreadNotificationCount} unread)`}
                subtitle="On-load in-app fee due and verification reminders (no SMS/WhatsApp/email dispatch)."
                action={
                  dashboard.unreadNotificationCount > 0 ? (
                    <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
                      Mark All Read
                    </Button>
                  ) : undefined
                }
              >
                <div className="space-y-2.5">
                  {dashboard.notifications.slice(0, 6).map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Bell
                          className="w-4 h-4 text-[#7552D9] dark:text-[#A78BFA] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                            {n.title}
                          </p>
                          <p className="text-xs text-[#434960] dark:text-[#D4DCEB] mt-0.5">
                            {n.message}
                          </p>
                          <p className="font-mono text-[11px] text-[#687086] dark:text-[#A6B0C3] mt-1">
                            {formatShortDate(n.createdAt)}
                          </p>
                        </div>
                      </div>
                      {!n.readAt ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleMarkNotificationRead(n.id)}
                        >
                          Mark Read
                        </Button>
                      ) : (
                        <StatusText tone="nominal" label="Read" />
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Fee Periods & Pay Now */}
            <Card
              title="My Fee Accounts by Period"
              subtitle="Pay remaining fee in full or in partial installments via UPI, then submit your transaction reference for Admin verification."
            >
              <Table
                columns={accountColumns}
                rows={dashboard.accounts}
                rowKey={(r) => r.account.id}
                emptyTitle="No fee periods generated yet"
                emptyDescription="Fee accounts will appear once Admin generates the active fee period."
                mobileCardRender={(r) => {
                  const meta = ACCOUNT_STATUS_META[r.account.status];
                  return (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{r.account.periodLabel}</p>
                          <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                            Due {formatShortDate(r.account.dueAt)}
                          </p>
                        </div>
                        <StatusText tone={meta.tone} label={meta.label} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                        <div>
                          <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Due</span>
                          <span>{formatInrFromPaise(r.account.amountDuePaise)}</span>
                        </div>
                        <div>
                          <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Verified</span>
                          <span className="text-[#168A62] dark:text-[#22C58B]">
                            {formatInrFromPaise(r.account.verifiedAmountPaidPaise)}
                          </span>
                        </div>
                        <div>
                          <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Remaining</span>
                          <span className="font-bold">{formatInrFromPaise(r.account.remainingBalancePaise)}</span>
                        </div>
                      </div>
                      {r.account.remainingBalancePaise > 0 && (
                        <Button
                          variant="primary"
                          size="sm"
                          className="w-full"
                          onClick={() => openPayModal(r)}
                        >
                          Pay Now via UPI
                        </Button>
                      )}
                    </div>
                  );
                }}
              />
            </Card>

            {/* Payment Claims & Receipts History */}
            <Card
              title={`Payment History & Verified Receipts (${dashboard.claims.length})`}
              subtitle="Only verified payments carry official receipts. Submitted claims await Admin verification."
            >
              <Table
                columns={claimColumns}
                rows={dashboard.claims}
                rowKey={(r) => r.claim.id}
                emptyTitle="No payment claims submitted yet"
                mobileCardRender={(r) => {
                  const meta = CLAIM_STATUS_META[r.claim.status];
                  return (
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{r.periodLabel}</p>
                          <p className="font-mono text-[#687086] dark:text-[#A6B0C3]">
                            UTR: {r.claim.transactionReference}
                          </p>
                        </div>
                        <StatusText tone={meta.tone} label={meta.label} />
                      </div>
                      <div className="flex items-center justify-between font-mono">
                        <span>{formatShortDate(r.claim.paymentDate)}</span>
                        <span className="font-bold">{formatInrFromPaise(r.claim.amountPaise)}</span>
                      </div>
                      {r.receipt && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full"
                          onClick={() => r.receipt && setPreviewReceipt(r.receipt)}
                        >
                          View / Print Receipt ({r.receipt.receiptNumber})
                        </Button>
                      )}
                    </div>
                  );
                }}
              />
            </Card>
          </>
        )
      )}

      {/* Pay Now + Claim Submission Modal */}
      <Modal
        open={Boolean(payModalAccount)}
        onClose={() => setPayModalAccount(null)}
        title={
          payModalAccount
            ? `Pay Fee · ${payModalAccount.account.periodLabel}`
            : 'Pay Tuition Fee'
        }
        subtitle="Step 1: Prepare UPI Payment URI (or pay manually via Centre UPI ID). Step 2: Submit your UTR for Admin verification."
        maxWidthClass="max-w-xl"
      >
        {payModalAccount && (
          <div className="space-y-5">
            {payError && (
              <div
                role="alert"
                className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/40 bg-[#D94C5C]/8 dark:bg-[#F16B75]/12 p-3 text-xs text-[#D94C5C] dark:text-[#F16B75]"
              >
                {payError}
              </div>
            )}

            <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426] p-3.5 text-xs flex flex-wrap justify-between gap-2 font-mono tabular-nums">
              <span>
                Remaining Balance:{' '}
                <strong>{formatInrFromPaise(payModalAccount.account.remainingBalancePaise)}</strong>
              </span>
              {dashboard?.upiConfig?.status === 'active' ? (
                <span className="text-[#7552D9] dark:text-[#C4B5FD]">
                  UPI ID: {dashboard.upiConfig.upiId}
                </span>
              ) : (
                <span className="text-[#D94C5C] dark:text-[#F16B75]">UPI Disabled</span>
              )}
            </div>

            {!preparedUpi ? (
              <form onSubmit={handlePrepareUpi} className="space-y-4">
                <Input
                  label="Payment Amount (INR) — Full or Partial Installment"
                  type="number"
                  min="1"
                  max={paiseToRupees(payModalAccount.account.remainingBalancePaise)}
                  step="0.01"
                  value={payAmountRupees}
                  onChange={(e) => setPayAmountRupees(e.target.value)}
                  hint={`Maximum payable: ${formatInrFromPaise(payModalAccount.account.remainingBalancePaise)}`}
                  required
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    loading={claimSubmitting}
                    disabled={dashboard?.upiConfig?.status !== 'active'}
                  >
                    Prepare UPI Payment Link
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setPreparedUpi({
                        id: 'MANUAL',
                        paymentReference: `MANUAL-${payModalAccount.account.feePeriod}`,
                        studentId: principal.loginId,
                        feeAccountId: payModalAccount.account.id,
                        feePeriod: payModalAccount.account.feePeriod,
                        amountPaise: Math.round(Number(payAmountRupees) * 100) || payModalAccount.account.remainingBalancePaise,
                        upiId: dashboard?.upiConfig?.upiId ?? '',
                        payeeName: dashboard?.upiConfig?.payeeName ?? 'Centre',
                        description: 'Manual UPI Transfer',
                        upiUri: '',
                        paymentType: 'partial',
                        status: 'payment_prepared',
                        idempotencyKey: 'manual',
                        preparedAt: new Date().toISOString(),
                      })
                    }
                  >
                    Already Paid? Submit UTR Claim Directly
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                {preparedUpi.upiUri && (
                  <div className="rounded-xl border border-[#7552D9]/30 dark:border-[#8B5CF6]/40 bg-[#F1EEFA]/75 dark:bg-[#202844]/75 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-[#7552D9] dark:text-[#C4B5FD]">
                          UPI Payment Prepared (Payment Ref: {preparedUpi.paymentReference})
                        </p>
                        <p className="font-mono text-sm font-bold text-[#17172B] dark:text-[#F8FAFC] mt-0.5 tabular-nums">
                          Amount: {formatInrFromPaise(preparedUpi.amountPaise)} · Payee: {preparedUpi.payeeName}
                        </p>
                      </div>
                      <a
                        href={preparedUpi.upiUri}
                        onClick={() => setUpiLaunchedNotice(true)}
                        className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold bg-[#7552D9] dark:bg-[#8B5CF6] text-white hover:bg-[#6441C8] transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" aria-hidden="true" />
                        <span>Open UPI App</span>
                      </a>
                    </div>

                    {/* Desktop / Fallback Copyable UPI Details */}
                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleCopyText('upi', preparedUpi.upiId)}
                        className="flex items-center justify-between rounded-lg border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#171D34] px-3 py-2 cursor-pointer"
                      >
                        <span className="font-mono truncate">{preparedUpi.upiId}</span>
                        {copiedField === 'upi' ? (
                          <Check className="w-3.5 h-3.5 text-[#168A62] shrink-0" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[#687086] shrink-0" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyText('ref', preparedUpi.paymentReference)}
                        className="flex items-center justify-between rounded-lg border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#171D34] px-3 py-2 cursor-pointer"
                      >
                        <span className="font-mono truncate">{preparedUpi.paymentReference}</span>
                        {copiedField === 'ref' ? (
                          <Check className="w-3.5 h-3.5 text-[#168A62] shrink-0" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[#687086] shrink-0" />
                        )}
                      </button>
                    </div>

                    <p className="text-[11px] text-[#434960] dark:text-[#D4DCEB] leading-relaxed">
                      <strong>Important:</strong> Opening your UPI app does NOT confirm or mark your fee as paid. Complete the transfer in your UPI app, then submit the UTR / transaction reference below.
                      {upiLaunchedNotice && ' UPI app link triggered — submit your UTR below once completed.'}
                    </p>
                  </div>
                )}

                <form onSubmit={handleSubmitClaim} className="space-y-3.5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Paid Amount (INR)"
                      type="number"
                      min="1"
                      max={paiseToRupees(payModalAccount.account.remainingBalancePaise)}
                      step="0.01"
                      value={payAmountRupees}
                      onChange={(e) => setPayAmountRupees(e.target.value)}
                      required
                    />
                    <Input
                      label="Payment Date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      required
                    />
                  </div>
                  <Input
                    label="UPI Transaction ID / UTR Reference (Mandatory)"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="e.g. UTR631098459901"
                    hint="Enter the 12-digit UTR or UPI transaction reference shown in your payment app."
                    required
                  />
                  <Input
                    label="Note to Admin (Optional)"
                    value={studentNote}
                    onChange={(e) => setStudentNote(e.target.value)}
                    placeholder="e.g. Paid via Google Pay / PhonePe"
                  />
                  <div className="flex justify-end gap-2.5">
                    <Button
                      variant="secondary"
                      onClick={() => setPayModalAccount(null)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" loading={claimSubmitting}>
                      Submit Payment Claim for Verification
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ReceiptPreviewModal
        receipt={previewReceipt}
        onClose={() => setPreviewReceipt(null)}
      />
    </div>
  );
}
