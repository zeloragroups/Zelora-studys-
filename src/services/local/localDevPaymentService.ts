import type {
  AuthPrincipal,
  FeeReceipt,
  PaymentClaim,
  PaymentClaimDetailView,
  PaymentVerificationAudit,
  PreparedUpiPayment,
  VerifiedPayment,
} from '../../types';
import {
  formatInrFromPaise,
  paiseToUpiAmountString,
  rupeesToPaise,
} from '../../utils/currency';
import {
  validateIsoDate,
  validateRequiredText,
  validateTransactionReference,
} from '../../utils/validation';
import {
  FinanceServiceError,
  type IPaymentClaimService,
  type IPaymentVerificationService,
  type PrepareUpiPaymentInput,
  type SubmitPaymentClaimInput,
} from '../contracts/financeService';
import {
  appendFinancialAudit,
  appendPaymentVerificationAudit,
  buildPaymentClaimDetailView,
  computeFeeAccountStatus,
  enqueueFinancialNotification,
  getStudentPlacementInfo,
  recomputeAndPersistFeeAccount,
  requireAdminActor,
  requireStudentActor,
} from './localFinanceHelpers';
import {
  formatFinanceId,
  formatReceiptNumber,
  LocalFinanceStore,
  sharedLocalFinanceStore,
} from './localFinanceStore';
import { LocalSettingsStore, sharedLocalSettingsStore } from './localSettingsStore';

