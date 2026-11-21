import { useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Clock,
  Download,
  FileBarChart2,
  History,
  Printer,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useInterface } from '../../context/InterfaceContext';
import type {
  AccountRecord,
  AdminFinancialDashboardData,
  BatchRecord,
  ClassRecord,
  FinancialAuditEntityType,
  FinancialAuditEntry,
  FinancialReportFilter,
  FinancialReportSummary,
  PaymentVerificationAudit,
  StudentFeeReportRow,
  TeacherSalaryReportRow,
} from '../../types';
import { formatInrFromPaise, paiseToUpiAmountString } from '../../utils/currency';
import { formatShortDate } from '../../utils/formatters';
import { BrandLogoMark } from '../ui/BrandLogoMark';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Select } from '../ui/Select';
import { StatTile } from '../ui/StatTile';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { ComparisonBarChart, DistributionDonutChart } from '../charts/AnalyticsCharts';

interface AdminReportsAuditPanelProps {
  mode: 'overview' | 'reports' | 'audit';
  dashboard: AdminFinancialDashboardData | null;
  reportSummary: FinancialReportSummary | null;
  reportFilter: FinancialReportFilter;
  onChangeReportFilter: (next: FinancialReportFilter) => void;
  financialAudit: FinancialAuditEntry[];
  paymentVerificationAudit: PaymentVerificationAudit[];
  classes: ClassRecord[];
  batches: BatchRecord[];
  teachers: AccountRecord[];
  onQuickNavigateTab: (tabId: string) => void;
}

