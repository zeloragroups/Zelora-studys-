import { Printer } from 'lucide-react';
import { useInterface } from '../../context/InterfaceContext';
import type { FeeReceipt } from '../../types';
import { formatInrFromPaise } from '../../utils/currency';
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { BrandLogoMark } from '../ui/BrandLogoMark';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { StatusText } from '../ui/StatusText';

interface ReceiptPreviewModalProps {
  receipt: FeeReceipt | null;
  onClose: () => void;
}

export function ReceiptPreviewModal({ receipt, onClose }: ReceiptPreviewModalProps) {
  const { publicSettings } = useInterface();
  if (!receipt) return null;

  const { centreProfile, applicationBranding } = publicSettings;
  const locationParts = [
    centreProfile.address,
    centreProfile.city,
    centreProfile.state,
    centreProfile.pinCode,
    centreProfile.country,
  ].filter((v) => v && v.trim().length > 0);
  const contactParts = [
    centreProfile.contactNumber,
    centreProfile.publicEmail,
    centreProfile.websiteUrl,
  ].filter((v) => v && v.trim().length > 0);

  const isVoided = receipt.status === 'voided' || receipt.verificationStatus === 'voided';

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open={Boolean(receipt)}
      onClose={onClose}
      title={`Digital Fee Receipt · ${receipt.receiptNumber}`}
      subtitle="Issued only after Admin verification of received fee payment."
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="print-surface rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-5 sm:p-6 space-y-5">
          {/* Receipt Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[var(--border)]">
            <div className="flex items-start gap-3 min-w-0">
              <BrandLogoMark
                logoConfiguration={applicationBranding.logoConfiguration}
                alt={receipt.centreName}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--accent-text)]">
                  Official Verified Payment Receipt
                </p>
                <h3 className="mt-1 text-xl font-bold font-display text-[var(--text-primary)]">
                  {receipt.centreName}
                </h3>
                {centreProfile.tagline && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {centreProfile.tagline}
                  </p>
                )}
                {locationParts.length > 0 && (
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {locationParts.join(', ')}
                  </p>
                )}
                {contactParts.length > 0 && (
                  <p className="text-[11px] font-mono text-[var(--text-muted)]">
                    {contactParts.join(' · ')}
                  </p>
                )}
                <p className="mt-1 text-xs font-mono text-[var(--text-muted)]">
                  Receipt No:{' '}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {receipt.receiptNumber}
                  </span>
                </p>
              </div>
            </div>
            <div className="text-right space-y-1">
              <StatusText
                tone={isVoided ? 'danger' : 'nominal'}
                label={isVoided ? 'Voided / Superseded' : 'Admin Verified'}
              />
              <p className="text-xs font-mono text-[var(--text-muted)] tabular-nums">
                Issued: {formatShortDate(receipt.issuedAt)}
              </p>
            </div>
          </div>

          {isVoided && receipt.voidReason && (
            <Alert tone="error" title="Void Notice">
              {receipt.voidReason}
            </Alert>
          )}

          {/* Student & Period Details */}
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="space-y-1">
              <p className="text-xs text-[var(--text-muted)]">Student Name & ID</p>
              <p className="font-semibold text-[var(--text-primary)]">
                {receipt.studentName}
              </p>
              <p className="font-mono text-xs text-[var(--text-muted)]">
                {receipt.studentId}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[var(--text-muted)]">Class & Batch</p>
              <p className="font-semibold text-[var(--text-primary)]">
                {receipt.className}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{receipt.batchName}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[var(--text-muted)]">Fee Period Covered</p>
              <p className="font-semibold text-[var(--text-primary)]">
                {receipt.periodLabel}
              </p>
              <p className="font-mono text-xs text-[var(--text-muted)]">
                Period Code: {receipt.feePeriod}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[var(--text-muted)]">Payment Date & Verification</p>
              <p className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {formatShortDate(receipt.paymentDate)}
              </p>
              <p className="font-mono text-xs text-[var(--text-muted)]">
                Verified By: {receipt.issuedBy}
              </p>
            </div>
          </div>

          {/* Payment References */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 grid gap-3 sm:grid-cols-2 text-xs">
            <div>
              <p className="text-[var(--text-muted)]">Internal Payment Reference</p>
              <p className="mt-0.5 font-mono font-semibold text-[var(--text-primary)]">
                {receipt.paymentReference}
              </p>
            </div>
            <div>
              <p className="text-[var(--text-muted)]">Student-Submitted UTR / Transaction Ref</p>
              <p className="mt-0.5 font-mono font-semibold text-[var(--text-primary)]">
                {receipt.transactionReference ?? 'Not recorded'}
              </p>
            </div>
          </div>

          {/* Financial Breakdown (explicit distinction for partial vs full payments) */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)] text-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-[var(--accent-soft)] rounded-t-xl">
              <span className="font-semibold text-[var(--text-primary)]">
                Verified Payment Amount (This Receipt)
              </span>
              <span className="font-mono text-base font-bold text-[var(--accent-text)] tabular-nums">
                {formatInrFromPaise(receipt.amountPaise)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-[var(--text-muted)]">
                Total Period Fee Due ({receipt.periodLabel})
              </span>
              <span className="font-mono font-medium text-[var(--text-primary)] tabular-nums">
                {formatInrFromPaise(receipt.totalFeeDuePaise)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-[var(--text-muted)]">
                Cumulative Verified Paid for Period
              </span>
              <span className="font-mono font-medium text-[var(--accent-text)] tabular-nums">
                {formatInrFromPaise(receipt.totalAmountPaidAfterPaise)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-[var(--text-muted)]">
                Remaining Period Balance
              </span>
              <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                {formatInrFromPaise(receipt.remainingBalancePaise)}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Receipt ID: <span className="font-mono">{receipt.id}</span> · Verified Payment ID:{' '}
            <span className="font-mono">{receipt.verifiedPaymentId}</span> · Claim ID:{' '}
            <span className="font-mono">{receipt.paymentClaimId}</span>
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-[var(--text-muted)]">
            Use browser Print dialog to print or save a PDF copy.
          </p>
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              iconLeft={<Printer className="w-4 h-4" aria-hidden="true" />}
            >
              Print / Save as PDF via Browser
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
