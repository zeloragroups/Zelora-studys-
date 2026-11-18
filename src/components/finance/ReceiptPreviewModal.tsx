import { Printer } from 'lucide-react';
import { useInterface } from '../../context/InterfaceContext';
import type { FeeReceipt } from '../../types';
import { formatInrFromPaise } from '../../utils/currency';
import { formatShortDate } from '../../utils/formatters';
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
        <div className="print-surface rounded-2xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426] p-5 sm:p-6 space-y-5">
          {/* Receipt Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#E5E7EF] dark:border-[#303A55]">
            <div className="flex items-start gap-3 min-w-0">
              <BrandLogoMark
                logoConfiguration={applicationBranding.logoConfiguration}
                alt={receipt.centreName}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#7552D9] dark:text-[#A78BFA]">
                  Official Verified Payment Receipt
                </p>
                <h3 className="mt-1 text-xl font-bold font-display text-[#17172B] dark:text-[#F8FAFC]">
                  {receipt.centreName}
                </h3>
                {centreProfile.tagline && (
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                    {centreProfile.tagline}
                  </p>
                )}
                {locationParts.length > 0 && (
                  <p className="mt-1 text-[11px] text-[#687086] dark:text-[#A6B0C3]">
                    {locationParts.join(', ')}
                  </p>
                )}
                {contactParts.length > 0 && (
                  <p className="text-[11px] font-mono text-[#687086] dark:text-[#A6B0C3]">
                    {contactParts.join(' · ')}
                  </p>
                )}
                <p className="mt-1 text-xs font-mono text-[#687086] dark:text-[#A6B0C3]">
                  Receipt No:{' '}
                  <span className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
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
              <p className="text-xs font-mono text-[#687086] dark:text-[#A6B0C3] tabular-nums">
                Issued: {formatShortDate(receipt.issuedAt)}
              </p>
            </div>
          </div>

          {isVoided && receipt.voidReason && (
            <div
              role="alert"
              className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/40 bg-[#D94C5C]/8 dark:bg-[#F16B75]/12 p-3 text-xs text-[#D94C5C] dark:text-[#F16B75]"
            >
              <span className="font-semibold">Void Notice:</span> {receipt.voidReason}
            </div>
          )}

          {/* Student & Period Details */}
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="space-y-1">
              <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">Student Name & ID</p>
              <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                {receipt.studentName}
              </p>
              <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                {receipt.studentId}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">Class & Batch</p>
              <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                {receipt.className}
              </p>
              <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">{receipt.batchName}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">Fee Period Covered</p>
              <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                {receipt.periodLabel}
              </p>
              <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                Period Code: {receipt.feePeriod}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">Payment Date & Verification</p>
              <p className="font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC] tabular-nums">
                {formatShortDate(receipt.paymentDate)}
              </p>
              <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                Verified By: {receipt.issuedBy}
              </p>
            </div>
          </div>

          {/* Payment References */}
          <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#171D34] p-4 grid gap-3 sm:grid-cols-2 text-xs">
            <div>
              <p className="text-[#687086] dark:text-[#A6B0C3]">Internal Payment Reference</p>
              <p className="mt-0.5 font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                {receipt.paymentReference}
              </p>
            </div>
            <div>
              <p className="text-[#687086] dark:text-[#A6B0C3]">Student-Submitted UTR / Transaction Ref</p>
              <p className="mt-0.5 font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                {receipt.transactionReference ?? 'Not recorded'}
              </p>
            </div>
          </div>

          {/* Financial Breakdown (explicit distinction for partial vs full payments) */}
          <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#171D34] divide-y divide-[#E5E7EF] dark:divide-[#303A55] text-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-[#F1EEFA]/70 dark:bg-[#202844]/70 rounded-t-xl">
              <span className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                Verified Payment Amount (This Receipt)
              </span>
              <span className="font-mono text-base font-bold text-[#7552D9] dark:text-[#C4B5FD] tabular-nums">
                {formatInrFromPaise(receipt.amountPaise)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-[#687086] dark:text-[#A6B0C3]">
                Total Period Fee Due ({receipt.periodLabel})
              </span>
              <span className="font-mono font-medium text-[#17172B] dark:text-[#F8FAFC] tabular-nums">
                {formatInrFromPaise(receipt.totalFeeDuePaise)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-[#687086] dark:text-[#A6B0C3]">
                Cumulative Verified Paid for Period
              </span>
              <span className="font-mono font-medium text-[#168A62] dark:text-[#22C58B] tabular-nums">
                {formatInrFromPaise(receipt.totalAmountPaidAfterPaise)}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-[#687086] dark:text-[#A6B0C3]">
                Remaining Period Balance
              </span>
              <span className="font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC] tabular-nums">
                {formatInrFromPaise(receipt.remainingBalancePaise)}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
            Receipt ID: <span className="font-mono">{receipt.id}</span> · Verified Payment ID:{' '}
            <span className="font-mono">{receipt.verifiedPaymentId}</span> · Claim ID:{' '}
            <span className="font-mono">{receipt.paymentClaimId}</span>
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