export function AdminReportsAuditPanel({
  mode,
  dashboard,
  reportSummary,
  reportFilter,
  onChangeReportFilter,
  financialAudit,
  paymentVerificationAudit,
  classes,
  batches,
  teachers,
  onQuickNavigateTab,
}: AdminReportsAuditPanelProps) {
  const { publicSettings } = useInterface();
  const [auditFilter, setAuditFilter] = useState<'all' | FinancialAuditEntityType>('all');
  const { centreProfile, applicationBranding, academicDefaults } = publicSettings;
  const centreContactSummary = [
    centreProfile.contactNumber,
    centreProfile.publicEmail,
    centreProfile.city,
  ]
    .filter((v) => v && v.trim().length > 0)
    .join(' · ');

  const exportCsv = () => {
    if (!reportSummary) return;
    const escapeCell = (val: string | number) =>
      `"${String(val).replace(/"/g, '""')}"`;

    const lines: string[] = [
      ['Report Period', reportSummary.periodTitle].map(escapeCell).join(','),
      [
        'Total Expected Fees (INR)',
        paiseToUpiAmountString(reportSummary.feeSummary.totalExpectedPaise),
      ]
        .map(escapeCell)
        .join(','),
      [
        'Total Verified Collections (INR)',
        paiseToUpiAmountString(reportSummary.feeSummary.totalVerifiedCollectionsPaise),
      ]
        .map(escapeCell)
        .join(','),
      [
        'Pending Verification Claims (INR, NOT Verified)',
        paiseToUpiAmountString(reportSummary.feeSummary.pendingVerificationPaise),
      ]
        .map(escapeCell)
        .join(','),
      [
        'Total Outstanding Fees (INR)',
        paiseToUpiAmountString(reportSummary.feeSummary.totalOutstandingPaise),
      ]
        .map(escapeCell)
        .join(','),
      [
        'Total Teacher Salary Paid (INR)',
        paiseToUpiAmountString(reportSummary.salarySummary.totalSalaryPaidPaise),
      ]
        .map(escapeCell)
        .join(','),
      [
        'Net Recorded Balance (Verified Collections - Salary Paid)',
        paiseToUpiAmountString(reportSummary.netRecordedBalancePaise),
      ]
        .map(escapeCell)
        .join(','),
      '',
      [
        'Section',
        'ID',
        'Name',
        'Class / Model',
        'Batch',
        'Period',
        'Expected / Payable (INR)',
        'Verified Paid (INR)',
        'Pending Claims (INR)',
        'Remaining / Outstanding (INR)',
        'Status',
      ]
        .map(escapeCell)
        .join(','),
    ];

    for (const s of reportSummary.feeSummary.studentRows) {
      lines.push(
        [
          'Student Fee',
          s.studentId,
          s.studentName,
          s.className,
          s.batchName,
          s.feePeriod,
          paiseToUpiAmountString(s.expectedPaise),
          paiseToUpiAmountString(s.verifiedPaidPaise),
          paiseToUpiAmountString(s.pendingClaimsPaise),
          paiseToUpiAmountString(s.outstandingPaise),
          s.status,
        ]
          .map(escapeCell)
          .join(',')
      );
    }

    for (const t of reportSummary.salarySummary.teacherRows) {
      lines.push(
        [
          'Teacher Salary',
          t.teacherId,
          t.teacherName,
          t.salaryModel,
          '-',
          t.period,
          paiseToUpiAmountString(t.payablePaise),
          paiseToUpiAmountString(t.paidPaise),
          '0.00',
          paiseToUpiAmountString(t.remainingPaise),
          t.status,
        ]
          .map(escapeCell)
          .join(',')
      );
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tuition-financial-report-${reportFilter.granularity}-${reportFilter.month || reportFilter.year || 'summary'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const studentReportColumns: TableColumn<StudentFeeReportRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div>
          <p className="font-semibold text-[var(--text-primary)]">{r.studentName}</p>
          <p className="font-mono text-xs text-[var(--text-muted)]">
            {r.studentId} · {r.className} ({r.batchName})
          </p>
        </div>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      render: (r) => <span className="font-mono text-xs">{r.feePeriod}</span>,
    },
    {
      key: 'expected',
      header: 'Expected',
      align: 'right',
      render: (r) => formatInrFromPaise(r.expectedPaise),
    },
    {
      key: 'verified',
      header: 'Verified Paid',
      align: 'right',
      render: (r) => (
        <span className="text-[var(--accent-text)] font-semibold">
          {formatInrFromPaise(r.verifiedPaidPaise)}
        </span>
      ),
    },
    {
      key: 'pending',
      header: 'Pending Claims',
      align: 'right',
      render: (r) => (
        <span className="text-[var(--warning)]">
          {formatInrFromPaise(r.pendingClaimsPaise)}
        </span>
      ),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      render: (r) => formatInrFromPaise(r.outstandingPaise),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const tone: SemanticTone =
          r.status === 'paid'
            ? 'nominal'
            : r.status === 'overdue'
              ? 'danger'
              : r.status === 'unpaid'
                ? 'neutral'
                : 'warning';
        return <StatusText tone={tone} label={r.status.replace('_', ' ')} />;
      },
    },
  ];

  const salaryReportColumns: TableColumn<TeacherSalaryReportRow>[] = [
    {
      key: 'teacher',
      header: 'Teacher',
      render: (r) => (
        <div>
          <p className="font-semibold text-[var(--text-primary)]">{r.teacherName}</p>
          <p className="font-mono text-xs text-[var(--text-muted)]">
            {r.teacherId} · {r.period}
          </p>
        </div>
      ),
    },
    {
      key: 'model',
      header: 'Model',
      render: (r) => (
        <span className="text-xs">
          {r.salaryModel === 'fixed_monthly' ? 'Fixed Monthly' : 'Per-Session'}
        </span>
      ),
    },
    {
      key: 'payable',
      header: 'Payable',
      align: 'right',
      render: (r) => formatInrFromPaise(r.payablePaise),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      render: (r) => (
        <span className="text-[var(--accent-text)] font-semibold">
          {formatInrFromPaise(r.paidPaise)}
        </span>
      ),
    },
    {
      key: 'remaining',
      header: 'Pending',
      align: 'right',
      render: (r) => formatInrFromPaise(r.remainingPaise),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <StatusText
          tone={r.status === 'paid' ? 'nominal' : r.status === 'on_hold' ? 'danger' : 'warning'}
          label={r.status.replace('_', ' ')}
        />
      ),
    },
  ];

  const filteredFinancialAudit =
    auditFilter === 'all'
      ? financialAudit
      : financialAudit.filter((e) => e.entityType === auditFilter);

  const financialAuditColumns: TableColumn<FinancialAuditEntry>[] = [
    {
      key: 'time',
      header: 'Timestamp & Actor',
      render: (r) => (
        <div className="text-xs">
          <p className="font-mono tabular-nums">{formatShortDate(r.timestamp)}</p>
          <p className="font-mono text-[var(--text-muted)]">Actor: {r.actorId}</p>
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Entity & Action',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[var(--text-primary)]">
            {r.entityType.replace('_', ' ')} · {r.action}
          </p>
          <p className="font-mono text-[var(--text-muted)]">ID: {r.entityId}</p>
        </div>
      ),
    },
    {
      key: 'changes',
      header: 'Previous / New & Reason',
      render: (r) => (
        <div className="text-xs space-y-0.5">
          {r.previousValues && (
            <p className="text-[var(--text-muted)]">From: {r.previousValues}</p>
          )}
          {r.newValues && <p className="text-[var(--text-primary)]">To: {r.newValues}</p>}
          {r.reason && (
            <p className="text-[var(--accent-text)]">Reason: {r.reason}</p>
          )}
        </div>
      ),
    },
  ];

  const verificationAuditColumns: TableColumn<PaymentVerificationAudit>[] = [
    {
      key: 'time',
      header: 'Timestamp & Actor',
      render: (r) => (
        <div className="text-xs font-mono">
          <p>{formatShortDate(r.timestamp)}</p>
          <p className="text-[var(--text-muted)]">{r.actorId}</p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Claim & Action',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold">{r.action.replace('_', ' ')}</p>
          <p className="font-mono text-[var(--text-muted)]">{r.paymentClaimId}</p>
        </div>
      ),
    },
    {
      key: 'detail',
      header: 'Audit Detail',
      render: (r) => (
        <div className="text-xs space-y-0.5">
          {r.newValues && <p>{r.newValues}</p>}
          {r.reason && <p className="text-[var(--error)]">Reason: {r.reason}</p>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. OVERVIEW DASHBOARD */}
      {mode === 'overview' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              label="Verified Collections"
              value={formatInrFromPaise(dashboard.totalVerifiedCollectionsPaise)}
              caption={`${dashboard.verifiedPaymentsCount} verified payment(s) total`}
              icon={<ShieldCheck className="w-4 h-4" />}
              accent
            />
            <StatTile
              label="Pending Verification Claims"
              value={formatInrFromPaise(dashboard.pendingPaymentClaimsPaise)}
              caption={`${dashboard.pendingPaymentClaimsCount} unverified claim(s) awaiting review`}
              icon={<Clock className="w-4 h-4" />}
            />
            <StatTile
              label="Outstanding Student Fees"
              value={formatInrFromPaise(dashboard.totalOutstandingStudentFeesPaise)}
              caption="Unpaid, partial, and overdue balances"
              icon={<AlertCircle className="w-4 h-4" />}
            />
            <StatTile
              label="Net Recorded Balance"
              value={formatInrFromPaise(dashboard.netRecordedBalancePaise)}
              caption="Verified Collections − Salary Paid"
              icon={<TrendingUp className="w-4 h-4" />}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="Fee Collections & Structure"
              subtitle="Strictly separates verified cash receipts from unverified student payment claims."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onQuickNavigateTab('verification_queue')}
                >
                  Open Verification Queue
                </Button>
              }
            >
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Current Period ({dashboard.currentPeriod}) Verified</span>
                  <span className="font-mono font-semibold text-[var(--accent-text)] tabular-nums">
                    {formatInrFromPaise(dashboard.currentMonthCollectionsPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Current Year ({dashboard.currentYear}) Verified</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatInrFromPaise(dashboard.currentYearCollectionsPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Rejected Claims ({dashboard.rejectedClaimsCount})</span>
                  <span className="font-mono text-[var(--error)] tabular-nums">
                    {formatInrFromPaise(dashboard.rejectedClaimsPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[var(--text-muted)]">Active Fee Template</span>
                  <span className="font-mono font-semibold">
                    {dashboard.activeFeeConfig
                      ? `${formatInrFromPaise(dashboard.activeFeeConfig.amountPaise)} / ${dashboard.activeFeeConfig.frequency}`
                      : 'Not configured'}
                  </span>
                </div>
              </div>
            </Card>

            <Card
              title="Teacher Salary Snapshot"
              subtitle="Recorded payouts against monthly fixed and per-session calculated payables."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onQuickNavigateTab('salaries')}
                >
                  Manage Salaries
                </Button>
              }
            >
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Total Salary Payable</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatInrFromPaise(dashboard.totalTeacherSalaryPayablePaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Total Salary Paid</span>
                  <span className="font-mono font-semibold text-[var(--accent-text)] tabular-nums">
                    {formatInrFromPaise(dashboard.totalTeacherSalaryPaidPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--border)]">
                  <span className="text-[var(--text-muted)]">Pending Teacher Salary</span>
                  <span className="font-mono font-semibold text-[var(--warning)] tabular-nums">
                    {formatInrFromPaise(dashboard.pendingTeacherSalaryPaise)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[var(--text-muted)]">Active UPI ID</span>
                  <span className="font-mono text-xs">
                    {dashboard.upiConfig?.status === 'active'
                      ? dashboard.upiConfig.upiId
                      : 'Inactive'}
                  </span>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title="Fee Collections & Receivables Mix"
              subtitle="Verified collections compared with unverified claims and outstanding student fees."
            >
              <DistributionDonutChart
                centerLabel="Verified"
                centerValue={formatInrFromPaise(dashboard.totalVerifiedCollectionsPaise)}
                emptyTitle="No fee ledger amounts recorded yet"
                emptyDescription="Generate period fee accounts or verify student payment claims to visualize collections."
                segments={[
                  {
                    id: 'verified',
                    label: 'Verified Collections',
                    value: dashboard.totalVerifiedCollectionsPaise,
                    displayValue: formatInrFromPaise(dashboard.totalVerifiedCollectionsPaise),
                    colorLight: 'var(--accent)',
                    colorDark: 'var(--accent)',
                  },
                  {
                    id: 'pending',
                    label: 'Pending Verification Claims',
                    value: dashboard.pendingPaymentClaimsPaise,
                    displayValue: formatInrFromPaise(dashboard.pendingPaymentClaimsPaise),
                    colorLight: 'var(--warning)',
                    colorDark: 'var(--warning)',
                  },
                  {
                    id: 'outstanding',
                    label: 'Outstanding Student Fees',
                    value: dashboard.totalOutstandingStudentFeesPaise,
                    displayValue: formatInrFromPaise(dashboard.totalOutstandingStudentFeesPaise),
                    colorLight: 'var(--text-secondary)',
                    colorDark: 'var(--text-secondary)',
                  },
                ]}
              />
            </Card>

            <Card
              title="Payroll & Collections Position"
              subtitle="Recorded salary disbursements relative to total payable and verified fee collections."
            >
              <ComparisonBarChart
                ariaLabel="Payroll and collections position"
                emptyTitle="No salary or fee records yet"
                emptyDescription="Comparative bars appear once student fees or teacher salaries are recorded."
                data={
                  dashboard.totalTeacherSalaryPayablePaise > 0 ||
                  dashboard.totalVerifiedCollectionsPaise > 0
                    ? [
                        {
                          id: 'collections',
                          label: 'Verified Fee Collections',
                          value: dashboard.totalVerifiedCollectionsPaise,
                          maxValue: Math.max(
                            dashboard.totalVerifiedCollectionsPaise,
                            dashboard.totalTeacherSalaryPayablePaise,
                            1
                          ),
                          displayValue: formatInrFromPaise(
                            dashboard.totalVerifiedCollectionsPaise
                          ),
                          tone: 'mint',
                        },
                        {
                          id: 'salary-paid',
                          label: 'Teacher Salary Paid',
                          value: dashboard.totalTeacherSalaryPaidPaise,
                          maxValue: Math.max(
                            dashboard.totalVerifiedCollectionsPaise,
                            dashboard.totalTeacherSalaryPayablePaise,
                            1
                          ),
                          displayValue: formatInrFromPaise(dashboard.totalTeacherSalaryPaidPaise),
                          tone: 'charcoal',
                        },
                        {
                          id: 'salary-pending',
                          label: 'Pending Teacher Salary',
                          value: dashboard.pendingTeacherSalaryPaise,
                          maxValue: Math.max(
                            dashboard.totalVerifiedCollectionsPaise,
                            dashboard.totalTeacherSalaryPayablePaise,
                            1
                          ),
                          displayValue: formatInrFromPaise(dashboard.pendingTeacherSalaryPaise),
                          tone: 'warning',
                        },
                      ]
                    : []
                }
              />
            </Card>
          </div>
        </div>
      )}

      {/* 2. MONTHLY / YEARLY FINANCIAL REPORTS */}
      {mode === 'reports' && (
        <div className="space-y-6">
          <Card
            title="Report Filters & Export"
            subtitle="Filter monthly or yearly financial summaries across date range, class, batch, or teacher."
            className="no-print"
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={exportCsv}
                  disabled={!reportSummary}
                  iconLeft={<Download className="w-4 h-4" aria-hidden="true" />}
                >
                  Export CSV
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.print()}
                  iconLeft={<Printer className="w-4 h-4" aria-hidden="true" />}
                >
                  Print / Save PDF
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                aria-label="Report granularity"
                value={reportFilter.granularity}
                onChange={(e) =>
                  onChangeReportFilter({
                    ...reportFilter,
                    granularity: e.target.value as 'monthly' | 'yearly',
                  })
                }
              >
                <option value="monthly">Monthly Report</option>
                <option value="yearly">Yearly Report</option>
              </Select>

              {reportFilter.granularity === 'monthly' ? (
                <input
                  type="month"
                  aria-label="Report month"
                  value={reportFilter.month ?? ''}
                  onChange={(e) =>
                    onChangeReportFilter({ ...reportFilter, month: e.target.value })
                  }
                  className="w-full min-h-[44px] rounded-xl px-3.5 text-sm font-mono tabular-nums bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--focus-ring)] transition-colors duration-150"
                />
              ) : (
                <input
                  type="text"
                  aria-label="Report year"
                  value={reportFilter.year ?? ''}
                  onChange={(e) =>
                    onChangeReportFilter({ ...reportFilter, year: e.target.value })
                  }
                  placeholder="YYYY (e.g. 2026)"
                  className="w-full min-h-[44px] rounded-xl px-3.5 text-sm font-mono tabular-nums bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--focus-ring)] transition-colors duration-150"
                />
              )}

              <input
                type="date"
                aria-label="Date from"
                value={reportFilter.dateFrom ?? ''}
                onChange={(e) =>
                  onChangeReportFilter({
                    ...reportFilter,
                    dateFrom: e.target.value || undefined,
                  })
                }
                className="w-full min-h-[44px] rounded-xl px-3.5 text-sm font-mono tabular-nums bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--focus-ring)] transition-colors duration-150"
              />

              <input
                type="date"
                aria-label="Date to"
                value={reportFilter.dateTo ?? ''}
                onChange={(e) =>
                  onChangeReportFilter({
                    ...reportFilter,
                    dateTo: e.target.value || undefined,
                  })
                }
                className="w-full min-h-[44px] rounded-xl px-3.5 text-sm font-mono tabular-nums bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--focus-ring)] transition-colors duration-150"
              />

              <Select
                aria-label="Filter by class"
                value={reportFilter.classId ?? 'all'}
                onChange={(e) =>
                  onChangeReportFilter({
                    ...reportFilter,
                    classId: e.target.value === 'all' ? undefined : e.target.value,
                  })
                }
              >
                <option value="all">All Classes</option>
                {classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name}
                  </option>
                ))}
              </Select>

              <Select
                aria-label="Filter by batch"
                value={reportFilter.batchId ?? 'all'}
                onChange={(e) =>
                  onChangeReportFilter({
                    ...reportFilter,
                    batchId: e.target.value === 'all' ? undefined : e.target.value,
                  })
                }
              >
                <option value="all">All Batches</option>
                {batches.map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.name}
                  </option>
                ))}
              </Select>

              <Select
                aria-label="Filter by teacher"
                value={reportFilter.teacherId ?? 'all'}
                onChange={(e) =>
                  onChangeReportFilter({
                    ...reportFilter,
                    teacherId: e.target.value === 'all' ? undefined : e.target.value,
                  })
                }
              >
                <option value="all">All Teachers</option>
                {teachers.map((t) => (
                  <option key={t.accountId} value={t.accountId}>
                    {t.name} ({t.accountId})
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          {reportSummary && (
            <div className="print-surface space-y-6">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <BrandLogoMark
                    logoConfiguration={applicationBranding.logoConfiguration}
                    alt={centreProfile.centreName}
                    size="md"
                  />
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold font-display text-[var(--text-primary)] truncate">
                      {centreProfile.centreName}
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                      Financial Statement · {reportSummary.periodTitle} · {academicDefaults.academicYearDisplay}
                    </p>
                    {centreContactSummary && (
                      <p className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5">
                        {centreContactSummary}
                      </p>
                    )}
                  </div>
                </div>
                <StatusText tone="nominal" label="Verified Ledger Summary" />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile
                  label="Expected Fee Total"
                  value={formatInrFromPaise(reportSummary.feeSummary.totalExpectedPaise)}
                  caption={`${reportSummary.periodTitle} · ${reportSummary.feeSummary.partialPaymentsCount} partial`}
                  icon={<FileBarChart2 className="w-4 h-4" />}
                />
                <StatTile
                  label="Verified Collections"
                  value={formatInrFromPaise(
                    reportSummary.feeSummary.totalVerifiedCollectionsPaise
                  )}
                  caption="Confirmed receipt revenue only"
                  icon={<ShieldCheck className="w-4 h-4" />}
                  accent
                />
                <StatTile
                  label="Pending Verification Claims"
                  value={formatInrFromPaise(reportSummary.feeSummary.pendingVerificationPaise)}
                  caption={`${reportSummary.feeSummary.pendingVerificationCount} unverified (excluded from revenue)`}
                  icon={<Clock className="w-4 h-4" />}
                />
                <StatTile
                  label="Net Balance"
                  value={formatInrFromPaise(reportSummary.netRecordedBalancePaise)}
                  caption={`Salary Paid: ${formatInrFromPaise(reportSummary.salarySummary.totalSalaryPaidPaise)}`}
                  icon={<Banknote className="w-4 h-4" />}
                />
              </div>

              <Card
                title={`Student Fee Breakdown · ${reportSummary.periodTitle}`}
                subtitle={`Outstanding: ${formatInrFromPaise(reportSummary.feeSummary.totalOutstandingPaise)} · Rejected Claims: ${formatInrFromPaise(reportSummary.feeSummary.rejectedClaimsPaise)} (${reportSummary.feeSummary.rejectedClaimsCount})`}
              >
                <Table
                  columns={studentReportColumns}
                  rows={reportSummary.feeSummary.studentRows}
                  rowKey={(r) => `${r.studentId}-${r.feePeriod}`}
                  emptyTitle="No student fee rows match selected filters"
                  mobileCardRender={(r) => (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between font-semibold">
                        <span>{r.studentName} ({r.studentId})</span>
                        <span>{r.feePeriod}</span>
                      </div>
                      <p className="font-mono tabular-nums">
                        Expected {formatInrFromPaise(r.expectedPaise)} · Verified{' '}
                        {formatInrFromPaise(r.verifiedPaidPaise)} · Due{' '}
                        {formatInrFromPaise(r.outstandingPaise)}
                      </p>
                    </div>
                  )}
                />
              </Card>

              <Card
                title={`Teacher Salary Breakdown · ${reportSummary.periodTitle}`}
                subtitle={`Payable: ${formatInrFromPaise(reportSummary.salarySummary.totalSalaryPayablePaise)} · Paid: ${formatInrFromPaise(reportSummary.salarySummary.totalSalaryPaidPaise)} · Pending: ${formatInrFromPaise(reportSummary.salarySummary.pendingSalaryPaise)}`}
              >
                <Table
                  columns={salaryReportColumns}
                  rows={reportSummary.salarySummary.teacherRows}
                  rowKey={(r) => `${r.teacherId}-${r.period}`}
                  emptyTitle="No teacher salary rows match selected filters"
                  mobileCardRender={(r) => (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between font-semibold">
                        <span>{r.teacherName}</span>
                        <span>{r.period}</span>
                      </div>
                      <p className="font-mono tabular-nums">
                        Payable {formatInrFromPaise(r.payablePaise)} · Paid{' '}
                        {formatInrFromPaise(r.paidPaise)} · Pending{' '}
                        {formatInrFromPaise(r.remainingPaise)}
                      </p>
                    </div>
                  )}
                />
              </Card>
            </div>
          )}
        </div>
      )}

      {/* 3. AUDIT HISTORY */}
      {mode === 'audit' && (
        <div className="space-y-6">
          <Card
            title={`Financial Audit History (${filteredFinancialAudit.length})`}
            subtitle="Append-only trail of fee structure changes, UPI configuration, verifications, receipts, salaries, and audited corrections."
            action={
              <Select
                aria-label="Filter financial audit by entity"
                value={auditFilter}
                onChange={(e) =>
                  setAuditFilter(e.target.value as 'all' | FinancialAuditEntityType)
                }
                className="min-h-[40px] py-1.5 text-xs"
              >
                <option value="all">All Entities</option>
                <option value="fee_configuration">Fee Configurations</option>
                <option value="upi_configuration">UPI Config</option>
                <option value="payment_claim">Payment Claims</option>
                <option value="verified_payment">Verified Payments</option>
                <option value="fee_receipt">Receipts</option>
                <option value="salary_configuration">Salary Configs</option>
                <option value="salary_period">Salary Periods</option>
                <option value="salary_payment">Salary Payments</option>
              </Select>
            }
          >
            <Table
              columns={financialAuditColumns}
              rows={filteredFinancialAudit}
              rowKey={(r) => r.id}
              emptyTitle="No audit events recorded"
              mobileCardRender={(r) => (
                <div className="space-y-1 text-xs">
                  <p className="font-semibold">
                    {r.entityType.replace('_', ' ')} · {r.action}
                  </p>
                  <p className="font-mono text-[var(--text-muted)]">
                    {r.entityId} · {r.actorId} · {formatShortDate(r.timestamp)}
                  </p>
                  {r.newValues && <p>{r.newValues}</p>}
                  {r.reason && <p className="text-[var(--accent-text)]">{r.reason}</p>}
                </div>
              )}
            />
          </Card>

          <Card
            title={`Payment Verification Audit Log (${paymentVerificationAudit.length})`}
            subtitle="Dedicated ledger tracking every student claim submission, admin verification, rejection, and payment correction."
            action={<History className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />}
          >
            <Table
              columns={verificationAuditColumns}
              rows={paymentVerificationAudit}
              rowKey={(r) => r.id}
              emptyTitle="No payment verification audit entries"
              mobileCardRender={(r) => (
                <div className="space-y-1 text-xs">
                  <p className="font-semibold">{r.action.replace('_', ' ')} ({r.paymentClaimId})</p>
                  <p className="font-mono text-[var(--text-muted)]">
                    {r.actorId} · {formatShortDate(r.timestamp)}
                  </p>
                  {r.newValues && <p>{r.newValues}</p>}
                </div>
              )}
            />
          </Card>
        </div>
      )}
    </div>
  );
}
