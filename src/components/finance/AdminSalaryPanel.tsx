import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Banknote,
  CalendarPlus,
  CheckCircle2,
  Eye,
  PauseCircle,
  Pencil,
  PlayCircle,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FinanceServiceError } from '../../services/contracts/financeService';
import { salaryService } from '../../services';
import type {
  TeacherSalaryModel,
  TeacherSalaryPayment,
  TeacherSalaryPeriod,
  TeacherSalaryPeriodStatus,
  TeacherSalarySummaryView,
} from '../../types';
import { formatInrFromPaise, paiseToRupees } from '../../utils/currency';
import { formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

interface AdminSalaryPanelProps {
  summaries: TeacherSalarySummaryView[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
}

const SALARY_STATUS_META: Record<
  TeacherSalaryPeriodStatus,
  { tone: SemanticTone; label: string }
> = {
  paid: { tone: 'nominal', label: 'Paid' },
  partially_paid: { tone: 'warning', label: 'Partially Paid' },
  pending: { tone: 'neutral', label: 'Pending' },
  on_hold: { tone: 'danger', label: 'On Hold' },
};

export function AdminSalaryPanel({
  summaries,
  onRefresh,
  onToast,
}: AdminSalaryPanelProps) {
  const { principal } = useAuth();

  // Salary Configuration Form
  const [selectedTeacherId, setSelectedTeacherId] = useState(
    summaries[0]?.teacherId ?? 'TCH-0001'
  );
  const [salaryModel, setSalaryModel] = useState<TeacherSalaryModel>('fixed_monthly');
  const [monthlyAmountRupees, setMonthlyAmountRupees] = useState('28000');
  const [perSessionAmountRupees, setPerSessionAmountRupees] = useState('650');
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // Period generation
  const [generateMonth, setGenerateMonth] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [filterMonth, setFilterMonth] = useState('');

  // Action modals
  const [payPeriodTarget, setPayPeriodTarget] = useState<TeacherSalaryPeriod | null>(null);
  const [payAmountRupees, setPayAmountRupees] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payReference, setPayReference] = useState('');
  const [payNote, setPayNote] = useState('');

  const [holdTarget, setHoldTarget] = useState<TeacherSalaryPeriod | null>(null);
  const [holdReason, setHoldReason] = useState('');

  const [reviewTarget, setReviewTarget] = useState<TeacherSalaryPeriod | null>(null);
  const [approvedPayableRupees, setApprovedPayableRupees] = useState('');
  const [reviewReason, setReviewReason] = useState('');

  const [inspectPeriod, setInspectPeriod] = useState<TeacherSalaryPeriod | null>(null);

  const [correctPayTarget, setCorrectPayTarget] = useState<TeacherSalaryPayment | null>(null);
  const [correctedPayAmount, setCorrectedPayAmount] = useState('');
  const [correctPayReason, setCorrectPayReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!principal || principal.role !== 'admin') return null;

  const extractErr = (err: unknown) =>
    err instanceof FinanceServiceError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Salary operation failed.';

  const handleSaveSalaryConfig = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const saved = await salaryService.saveTeacherSalaryConfig(principal, {
        teacherId: selectedTeacherId,
        salaryModel,
        monthlyAmountRupees:
          salaryModel === 'fixed_monthly' ? monthlyAmountRupees : undefined,
        perSessionAmountRupees:
          salaryModel === 'per_session' ? perSessionAmountRupees : undefined,
        effectiveFrom,
      });
      onToast(
        `Saved ${saved.salaryModel === 'fixed_monthly' ? 'Fixed Monthly' : 'Per-Session'} salary configuration for ${saved.teacherId}.`
      );
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateSalaryPeriods = async () => {
    setFormError(null);
    setSubmitting(true);
    try {
      const periods = await salaryService.generateSalaryPeriodsForMonth(
        principal,
        generateMonth
      );
      onToast(
        `Generated/refreshed ${periods.length} teacher salary period(s) for ${generateMonth}.`
      );
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!payPeriodTarget) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await salaryService.recordSalaryPayment(principal, {
        teacherSalaryPeriodId: payPeriodTarget.id,
        amountRupees: payAmountRupees,
        paymentDate: payDate,
        paymentReference: payReference.trim() || undefined,
        note: payNote.trim() || undefined,
      });
      setPayPeriodTarget(null);
      setPayReference('');
      setPayNote('');
      onToast(
        `Recorded salary payout of ${formatInrFromPaise(res.payment.amountPaise)} for ${res.period.teacherName}.`
      );
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleHold = async (e: FormEvent) => {
    e.preventDefault();
    if (!holdTarget) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const nextOnHold = holdTarget.status !== 'on_hold';
      await salaryService.setSalaryPeriodHoldStatus(principal, {
        teacherSalaryPeriodId: holdTarget.id,
        onHold: nextOnHold,
        reason: holdReason,
      });
      setHoldTarget(null);
      setHoldReason('');
      onToast(
        nextOnHold
          ? 'Salary period placed on hold.'
          : 'Salary period resumed from hold.'
      );
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await salaryService.resolveSalaryPeriodReview(principal, {
        teacherSalaryPeriodId: reviewTarget.id,
        approvedPayableRupees,
        reason: reviewReason,
      });
      setReviewTarget(null);
      setApprovedPayableRupees('');
      setReviewReason('');
      onToast('Salary period review resolved and payable amount updated.');
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCorrectPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!correctPayTarget) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await salaryService.correctSalaryPayment(principal, {
        salaryPaymentId: correctPayTarget.id,
        correctedAmountRupees: correctedPayAmount,
        reason: correctPayReason,
      });
      setCorrectPayTarget(null);
      setCorrectedPayAmount('');
      setCorrectPayReason('');
      onToast('Salary payment corrected with full audit entry.');
      await onRefresh();
    } catch (err) {
      setFormError(extractErr(err));
    } finally {
      setSubmitting(false);
    }
  };

  const allPeriods = summaries
    .flatMap((s) => s.periods)
    .filter((p) => (filterMonth.trim() ? p.period.includes(filterMonth.trim()) : true))
    .sort((a, b) => b.period.localeCompare(a.period));

  const allPayments = summaries
    .flatMap((s) => s.payments)
    .filter((p) => (filterMonth.trim() ? p.period.includes(filterMonth.trim()) : true))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  const periodColumns: TableColumn<TeacherSalaryPeriod>[] = [
    {
      key: 'teacher',
      header: 'Teacher & Period',
      render: (p) => (
        <div>
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">{p.teacherName}</p>
          <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
            {p.teacherId} · {p.periodLabel}
          </p>
        </div>
      ),
    },
    {
      key: 'model',
      header: 'Model & Eligible Sessions',
      render: (p) => (
        <div className="text-xs space-y-0.5">
          <p className="font-medium">
            {p.salaryModel === 'fixed_monthly' ? 'Fixed Monthly' : 'Per-Session'} ({formatInrFromPaise(p.ratePaise)})
          </p>
          <p className="font-mono text-[#687086] dark:text-[#A6B0C3] tabular-nums">
            {p.eligibleSessionIds.length} submitted non-cancelled session(s)
          </p>
          {p.requiresAdminReview && (
            <StatusText tone="warning" label="Admin Review Required" />
          )}
        </div>
      ),
    },
    {
      key: 'payable',
      header: 'Payable',
      align: 'right',
      render: (p) => formatInrFromPaise(p.payableAmountPaise),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      render: (p) => (
        <span className="text-[#168A62] dark:text-[#22C58B] font-semibold">
          {formatInrFromPaise(p.paidAmountPaise)}
        </span>
      ),
    },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'right',
      render: (p) => (
        <span className="font-semibold">{formatInrFromPaise(p.remainingAmountPaise)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => {
        const meta = SALARY_STATUS_META[p.status];
        return <StatusText tone={meta.tone} label={meta.label} />;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (p) => (
        <div className="inline-flex flex-wrap justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setInspectPeriod(p)}
            iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            Sessions
          </Button>
          {p.requiresAdminReview && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFormError(null);
                setApprovedPayableRupees(String(paiseToRupees(p.payableAmountPaise)));
                setReviewReason('');
                setReviewTarget(p);
              }}
              iconLeft={<CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Resolve Review
            </Button>
          )}
          {p.status !== 'on_hold' && p.remainingAmountPaise > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setFormError(null);
                setPayAmountRupees(String(paiseToRupees(p.remainingAmountPaise)));
                setPayDate(new Date().toISOString().slice(0, 10));
                setPayReference('');
                setPayNote('');
                setPayPeriodTarget(p);
              }}
              iconLeft={<Banknote className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Pay
            </Button>
          )}
          {p.status !== 'paid' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFormError(null);
                setHoldReason('');
                setHoldTarget(p);
              }}
              iconLeft={
                p.status === 'on_hold' ? (
                  <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                )
              }
            >
              {p.status === 'on_hold' ? 'Resume' : 'Hold'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const paymentColumns: TableColumn<TeacherSalaryPayment>[] = [
    {
      key: 'id',
      header: 'Payment ID',
      render: (r) => (
        <div>
          <p className="font-mono font-semibold text-xs">{r.id}</p>
          <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
            {r.teacherId} · {r.period}
          </p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Payment Date & Ref',
      render: (r) => (
        <div className="text-xs">
          <p className="font-mono tabular-nums">{formatShortDate(r.paymentDate)}</p>
          <p className="font-mono text-[#687086] dark:text-[#A6B0C3]">
            {r.paymentReference ?? 'No external ref'}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Paid Amount',
      align: 'right',
      render: (r) => (
        <span className="font-semibold text-[#168A62] dark:text-[#22C58B]">
          {formatInrFromPaise(r.amountPaise)}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Note / Audit',
      render: (r) => (
        <div className="text-xs text-[#687086] dark:text-[#A6B0C3]">
          <p>{r.note ?? '—'}</p>
          {r.corrected && (
            <StatusText tone="warning" label={`Corrected: ${r.correctionReason ?? ''}`} />
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Edit',
      align: 'right',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFormError(null);
            setCorrectedPayAmount(String(paiseToRupees(r.amountPaise)));
            setCorrectPayReason('');
            setCorrectPayTarget(r);
          }}
          iconLeft={<Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
        >
          Correct
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

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Configure Teacher Salary */}
        <Card
          title="Configure Teacher Salary Structure"
          subtitle="Assign Fixed Monthly or Per-Session rate per teacher. Historical salary periods remain preserved."
          className="lg:col-span-3"
        >
          <form onSubmit={handleSaveSalaryConfig} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="salary-teacher-select"
                  className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]"
                >
                  Select Teacher
                </label>
                <select
                  id="salary-teacher-select"
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] border border-[#E5E7EF] dark:border-[#303A55]"
                >
                  {summaries.map((s) => (
                    <option key={s.teacherId} value={s.teacherId}>
                      {s.teacherName} ({s.teacherId})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="salary-model-select"
                  className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]"
                >
                  Salary Model
                </label>
                <select
                  id="salary-model-select"
                  value={salaryModel}
                  onChange={(e) => setSalaryModel(e.target.value as TeacherSalaryModel)}
                  className="w-full min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] border border-[#E5E7EF] dark:border-[#303A55]"
                >
                  <option value="fixed_monthly">Fixed Monthly Salary</option>
                  <option value="per_session">Per-Session / Per-Class Salary</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {salaryModel === 'fixed_monthly' ? (
                <Input
                  label="Fixed Monthly Amount (INR)"
                  type="number"
                  min="1"
                  step="0.01"
                  value={monthlyAmountRupees}
                  onChange={(e) => setMonthlyAmountRupees(e.target.value)}
                  required
                />
              ) : (
                <Input
                  label="Per-Session Rate (INR)"
                  type="number"
                  min="1"
                  step="0.01"
                  value={perSessionAmountRupees}
                  onChange={(e) => setPerSessionAmountRupees(e.target.value)}
                  required
                />
              )}
              <Input
                label="Effective From"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              loading={submitting}
              iconLeft={<UserCog className="w-4 h-4" aria-hidden="true" />}
            >
              Save Teacher Salary Configuration
            </Button>
          </form>
        </Card>

        {/* Generate Monthly Salary Periods */}
        <Card
          title="Calculate Monthly Salary Periods"
          subtitle="Per-session pay counts only unique submitted or corrected non-cancelled attendance sessions."
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            <Input
              label="Target Salary Month (YYYY-MM)"
              value={generateMonth}
              onChange={(e) => setGenerateMonth(e.target.value)}
              placeholder="2026-11"
              hint="If a per-session teacher has zero submitted sessions, the period is flagged for Admin review."
            />
            <Button
              variant="secondary"
              className="w-full"
              loading={submitting}
              onClick={handleGenerateSalaryPeriods}
              iconLeft={<CalendarPlus className="w-4 h-4" aria-hidden="true" />}
            >
              Generate / Recalculate Month
            </Button>
            <Input
              label="Filter Table by Month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              placeholder="All months (or type e.g. 2026-11)"
            />
          </div>
        </Card>
      </div>

      {/* Salary Periods Table */}
      <Card
        title={`Monthly Teacher Salary Periods (${allPeriods.length})`}
        subtitle="Track payable amounts, partial/full payouts, hold statuses, and eligible session reviews."
      >
        <Table
          columns={periodColumns}
          rows={allPeriods}
          rowKey={(p) => p.id}
          emptyTitle="No teacher salary periods generated"
          emptyDescription="Save a teacher salary configuration and click Generate Month."
          mobileCardRender={(p) => {
            const meta = SALARY_STATUS_META[p.status];
            return (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{p.teacherName}</p>
                    <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {p.periodLabel} · {p.salaryModel === 'fixed_monthly' ? 'Fixed Monthly' : 'Per-Session'}
                    </p>
                  </div>
                  <StatusText tone={meta.tone} label={meta.label} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                  <div>
                    <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Payable</span>
                    <span>{formatInrFromPaise(p.payableAmountPaise)}</span>
                  </div>
                  <div>
                    <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Paid</span>
                    <span className="text-[#168A62] dark:text-[#22C58B]">
                      {formatInrFromPaise(p.paidAmountPaise)}
                    </span>
                  </div>
                  <div>
                    <span className="block font-sans text-[#687086] dark:text-[#A6B0C3]">Remaining</span>
                    <span className="font-bold">{formatInrFromPaise(p.remainingAmountPaise)}</span>
                  </div>
                </div>
                {p.requiresAdminReview && (
                  <StatusText tone="warning" label="Admin Review Required" />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setInspectPeriod(p)}
                  >
                    Sessions ({p.eligibleSessionIds.length})
                  </Button>
                  {p.status !== 'on_hold' && p.remainingAmountPaise > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setPayAmountRupees(String(paiseToRupees(p.remainingAmountPaise)));
                        setPayPeriodTarget(p);
                      }}
                    >
                      Pay
                    </Button>
                  )}
                </div>
              </div>
            );
          }}
        />
      </Card>

      {/* Recorded Salary Payments */}
      <Card
        title={`Recorded Salary Payments (${allPayments.length})`}
        subtitle="All disbursements recorded by Admin, supporting partial payouts and audited corrections."
      >
        <Table
          columns={paymentColumns}
          rows={allPayments}
          rowKey={(r) => r.id}
          emptyTitle="No salary payments recorded yet"
          mobileCardRender={(r) => (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="font-mono font-semibold">{r.id} · {r.teacherId}</span>
                <span className="font-mono font-bold text-[#168A62] dark:text-[#22C58B]">
                  {formatInrFromPaise(r.amountPaise)}
                </span>
              </div>
              <p className="text-[#687086] dark:text-[#A6B0C3]">
                {r.period} · Paid {formatShortDate(r.paymentDate)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCorrectedPayAmount(String(paiseToRupees(r.amountPaise)));
                  setCorrectPayTarget(r);
                }}
              >
                Audited Correction
              </Button>
            </div>
          )}
        />
      </Card>

      {/* Record Salary Payment Modal */}
      <Modal
        open={Boolean(payPeriodTarget)}
        onClose={() => setPayPeriodTarget(null)}
        title={
          payPeriodTarget
            ? `Record Salary Payment · ${payPeriodTarget.teacherName}`
            : 'Record Salary Payment'
        }
        subtitle="Supports partial or full payout up to remaining payable salary."
      >
        {payPeriodTarget && (
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426] p-3.5 text-xs space-y-1 font-mono tabular-nums">
              <p>Period: {payPeriodTarget.periodLabel}</p>
              <p>Total Payable: {formatInrFromPaise(payPeriodTarget.payableAmountPaise)}</p>
              <p>Already Paid: {formatInrFromPaise(payPeriodTarget.paidAmountPaise)}</p>
              <p className="font-bold">
                Remaining Balance: {formatInrFromPaise(payPeriodTarget.remainingAmountPaise)}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Payment Amount (INR)"
                type="number"
                min="1"
                step="0.01"
                value={payAmountRupees}
                onChange={(e) => setPayAmountRupees(e.target.value)}
                required
              />
              <Input
                label="Payment Date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                required
              />
            </div>
            <Input
              label="Transfer / Reference ID (Optional)"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="e.g. NEFT-SAL-202611-01"
            />
            <Input
              label="Payout Note (Optional)"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="e.g. Monthly salary transfer"
            />
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setPayPeriodTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Record Salary Payment
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Hold / Resume Modal */}
      <Modal
        open={Boolean(holdTarget)}
        onClose={() => setHoldTarget(null)}
        title={
          holdTarget?.status === 'on_hold'
            ? 'Resume Teacher Salary Period'
            : 'Place Salary Period On Hold'
        }
        subtitle="Audit reason is required for hold status transitions."
      >
        {holdTarget && (
          <form onSubmit={handleToggleHold} className="space-y-4">
            <Input
              label="Reason (Mandatory, min 5 characters)"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="e.g. Pending verification of extra batch attendance"
              required
            />
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setHoldTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Confirm Status Change
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Resolve Review Modal */}
      <Modal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title="Resolve Admin Salary Review"
        subtitle="Confirm verified payable amount after checking attendance records."
      >
        {reviewTarget && (
          <form onSubmit={handleResolveReview} className="space-y-4">
            {reviewTarget.reviewReason && (
              <div className="rounded-xl border border-[#B7791F]/35 bg-[#B7791F]/10 p-3 text-xs text-[#B7791F] dark:text-[#F5B942] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{reviewTarget.reviewReason}</span>
              </div>
            )}
            <Input
              label="Approved Payable Amount (INR)"
              type="number"
              min="0"
              step="0.01"
              value={approvedPayableRupees}
              onChange={(e) => setApprovedPayableRupees(e.target.value)}
              required
            />
            <Input
              label="Review Resolution Reason (Mandatory)"
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
              placeholder="e.g. Confirmed session log with teacher"
              required
            />
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setReviewTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Approve & Clear Review Flag
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Correct Salary Payment Modal */}
      <Modal
        open={Boolean(correctPayTarget)}
        onClose={() => setCorrectPayTarget(null)}
        title="Audited Salary Payment Correction"
        subtitle="Logs previous amount, new amount, actor ID, and mandatory reason."
      >
        {correctPayTarget && (
          <form onSubmit={handleCorrectPayment} className="space-y-4">
            <Input
              label="Corrected Paid Amount (INR)"
              type="number"
              min="1"
              step="0.01"
              value={correctedPayAmount}
              onChange={(e) => setCorrectedPayAmount(e.target.value)}
              required
            />
            <Input
              label="Correction Reason (Mandatory)"
              value={correctPayReason}
              onChange={(e) => setCorrectPayReason(e.target.value)}
              placeholder="e.g. Corrected bank transfer value"
              required
            />
            <div className="flex justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setCorrectPayTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                Save Correction
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Inspect Eligible Sessions Modal */}
      <Modal
        open={Boolean(inspectPeriod)}
        onClose={() => setInspectPeriod(null)}
        title={
          inspectPeriod
            ? `Eligible Sessions · ${inspectPeriod.teacherName} (${inspectPeriod.periodLabel})`
            : 'Eligible Sessions'
        }
        subtitle="Unique submitted or corrected non-cancelled attendance sessions counted for this period."
        maxWidthClass="max-w-2xl"
      >
        {inspectPeriod && (
          <div className="space-y-3 text-xs">
            {inspectPeriod.requiresAdminReview && inspectPeriod.reviewReason && (
              <div className="rounded-xl border border-[#B7791F]/35 bg-[#B7791F]/10 p-3 text-[#B7791F] dark:text-[#F5B942]">
                {inspectPeriod.reviewReason}
              </div>
            )}
            {inspectPeriod.eligibleSessionsSummary.length === 0 ? (
              <p className="text-[#687086] dark:text-[#A6B0C3]">
                No eligible submitted attendance sessions found for {inspectPeriod.periodLabel}.
              </p>
            ) : (
              <div className="space-y-2">
                {inspectPeriod.eligibleSessionsSummary.map((s) => (
                  <div
                    key={s.sessionId}
                    className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        {s.className} · {s.batchName} ({s.subjectName})
                      </p>
                      <p className="font-mono text-[#687086] dark:text-[#A6B0C3]">
                        {s.sessionId} · {formatShortDate(s.sessionDate)} · {s.sessionType}
                      </p>
                    </div>
                    <StatusText tone="nominal" label="Eligible" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