export class LocalDevPaymentService
  implements IPaymentClaimService, IPaymentVerificationService
{
  private readonly store: LocalFinanceStore;
  private readonly settingsStore: LocalSettingsStore;

  constructor(
    store: LocalFinanceStore = sharedLocalFinanceStore,
    settingsStore: LocalSettingsStore = sharedLocalSettingsStore
  ) {
    this.store = store;
    this.settingsStore = settingsStore;
  }

  async prepareUpiPayment(
    actor: AuthPrincipal | null,
    input: PrepareUpiPaymentInput
  ): Promise<PreparedUpiPayment> {
    const student = requireStudentActor(this.store, actor, 'fees:initiate_upi_payment');
    const studentIdUpper = student.loginId.trim().toUpperCase();

    const account = this.store.studentFeeAccounts.find(
      (a) => a.id === input.feeAccountId
    );
    if (!account) {
      throw new FinanceServiceError('NOT_FOUND', 'Fee account not found.', 'feeAccountId');
    }
    if (account.studentId.toUpperCase() !== studentIdUpper) {
      throw new FinanceServiceError(
        'UNAUTHORIZED',
        'You may only prepare payments for your own fee account.'
      );
    }

    const upiConfig = this.store.upiConfigurations[0];
    if (!upiConfig || upiConfig.status !== 'active') {
      throw new FinanceServiceError(
        'UPI_DISABLED',
        'Tuition centre UPI payment details are not currently active. Please contact Admin.'
      );
    }

    const computed = computeFeeAccountStatus(this.store, account);
    if (computed.remainingBalancePaise <= 0) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        'This fee period has already been fully paid.'
      );
    }

    const amountPaise = rupeesToPaise(input.amountRupees);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Payment amount must be greater than zero.',
        'amountRupees'
      );
    }
    if (amountPaise > computed.remainingBalancePaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Requested amount (${formatInrFromPaise(amountPaise)}) exceeds remaining balance (${formatInrFromPaise(computed.remainingBalancePaise)}).`,
        'amountRupees'
      );
    }

    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `${studentIdUpper}:${account.id}:${amountPaise}`;

    // Prevent duplicate prepared requests from rapid double-clicks
    const existingPrepared = this.store.preparedUpiPayments.find(
      (p) =>
        p.studentId.toUpperCase() === studentIdUpper &&
        p.feeAccountId === account.id &&
        p.amountPaise === amountPaise &&
        p.idempotencyKey === idempotencyKey &&
        p.status === 'payment_prepared'
    );
    if (existingPrepared) {
      return { ...existingPrepared };
    }

    const seq = this.store.counters.preparedUpiSeq;
    const id = formatFinanceId('PREQ', seq);
    this.store.counters.preparedUpiSeq = seq + 1;

    const cleanPeriod = account.feePeriod.replace(/[^0-9A-Za-z]/g, '');
    const paymentReference = `PAYREF-${cleanPeriod}-${String(seq).padStart(4, '0')}`;
    const description = upiConfig.description
      ? `${upiConfig.description} (${account.feePeriod} · ${studentIdUpper})`
      : `Tuition Fee ${account.feePeriod} (${studentIdUpper})`;

    const amountStr = paiseToUpiAmountString(amountPaise);
    const upiUri =
      `upi://pay?pa=${encodeURIComponent(upiConfig.upiId)}` +
      `&pn=${encodeURIComponent(upiConfig.payeeName)}` +
      `&am=${encodeURIComponent(amountStr)}` +
      `&cu=INR` +
      `&tn=${encodeURIComponent(description)}` +
      `&tr=${encodeURIComponent(paymentReference)}`;

    const prepared: PreparedUpiPayment = {
      id,
      paymentReference,
      studentId: studentIdUpper,
      feeAccountId: account.id,
      feePeriod: account.feePeriod,
      amountPaise,
      upiId: upiConfig.upiId,
      payeeName: upiConfig.payeeName,
      description,
      upiUri,
      paymentType: amountPaise === computed.remainingBalancePaise ? 'full' : 'partial',
      status: 'payment_prepared',
      idempotencyKey,
      preparedAt: new Date().toISOString(),
    };

    this.store.preparedUpiPayments = [prepared, ...this.store.preparedUpiPayments];
    this.store.save();
    return { ...prepared };
  }

  async submitPaymentClaim(
    actor: AuthPrincipal | null,
    input: SubmitPaymentClaimInput
  ): Promise<PaymentClaimDetailView> {
    const student = requireStudentActor(this.store, actor, 'fees:initiate_upi_payment');
    const studentIdUpper = student.loginId.trim().toUpperCase();

    const account = this.store.studentFeeAccounts.find((a) => a.id === input.feeAccountId);
    if (!account) {
      throw new FinanceServiceError('NOT_FOUND', 'Fee account not found.', 'feeAccountId');
    }
    if (account.studentId.toUpperCase() !== studentIdUpper) {
      throw new FinanceServiceError(
        'UNAUTHORIZED',
        'Access denied. You can only submit payment claims for your own fee account.'
      );
    }

    const amountPaise = rupeesToPaise(input.amountRupees);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Claimed amount must be greater than zero.',
        'amountRupees'
      );
    }

    const computed = computeFeeAccountStatus(this.store, account);
    if (amountPaise > computed.remainingBalancePaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Claimed amount (${formatInrFromPaise(amountPaise)}) exceeds remaining fee balance (${formatInrFromPaise(computed.remainingBalancePaise)}).`,
        'amountRupees'
      );
    }
    if (computed.pendingClaimsPaise + amountPaise > computed.remainingBalancePaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `You already have ${formatInrFromPaise(computed.pendingClaimsPaise)} pending verification. Combined pending claims cannot exceed your remaining balance (${formatInrFromPaise(computed.remainingBalancePaise)}).`,
        'amountRupees'
      );
    }

    const utrCheck = validateTransactionReference(input.transactionReference);
    if (!utrCheck.valid) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        utrCheck.error!,
        'transactionReference'
      );
    }
    const dateCheck = validateIsoDate(input.paymentDate, 'Payment date');
    if (!dateCheck.valid) {
      throw new FinanceServiceError('VALIDATION_ERROR', dateCheck.error!, 'paymentDate');
    }

    let resolvedPaymentRef = input.paymentReference?.trim() || '';
    if (input.preparedPaymentId) {
      const prepIdx = this.store.preparedUpiPayments.findIndex(
        (p) => p.id === input.preparedPaymentId
      );
      if (prepIdx === -1) {
        throw new FinanceServiceError(
          'INVALID_REFERENCE',
          'Prepared payment request not found.'
        );
      }
      const prep = this.store.preparedUpiPayments[prepIdx];
      if (prep.studentId.toUpperCase() !== studentIdUpper || prep.feeAccountId !== account.id) {
        throw new FinanceServiceError('UNAUTHORIZED', 'Prepared payment reference mismatch.');
      }
      if (prep.status === 'claim_submitted') {
        throw new FinanceServiceError(
          'DUPLICATE_CLAIM',
          'A payment claim has already been submitted for this payment reference.'
        );
      }
      resolvedPaymentRef = prep.paymentReference;
    }

    const normalizedUtr = input.transactionReference.trim().toUpperCase();
    const duplicateMatches = this.store.paymentClaims
      .filter((c) => c.transactionReference.trim().toUpperCase() === normalizedUtr)
      .map((c) => c.id);
    const verifiedDup = this.store.verifiedPayments
      .filter((v) => v.transactionReference.trim().toUpperCase() === normalizedUtr)
      .map((v) => v.paymentClaimId);
    const duplicateOfClaimIds = Array.from(new Set([...duplicateMatches, ...verifiedDup]));
    const duplicateTransactionFlag = duplicateOfClaimIds.length > 0;

    const seq = this.store.counters.paymentClaimSeq;
    const claimId = formatFinanceId('PCLM', seq);
    this.store.counters.paymentClaimSeq = seq + 1;

    if (!resolvedPaymentRef) {
      const cleanPeriod = account.feePeriod.replace(/[^0-9A-Za-z]/g, '');
      resolvedPaymentRef = `PAYREF-${cleanPeriod}-${String(seq).padStart(4, '0')}`;
    }

    const nowIso = new Date().toISOString();
    const claim: PaymentClaim = {
      id: claimId,
      paymentReference: resolvedPaymentRef,
      preparedPaymentId: input.preparedPaymentId,
      studentId: studentIdUpper,
      feeAccountId: account.id,
      feePeriod: account.feePeriod,
      amountPaise,
      transactionReference: input.transactionReference.trim(),
      paymentDate: input.paymentDate.trim(),
      studentNote: input.studentNote?.trim() || undefined,
      status: 'verification_pending',
      duplicateTransactionFlag,
      duplicateOfClaimIds: duplicateTransactionFlag ? duplicateOfClaimIds : undefined,
      submittedAt: nowIso,
    };

    this.store.paymentClaims = [claim, ...this.store.paymentClaims];

    if (input.preparedPaymentId) {
      this.store.preparedUpiPayments = this.store.preparedUpiPayments.map((p) =>
        p.id === input.preparedPaymentId
          ? { ...p, status: 'claim_submitted', claimId: claim.id }
          : p
      );
    }

    // Recompute status (sets account status to 'verification_pending', NEVER reduces balance!)
    recomputeAndPersistFeeAccount(this.store, account.id, nowIso);

    appendPaymentVerificationAudit(this.store, {
      paymentClaimId: claim.id,
      actorId: studentIdUpper,
      action: 'claim_submitted',
      newValues: `amountPaise=${claim.amountPaise}, utr=${claim.transactionReference}, dupFlag=${duplicateTransactionFlag}`,
      reason: claim.studentNote,
      timestamp: nowIso,
    });

    appendFinancialAudit(this.store, {
      entityType: 'payment_claim',
      entityId: claim.id,
      actorId: studentIdUpper,
      action: 'payment_claim_submitted',
      newValues: `ref=${claim.paymentReference}, amount=${formatInrFromPaise(claim.amountPaise)}, utr=${claim.transactionReference}`,
      timestamp: nowIso,
    });

    enqueueFinancialNotification(this.store, {
      recipientId: studentIdUpper,
      notificationType: 'claim_received',
      relatedRecordId: claim.id,
      dedupeKey: `claim_received:${claim.id}:${studentIdUpper}`,
      title: 'Payment Claim Submitted — Pending Verification',
      message: `Claim ${claim.paymentReference} for ${formatInrFromPaise(claim.amountPaise)} (${account.periodLabel}) was received. Your fee balance remains unchanged until Admin verifies the transaction.`,
    });

    enqueueFinancialNotification(this.store, {
      recipientId: 'ADM-0001',
      notificationType: 'claim_received',
      relatedRecordId: claim.id,
      dedupeKey: `claim_received:${claim.id}:ADM-0001`,
      title: `New Fee Claim Pending Verification (${claim.id})`,
      message: `${studentIdUpper} submitted ${formatInrFromPaise(claim.amountPaise)} for ${account.periodLabel} · UTR: ${claim.transactionReference}${duplicateTransactionFlag ? ' (DUPLICATE UTR FLAGGED)' : ''}.`,
    });

    this.store.save();
    return buildPaymentClaimDetailView(this.store, claim);
  }

  async listAdminPaymentClaims(
    actor: AuthPrincipal | null,
    statusFilter: 'all' | 'verification_pending' | 'verified' | 'rejected' = 'all'
  ): Promise<PaymentClaimDetailView[]> {
    requireAdminActor(this.store, actor, 'fees:verify_payment');
    let items = this.store.paymentClaims;
    if (statusFilter !== 'all') {
      items = items.filter((c) => c.status === statusFilter);
    }
    return [...items]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .map((c) => buildPaymentClaimDetailView(this.store, c));
  }

  async verifyPaymentClaim(
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
  }> {
    const admin = requireAdminActor(this.store, actor, 'fees:verify_payment');

    if (!input.confirmIndependentCheck) {
      throw new FinanceServiceError(
        'CONFIRMATION_REQUIRED',
        'Explicit confirmation that you independently checked the transaction outside this app is required before verifying.',
        'confirmIndependentCheck'
      );
    }

    const claimIdx = this.store.paymentClaims.findIndex((c) => c.id === input.claimId);
    if (claimIdx === -1) {
      throw new FinanceServiceError('NOT_FOUND', 'Payment claim not found.', 'claimId');
    }
    const claim = this.store.paymentClaims[claimIdx];

    if (claim.status === 'verified') {
      throw new FinanceServiceError(
        'DUPLICATE_VERIFICATION',
        'This payment claim has already been verified.'
      );
    }
    if (claim.status === 'rejected') {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Rejected payment claims cannot be verified. Student must submit a fresh claim.'
      );
    }

    const account = this.store.studentFeeAccounts.find((a) => a.id === claim.feeAccountId);
    if (!account) {
      throw new FinanceServiceError('NOT_FOUND', 'Linked student fee account not found.');
    }

    const preCompute = computeFeeAccountStatus(this.store, account);
    if (claim.amountPaise > preCompute.remainingBalancePaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Claim amount (${formatInrFromPaise(claim.amountPaise)}) exceeds current remaining balance (${formatInrFromPaise(preCompute.remainingBalancePaise)}). Reject this claim or correct prior entries.`
      );
    }

    const nowIso = new Date().toISOString();
    const verifiedClaim: PaymentClaim = {
      ...claim,
      status: 'verified',
      verifiedBy: admin.loginId,
      verifiedAt: nowIso,
      verificationNote: input.verificationNote?.trim() || undefined,
    };

    this.store.paymentClaims = [
      ...this.store.paymentClaims.slice(0, claimIdx),
      verifiedClaim,
      ...this.store.paymentClaims.slice(claimIdx + 1),
    ];

    const vpSeq = this.store.counters.verifiedPaymentSeq;
    const vpId = formatFinanceId('VPAY', vpSeq);
    this.store.counters.verifiedPaymentSeq = vpSeq + 1;

    const verifiedPayment: VerifiedPayment = {
      id: vpId,
      paymentClaimId: verifiedClaim.id,
      paymentReference: verifiedClaim.paymentReference,
      studentId: verifiedClaim.studentId,
      feeAccountId: verifiedClaim.feeAccountId,
      feePeriod: verifiedClaim.feePeriod,
      amountPaise: verifiedClaim.amountPaise,
      transactionReference: verifiedClaim.transactionReference,
      paymentDate: verifiedClaim.paymentDate,
      verifiedBy: admin.loginId,
      verifiedAt: nowIso,
      verificationNote: verifiedClaim.verificationNote,
    };

    this.store.verifiedPayments = [verifiedPayment, ...this.store.verifiedPayments];

    const updatedAccount = recomputeAndPersistFeeAccount(this.store, account.id, nowIso);

    // Issue Receipt (guarding against duplicate receipts for the same verifiedPaymentId)
    const existingReceipt = this.store.receipts.find(
      (r) => r.verifiedPaymentId === verifiedPayment.id && r.status === 'issued'
    );
    let receipt: FeeReceipt;
    if (existingReceipt) {
      receipt = existingReceipt;
    } else {
      const recSeq = this.store.counters.receiptSeq;
      const recId = formatFinanceId('REC', recSeq);
      this.store.counters.receiptSeq = recSeq + 1;
      const yearStr = verifiedPayment.paymentDate.slice(0, 4) || new Date().getFullYear().toString();
      const placement = getStudentPlacementInfo(this.store, verifiedPayment.studentId);

      receipt = {
        id: recId,
        receiptNumber: formatReceiptNumber(yearStr, recSeq),
        verifiedPaymentId: verifiedPayment.id,
        paymentClaimId: verifiedClaim.id,
        paymentReference: verifiedPayment.paymentReference,
        transactionReference: verifiedPayment.transactionReference,
        centreName:
          this.settingsStore.settings.centreProfile.centreName || this.store.centreName,
        studentId: verifiedPayment.studentId,
        studentName: placement.studentName,
        className: placement.className,
        batchName: placement.batchName,
        feePeriod: updatedAccount.feePeriod,
        periodLabel: updatedAccount.periodLabel,
        paymentDate: verifiedPayment.paymentDate,
        amountPaise: verifiedPayment.amountPaise,
        totalFeeDuePaise: updatedAccount.amountDuePaise,
        totalAmountPaidAfterPaise: updatedAccount.verifiedAmountPaidPaise,
        remainingBalancePaise: updatedAccount.remainingBalancePaise,
        verificationStatus: 'verified',
        issuedBy: admin.loginId,
        issuedAt: nowIso,
        status: 'issued',
      };
      this.store.receipts = [receipt, ...this.store.receipts];
    }

    appendPaymentVerificationAudit(this.store, {
      paymentClaimId: verifiedClaim.id,
      verifiedPaymentId: verifiedPayment.id,
      actorId: admin.loginId,
      action: 'payment_verified',
      previousValues: `status=verification_pending, remaining=${preCompute.remainingBalancePaise}`,
      newValues: `status=verified, amountPaise=${verifiedPayment.amountPaise}, remaining=${updatedAccount.remainingBalancePaise}, receipt=${receipt.receiptNumber}`,
      reason: verifiedClaim.verificationNote ?? 'Independently verified by Admin',
      timestamp: nowIso,
    });

    appendFinancialAudit(this.store, {
      entityType: 'verified_payment',
      entityId: verifiedPayment.id,
      actorId: admin.loginId,
      action: 'payment_verified_and_receipt_issued',
      previousValues: `remaining=${formatInrFromPaise(preCompute.remainingBalancePaise)}`,
      newValues: `verified=${formatInrFromPaise(verifiedPayment.amountPaise)}, remaining=${formatInrFromPaise(updatedAccount.remainingBalancePaise)}, receipt=${receipt.receiptNumber}`,
      reason: verifiedClaim.verificationNote,
      timestamp: nowIso,
    });

    enqueueFinancialNotification(this.store, {
      recipientId: verifiedPayment.studentId,
      notificationType: 'payment_verified',
      relatedRecordId: verifiedPayment.id,
      dedupeKey: `payment_verified:${verifiedPayment.id}:${verifiedPayment.studentId}`,
      title: `Payment Verified (${updatedAccount.periodLabel})`,
      message: `Your payment of ${formatInrFromPaise(verifiedPayment.amountPaise)} (Ref: ${verifiedPayment.paymentReference}) is verified. Remaining balance: ${formatInrFromPaise(updatedAccount.remainingBalancePaise)}.`,
    });

    enqueueFinancialNotification(this.store, {
      recipientId: verifiedPayment.studentId,
      notificationType: 'receipt_issued',
      relatedRecordId: receipt.id,
      dedupeKey: `receipt_issued:${receipt.id}:${verifiedPayment.studentId}`,
      title: `Digital Receipt Ready (${receipt.receiptNumber})`,
      message: `Receipt ${receipt.receiptNumber} for ${formatInrFromPaise(receipt.amountPaise)} is now available in Fees & Receipts.`,
    });

    this.store.save();
    return {
      claim: buildPaymentClaimDetailView(this.store, verifiedClaim),
      verifiedPayment: { ...verifiedPayment },
      receipt: { ...receipt },
    };
  }

  async rejectPaymentClaim(
    actor: AuthPrincipal | null,
    input: {
      claimId: string;
      rejectionReason: string;
      verificationNote?: string;
    }
  ): Promise<PaymentClaimDetailView> {
    const admin = requireAdminActor(this.store, actor, 'fees:verify_payment');

    const reasonCheck = validateRequiredText(input.rejectionReason, 'Rejection reason', 5);
    if (!reasonCheck.valid) {
      throw new FinanceServiceError(
        'REJECTION_REASON_REQUIRED',
        reasonCheck.error!,
        'rejectionReason'
      );
    }

    const claimIdx = this.store.paymentClaims.findIndex((c) => c.id === input.claimId);
    if (claimIdx === -1) {
      throw new FinanceServiceError('NOT_FOUND', 'Payment claim not found.', 'claimId');
    }
    const claim = this.store.paymentClaims[claimIdx];

    if (claim.status === 'verified') {
      throw new FinanceServiceError(
        'DUPLICATE_VERIFICATION',
        'A verified payment claim cannot be rejected. Use an audited correction instead.'
      );
    }
    if (claim.status === 'rejected') {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'This payment claim has already been rejected.'
      );
    }

    const nowIso = new Date().toISOString();
    const rejectedClaim: PaymentClaim = {
      ...claim,
      status: 'rejected',
      verifiedBy: admin.loginId,
      verifiedAt: nowIso,
      rejectionReason: input.rejectionReason.trim(),
      verificationNote: input.verificationNote?.trim() || undefined,
    };

    this.store.paymentClaims = [
      ...this.store.paymentClaims.slice(0, claimIdx),
      rejectedClaim,
      ...this.store.paymentClaims.slice(claimIdx + 1),
    ];

    const updatedAccount = recomputeAndPersistFeeAccount(
      this.store,
      rejectedClaim.feeAccountId,
      nowIso
    );

    appendPaymentVerificationAudit(this.store, {
      paymentClaimId: rejectedClaim.id,
      actorId: admin.loginId,
      action: 'payment_rejected',
      previousValues: 'status=verification_pending',
      newValues: `status=rejected, remaining=${updatedAccount.remainingBalancePaise}`,
      reason: rejectedClaim.rejectionReason,
      timestamp: nowIso,
    });

    appendFinancialAudit(this.store, {
      entityType: 'payment_claim',
      entityId: rejectedClaim.id,
      actorId: admin.loginId,
      action: 'payment_claim_rejected',
      previousValues: 'status=verification_pending',
      newValues: `status=rejected (${formatInrFromPaise(rejectedClaim.amountPaise)} excluded from collections)`,
      reason: rejectedClaim.rejectionReason,
      timestamp: nowIso,
    });

    enqueueFinancialNotification(this.store, {
      recipientId: rejectedClaim.studentId,
      notificationType: 'payment_rejected',
      relatedRecordId: rejectedClaim.id,
      dedupeKey: `payment_rejected:${rejectedClaim.id}:${rejectedClaim.studentId}`,
      title: `Payment Claim Rejected (${rejectedClaim.paymentReference})`,
      message: `Claim for ${formatInrFromPaise(rejectedClaim.amountPaise)} was rejected: ${rejectedClaim.rejectionReason}. You may submit a corrected claim if applicable.`,
    });

    this.store.save();
    return buildPaymentClaimDetailView(this.store, rejectedClaim);
  }

  async correctVerifiedPayment(
    actor: AuthPrincipal | null,
    input: {
      verifiedPaymentId: string;
      correctedAmountRupees: number | string;
      reason: string;
    }
  ): Promise<{
    verifiedPayment: VerifiedPayment;
    voidedReceiptId?: string;
    newReceipt?: FeeReceipt;
  }> {
    const admin = requireAdminActor(this.store, actor, 'fees:verify_payment');
    const reasonCheck = validateRequiredText(input.reason, 'Correction reason', 5);
    if (!reasonCheck.valid) {
      throw new FinanceServiceError('CORRECTION_REASON_REQUIRED', reasonCheck.error!, 'reason');
    }

    const vpIdx = this.store.verifiedPayments.findIndex((v) => v.id === input.verifiedPaymentId);
    if (vpIdx === -1) {
      throw new FinanceServiceError('NOT_FOUND', 'Verified payment record not found.');
    }
    const existingVp = this.store.verifiedPayments[vpIdx];
    const newAmountPaise = rupeesToPaise(input.correctedAmountRupees);
    if (!Number.isSafeInteger(newAmountPaise) || newAmountPaise <= 0) {
      throw new FinanceServiceError(
        'VALIDATION_ERROR',
        'Corrected payment amount must be positive.',
        'correctedAmountRupees'
      );
    }

    const account = this.store.studentFeeAccounts.find(
      (a) => a.id === existingVp.feeAccountId
    );
    if (!account) {
      throw new FinanceServiceError('NOT_FOUND', 'Linked fee account not found.');
    }

    const otherVerifiedSum = this.store.verifiedPayments
      .filter((v) => v.feeAccountId === account.id && v.id !== existingVp.id)
      .reduce((sum, v) => sum + v.amountPaise, 0);

    if (otherVerifiedSum + newAmountPaise > account.amountDuePaise) {
      throw new FinanceServiceError(
        'OVERPAYMENT_NOT_ALLOWED',
        `Corrected total (${formatInrFromPaise(otherVerifiedSum + newAmountPaise)}) would exceed fee due (${formatInrFromPaise(account.amountDuePaise)}).`
      );
    }

    const nowIso = new Date().toISOString();
    const updatedVp: VerifiedPayment = {
      ...existingVp,
      amountPaise: newAmountPaise,
      corrected: true,
      correctionReason: input.reason.trim(),
      updatedAt: nowIso,
    };

    this.store.verifiedPayments = [
      ...this.store.verifiedPayments.slice(0, vpIdx),
      updatedVp,
      ...this.store.verifiedPayments.slice(vpIdx + 1),
    ];

    const updatedAccount = recomputeAndPersistFeeAccount(this.store, account.id, nowIso);

    // Void prior issued receipt and issue updated receipt
    let voidedReceiptId: string | undefined;
    this.store.receipts = this.store.receipts.map((r) => {
      if (r.verifiedPaymentId === updatedVp.id && r.status === 'issued') {
        voidedReceiptId = r.id;
        return {
          ...r,
          status: 'voided',
          verificationStatus: 'voided',
          voidReason: `Superseded by audited payment correction: ${input.reason.trim()}`,
        };
      }
      return r;
    });

    const recSeq = this.store.counters.receiptSeq;
    const recId = formatFinanceId('REC', recSeq);
    this.store.counters.receiptSeq = recSeq + 1;
    const yearStr = updatedVp.paymentDate.slice(0, 4) || new Date().getFullYear().toString();
    const placement = getStudentPlacementInfo(this.store, updatedVp.studentId);

    const newReceipt: FeeReceipt = {
      id: recId,
      receiptNumber: formatReceiptNumber(yearStr, recSeq),
      verifiedPaymentId: updatedVp.id,
      paymentClaimId: updatedVp.paymentClaimId,
      paymentReference: updatedVp.paymentReference,
      transactionReference: updatedVp.transactionReference,
      centreName:
        this.settingsStore.settings.centreProfile.centreName || this.store.centreName,
      studentId: updatedVp.studentId,
      studentName: placement.studentName,
      className: placement.className,
      batchName: placement.batchName,
      feePeriod: updatedAccount.feePeriod,
      periodLabel: updatedAccount.periodLabel,
      paymentDate: updatedVp.paymentDate,
      amountPaise: updatedVp.amountPaise,
      totalFeeDuePaise: updatedAccount.amountDuePaise,
      totalAmountPaidAfterPaise: updatedAccount.verifiedAmountPaidPaise,
      remainingBalancePaise: updatedAccount.remainingBalancePaise,
      verificationStatus: 'verified',
      issuedBy: admin.loginId,
      issuedAt: nowIso,
      status: 'issued',
    };
    this.store.receipts = [newReceipt, ...this.store.receipts];

    appendPaymentVerificationAudit(this.store, {
      paymentClaimId: updatedVp.paymentClaimId,
      verifiedPaymentId: updatedVp.id,
      actorId: admin.loginId,
      action: 'payment_corrected',
      previousValues: `amountPaise=${existingVp.amountPaise}`,
      newValues: `amountPaise=${updatedVp.amountPaise}, newReceipt=${newReceipt.receiptNumber}`,
      reason: input.reason.trim(),
      timestamp: nowIso,
    });

    appendFinancialAudit(this.store, {
      entityType: 'verified_payment',
      entityId: updatedVp.id,
      actorId: admin.loginId,
      action: 'verified_payment_corrected',
      previousValues: formatInrFromPaise(existingVp.amountPaise),
      newValues: `${formatInrFromPaise(updatedVp.amountPaise)} (receipt ${newReceipt.receiptNumber})`,
      reason: input.reason.trim(),
      timestamp: nowIso,
    });

    this.store.save();
    return {
      verifiedPayment: { ...updatedVp },
      voidedReceiptId,
      newReceipt: { ...newReceipt },
    };
  }

  async listPaymentVerificationAudit(
    actor: AuthPrincipal | null,
    claimId?: string
  ): Promise<PaymentVerificationAudit[]> {
    requireAdminActor(this.store, actor, 'fees:verify_payment');
    const list = claimId
      ? this.store.paymentVerificationAudits.filter((a) => a.paymentClaimId === claimId)
      : this.store.paymentVerificationAudits;
    return [...list]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .map((a) => ({ ...a }));
  }
}

export const localDevPaymentService = new LocalDevPaymentService();
