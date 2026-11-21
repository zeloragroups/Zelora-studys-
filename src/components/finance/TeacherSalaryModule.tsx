import { useCallback, useEffect, useState } from 'react';
import { Banknote, CalendarCheck2, CheckCircle2, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isFirebaseConnectedMode, salaryService } from '../../services';
import type {
  TeacherSalaryPayment,
  TeacherSalaryPeriod,
  TeacherSalaryPeriodStatus,
  TeacherSalarySummaryView,
} from '../../types';
import { formatInrFromPaise } from '../../utils/currency';
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

const SALARY_STATUS_META: Record<
  TeacherSalaryPeriodStatus,
  { tone: SemanticTone; label: string }
> = {
  paid: { tone: 'nominal', label: 'Paid' },
  partially_paid: { tone: 'warning', label: 'Partially Paid' },
  pending: { tone: 'neutral', label: 'Pending' },
  on_hold: { tone: 'danger', label: 'On Hold' },
};

export function TeacherSalaryModule() {
  const { principal } = useAuth();
  const [summary, setSummary] = useState<TeacherSalarySummaryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSalary = useCallback(async () => {
    if (!principal || principal.role !== 'teacher') {
      setError('Teacher authentication is required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await salaryService.getMyTeacherSalaryOverview(principal);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load salary summary.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadSalary();
  }, [loadSalary]);

  if (!principal || principal.role !== 'teacher') {
    return (
      <Card title="Access Restricted">
        <p className="text-sm text-[var(--error)]">
          Only authenticated Teachers can view their own salary schedule and payment records.
        </p>
      </Card>
    );
  }

  const totalEarnedPaise =
    summary?.periods.reduce((acc, p) => acc + p.payableAmountPaise, 0) ?? 0;
  const totalPaidPaise =
    summary?.periods.reduce((acc, p) => acc + p.paidAmountPaise, 0) ?? 0;
  const totalPendingPaise =
    summary?.periods.reduce((acc, p) => acc + p.remainingAmountPaise, 0) ?? 0;

  const periodColumns: TableColumn<TeacherSalaryPeriod>[] = [
    {
      key: 'period',
      header: 'Salary Period',
      render: (p) => (
        <div>
          <p className="font-semibold text-[var(--text-primary)]">{p.periodLabel}</p>
          <p className="font-mono text-xs text-[var(--text-muted)]">{p.period}</p>
        </div>
      ),
    },
    {
      key: 'sessions',
      header: 'Salary Model & Sessions',
      render: (p) => (
        <div className="text-xs space-y-0.5">
          <p className="font-medium">
            {p.salaryModel === 'fixed_monthly' ? 'Fixed Monthly' : 'Per-Session'} ({formatInrFromPaise(p.ratePaise)})
          </p>
          <p className="font-mono text-[var(--text-muted)] tabular-nums">
            {p.eligibleSessionIds.length} eligible session(s)
          </p>
          {p.requiresAdminReview && (
            <StatusText tone="warning" label="Under Admin Review" />
          )}
        </div>
      ),
    },
    {
      key: 'payable',
      header: 'Payable',
      align: 'right',
      render: (p) => (
        <span className="font-mono tabular-nums">
          {formatInrFromPaise(p.payableAmountPaise)}
        </span>
      ),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      render: (p) => (
        <span className="font-mono tabular-nums text-[var(--accent-text)] font-semibold">
          {formatInrFromPaise(p.paidAmountPaise)}
        </span>
      ),
    },
    {
      key: 'remaining',
      header: 'Pending',
      align: 'right',
      render: (p) => (
        <span className="font-mono tabular-nums font-semibold">
          {formatInrFromPaise(p.remainingAmountPaise)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => {
        const meta = SALARY_STATUS_META[p.status];
        return (
          <div className="space-y-0.5">
            <StatusText tone={meta.tone} label={meta.label} />
            {p.holdReason && (
              <p className="text-[11px] text-[var(--error)]">{p.holdReason}</p>
            )}
          </div>
        );
      },
    },
  ];

  const paymentColumns: TableColumn<TeacherSalaryPayment>[] = [
    {
      key: 'period',
      header: 'Salary Period',
      render: (r) => (
        <span className="font-mono text-xs font-semibold">{r.period}</span>
      ),
    },
    {
      key: 'date',
      header: 'Payment Date',
      render: (r) => (
        <span className="font-mono text-xs tabular-nums">{formatShortDate(r.paymentDate)}</span>
      ),
    },
    {
      key: 'ref',
      header: 'Transfer Reference & Note',
      render: (r) => (
        <div className="text-xs">
          <p className="font-mono">{r.paymentReference ?? '—'}</p>
          {r.note && <p className="text-[var(--text-muted)]">{r.note}</p>}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Amount Received',
      align: 'right',
      render: (r) => (
        <span className="font-semibold text-[var(--accent-text)]">
          {formatInrFromPaise(r.amountPaise)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Teacher Payroll Read-Only View · ${principal.loginId} (${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo Mode'})`}
        title="My Salary & Payment History"
        subtitle="Inspect your active salary structure, monthly calculated pay periods, eligible sessions, and recorded payouts."
        rightSlot={<StatusText tone="nominal" label="Read-Only Personal Record" />}
      />

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-28 rounded-2xl bg-[var(--surface-secondary)] animate-pulse"
            />
          ))}
        </div>
      ) : (
        summary && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Salary Structure"
                value={
                  summary.activeConfig
                    ? formatInrFromPaise(
                        summary.activeConfig.salaryModel === 'fixed_monthly'
                          ? summary.activeConfig.monthlyAmountPaise ?? 0
                          : summary.activeConfig.perSessionAmountPaise ?? 0
                      )
                    : 'Not Set'
                }
                caption={
                  summary.activeConfig
                    ? summary.activeConfig.salaryModel === 'fixed_monthly'
                      ? 'Fixed Monthly'
                      : 'Per Teaching Session'
                    : 'Awaiting Admin configuration'
                }
                icon={<Banknote className="w-4 h-4" />}
                tone="mint"
              />
              <StatTile
                label="Total Payable (Recorded)"
                value={formatInrFromPaise(totalEarnedPaise)}
                caption={`${summary.periods.length} salary period(s)`}
                icon={<CalendarCheck2 className="w-4 h-4" />}
              />
              <StatTile
                label="Total Salary Paid"
                value={formatInrFromPaise(totalPaidPaise)}
                caption={`${summary.payments.length} recorded payout(s)`}
                icon={<CheckCircle2 className="w-4 h-4" />}
              />
              <StatTile
                label="Remaining Pending"
                value={formatInrFromPaise(totalPendingPaise)}
                caption="Balance awaiting Admin payout"
                icon={<Clock className="w-4 h-4" />}
              />
            </div>

            <Card
              title={`Monthly Salary Periods (${summary.periods.length})`}
              subtitle="Payable amounts and status as maintained by Centre Administration."
            >
              <Table
                columns={periodColumns}
                rows={summary.periods}
                rowKey={(p) => p.id}
                emptyTitle="No salary periods recorded yet"
                emptyDescription="Monthly salary periods appear once generated by Administration."
                mobileCardRender={(p) => {
                  const meta = SALARY_STATUS_META[p.status];
                  return (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{p.periodLabel}</p>
                          <p className="text-[var(--text-muted)]">
                            {p.eligibleSessionIds.length} eligible session(s)
                          </p>
                        </div>
                        <StatusText tone={meta.tone} label={meta.label} />
                      </div>
                      <p className="font-mono tabular-nums">
                        Payable {formatInrFromPaise(p.payableAmountPaise)} · Paid{' '}
                        {formatInrFromPaise(p.paidAmountPaise)} · Pending{' '}
                        {formatInrFromPaise(p.remainingAmountPaise)}
                      </p>
                    </div>
                  );
                }}
              />
            </Card>

            <Card
              title={`Salary Payment History (${summary.payments.length})`}
              subtitle="Recorded payouts transferred by Centre Administration."
            >
              <Table
                columns={paymentColumns}
                rows={summary.payments}
                rowKey={(r) => r.id}
                emptyTitle="No salary payments recorded yet"
                mobileCardRender={(r) => (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span className="font-mono">{r.period}</span>
                      <span className="font-mono text-[var(--accent-text)]">
                        {formatInrFromPaise(r.amountPaise)}
                      </span>
                    </div>
                    <p className="font-mono text-[var(--text-muted)]">
                      {formatShortDate(r.paymentDate)} · {r.paymentReference ?? 'No reference'}
                    </p>
                  </div>
                )}
              />
            </Card>
          </>
        )
      )}
    </div>
  );
}
