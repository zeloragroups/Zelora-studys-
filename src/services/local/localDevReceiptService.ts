import type { AuthPrincipal, FeeReceipt } from '../../types';
import { FinanceServiceError, type IReceiptService } from '../contracts/financeService';
import { requireActiveActor, requireAdminActor, requireStudentActor } from './localFinanceHelpers';
import { LocalFinanceStore, sharedLocalFinanceStore } from './localFinanceStore';

export class LocalDevReceiptService implements IReceiptService {
  private readonly store: LocalFinanceStore;

  constructor(store: LocalFinanceStore = sharedLocalFinanceStore) {
    this.store = store;
  }

  async listReceiptsForAdmin(
    actor: AuthPrincipal | null,
    search?: string
  ): Promise<FeeReceipt[]> {
    requireAdminActor(this.store, actor, 'fees:view_receipts');
    let list = [...this.store.receipts];
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.receiptNumber.toLowerCase().includes(q) ||
          r.studentId.toLowerCase().includes(q) ||
          r.studentName.toLowerCase().includes(q) ||
          r.paymentReference.toLowerCase().includes(q) ||
          (r.transactionReference ?? '').toLowerCase().includes(q)
      );
    }
    return list
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .map((r) => ({ ...r }));
  }

  async listMyReceipts(actor: AuthPrincipal | null): Promise<FeeReceipt[]> {
    const student = requireStudentActor(this.store, actor, 'fees:view_receipts');
    const loginUpper = student.loginId.trim().toUpperCase();
    return this.store.receipts
      .filter((r) => r.studentId.toUpperCase() === loginUpper)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .map((r) => ({ ...r }));
  }

  async getReceiptById(actor: AuthPrincipal | null, receiptId: string): Promise<FeeReceipt> {
    const active = requireActiveActor(this.store, actor);
    const receipt = this.store.receipts.find((r) => r.id === receiptId);
    if (!receipt) {
      throw new FinanceServiceError('NOT_FOUND', 'Receipt not found.');
    }
    if (active.role === 'admin') {
      return { ...receipt };
    }
    if (
      active.role === 'student' &&
      receipt.studentId.toUpperCase() === active.loginId.trim().toUpperCase()
    ) {
      return { ...receipt };
    }
    throw new FinanceServiceError(
      'UNAUTHORIZED',
      'Access denied. You do not have permission to view this receipt.'
    );
  }

  async getReceiptForVerifiedPayment(
    actor: AuthPrincipal | null,
    verifiedPaymentId: string
  ): Promise<FeeReceipt> {
    const active = requireActiveActor(this.store, actor);
    const receipt = this.store.receipts.find(
      (r) => r.verifiedPaymentId === verifiedPaymentId && r.status === 'issued'
    );
    if (!receipt) {
      throw new FinanceServiceError(
        'NOT_FOUND',
        'No issued receipt exists for this payment. Only verified payments generate valid receipts.'
      );
    }
    if (
      active.role === 'admin' ||
      (active.role === 'student' &&
        receipt.studentId.toUpperCase() === active.loginId.trim().toUpperCase())
    ) {
      return { ...receipt };
    }
    throw new FinanceServiceError('UNAUTHORIZED', 'Access denied to this receipt.');
  }
}

export const localDevReceiptService = new LocalDevReceiptService();
