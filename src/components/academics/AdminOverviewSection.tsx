import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  GraduationCap,
  IndianRupee,
  Megaphone,
  Settings,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import {
  academicService,
  accountService,
  assessmentService,
  attendanceService,
  financialReportService,
  isFirebaseConnectedMode,
} from '../../services';
import type {
  AcademicOverviewStats,
  AccountOverviewStats,
  AdminAssessmentOverviewData,
  AdminAttendanceOverview,
  AdminFinancialDashboardData,
} from '../../types';
import { formatInrFromPaise } from '../../utils/currency';
import {
  ComparisonBarChart,
  DistributionDonutChart,
  type BarChartDatum,
  type DonutSegment,
} from '../charts/AnalyticsCharts';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';

interface AdminOverviewSectionProps {
  mode: 'website' | 'webapp';
  variant?: 'home' | 'overview';
  onNavigate: (navId: string) => void;
}

export function AdminOverviewSection({
  mode,
  variant = 'home',
  onNavigate,
}: AdminOverviewSectionProps) {
  const { principal } = useAuth();
  const { branding, publicSettings } = useInterface();
  const [academicStats, setAcademicStats] = useState<AcademicOverviewStats | null>(null);
  const [accountStats, setAccountStats] = useState<AccountOverviewStats | null>(null);
  const [attendanceStats, setAttendanceStats] = useState<AdminAttendanceOverview | null>(null);
  const [assessmentStats, setAssessmentStats] = useState<AdminAssessmentOverviewData['stats'] | null>(null);
  const [financeStats, setFinanceStats] = useState<AdminFinancialDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!principal || principal.role !== 'admin') {
      setError('Admin authorization required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [acad, acct, att, assess, fin] = await Promise.all([
        academicService.getAcademicOverview(principal),
        accountService.getAccountOverview(principal),
        attendanceService.getAdminAttendanceOverview(principal),
        assessmentService.getAdminAssessmentOverview(principal),
        financialReportService.getAdminFinancialDashboard(principal).catch(() => null),
      ]);
      setAcademicStats(acad);
      setAccountStats(acct);
      setAttendanceStats(att);
      setAssessmentStats(assess.stats);
      setFinanceStats(fin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to compute centre overview.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const accountsTarget = mode === 'website' ? 'accounts' : 'lookup';
  const noticesTarget = mode === 'website' ? 'announcements' : 'notices';

  const classAttendanceBars: BarChartDatum[] = (attendanceStats?.byClass ?? []).map((cls) => {
    const pct = cls.summary.percentage ?? 0;
    return {
      id: cls.classId,
      label: cls.className,
      value: pct,
      maxValue: 100,
      displayValue: cls.summary.displayPercentage,
      helperText: `${cls.submittedSessions} sessions`,
      tone: pct >= 75 ? 'mint' : pct >= 50 ? 'warning' : 'danger',
    };
  });

  const hasFinanceData =
    financeStats !== null &&
    financeStats.totalVerifiedCollectionsPaise +
      financeStats.pendingPaymentClaimsPaise +
      financeStats.totalOutstandingStudentFeesPaise >
      0;

  const financeDonutSegments: DonutSegment[] = financeStats
    ? [
        {
          id: 'verified',
          label: 'Verified Collections',
          value: financeStats.totalVerifiedCollectionsPaise,
          displayValue: formatInrFromPaise(financeStats.totalVerifiedCollectionsPaise),
          colorLight: 'var(--accent)',
          colorDark: 'var(--accent)',
        },
        {
          id: 'pending-claims',
          label: 'Pending Claims',
          value: financeStats.pendingPaymentClaimsPaise,
          displayValue: formatInrFromPaise(financeStats.pendingPaymentClaimsPaise),
          colorLight: 'var(--warning)',
          colorDark: 'var(--warning)',
        },
        {
          id: 'outstanding',
          label: 'Outstanding Student Fees',
          value: financeStats.totalOutstandingStudentFeesPaise,
          displayValue: formatInrFromPaise(financeStats.totalOutstandingStudentFeesPaise),
          colorLight: 'var(--text-secondary)',
          colorDark: 'var(--text-secondary)',
        },
      ]
    : [];

  const attendanceDonutSegments: DonutSegment[] = attendanceStats
    ? [
        {
          id: 'present',
          label: 'Present',
          value: attendanceStats.presentCount,
          colorLight: 'var(--accent)',
          colorDark: 'var(--accent)',
        },
        {
          id: 'late',
          label: 'Late',
          value: attendanceStats.lateCount,
          colorLight: 'var(--warning)',
          colorDark: 'var(--warning)',
        },
        {
          id: 'absent',
          label: 'Absent',
          value: attendanceStats.absentCount,
          colorLight: 'var(--error)',
          colorDark: 'var(--error)',
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          variant === 'home'
            ? `${branding.centreName} · ${publicSettings.academicDefaults.academicYearDisplay} · Welcome, ${principal?.fullName ?? 'Admin'}`
            : `${branding.centreName} · ${publicSettings.academicDefaults.academicYearDisplay}`
        }
        title={
          variant === 'home'
            ? 'Centre Control Home'
            : 'Executive Academic & Operations Overview'
        }
        subtitle={
          variant === 'home'
            ? 'Daily attendance pulse, financial collections, and live centre metrics across classes, teachers, and students.'
            : 'Detailed breakdown of active classes, attendance percentages, financial balances, assessments, and operational readiness.'
        }
        rightSlot={
          <StatusText
            tone="nominal"
            label={`${principal?.loginId ?? 'Admin'} · ${isFirebaseConnectedMode() ? 'Spark Connected' : 'Local Adapter'}`}
          />
        }
      />

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-[var(--surface-secondary)] animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-[var(--surface-secondary)] animate-pulse"
              />
            ))}
          </div>
        </div>
      ) : (
        academicStats &&
        accountStats && (
          <>
            {/* Executive Charcoal Hero Pulse */}
            <Card variant="charcoal" padding="md">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-1.5 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--hero-accent)]">
                    Live Centre Pulse · {publicSettings.academicDefaults.academicYearDisplay}
                  </p>
                  <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-[var(--hero-text)] truncate">
                    {branding.centreName}
                  </h2>
                  <p className="text-xs sm:text-sm text-[var(--hero-muted)]">
                    {accountStats.activeAccounts} active member accounts across {academicStats.activeClasses} classes and {academicStats.activeBatches} batches.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 lg:border-l border-[var(--hero-border)] lg:pl-6 shrink-0">
                  <div>
                    <p className="text-[11px] text-[var(--hero-muted)]">Verified Collections</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums text-[var(--hero-accent)]">
                      {financeStats
                        ? formatInrFromPaise(financeStats.totalVerifiedCollectionsPaise)
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--hero-muted)]">Pending Claims</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums text-[var(--hero-text)]">
                      {financeStats
                        ? `${financeStats.pendingPaymentClaimsCount} (${formatInrFromPaise(financeStats.pendingPaymentClaimsPaise)})`
                        : '—'}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-[11px] text-[var(--hero-muted)]">Attendance Rate</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums text-[var(--hero-text)]">
                      {attendanceStats?.overallSummary.displayPercentage ?? '—'}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Top 4 Executive KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Total Students"
                value={accountStats.totalStudents}
                caption={`${academicStats.enrolledStudents} actively enrolled`}
                icon={<GraduationCap className="w-4 h-4" strokeWidth={1.75} />}
              />
              <StatTile
                label="Total Teachers"
                value={accountStats.totalTeachers}
                caption={`${academicStats.activeAssignments} subject assignments`}
                icon={<Users className="w-4 h-4" strokeWidth={1.75} />}
              />
              <StatTile
                label="Active Classes"
                value={academicStats.activeClasses}
                caption={`${academicStats.activeBatches} active batches`}
                icon={<BookOpen className="w-4 h-4" strokeWidth={1.75} />}
              />
              <StatTile
                label="Overall Attendance"
                value={attendanceStats?.overallSummary.displayPercentage ?? 'Not available'}
                caption={
                  attendanceStats
                    ? `${attendanceStats.submittedSessions} submitted · ${attendanceStats.unreadNotificationCount} unread alerts`
                    : `${academicStats.activeTimetableSessions} weekly sessions`
                }
                icon={<ClipboardCheck className="w-4 h-4" strokeWidth={1.75} />}
                tone="mint"
              />
            </div>

            {/* Data-Driven Analytics Charts */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Card
                title="Class Attendance Breakdown"
                subtitle={
                  attendanceStats
                    ? `${attendanceStats.presentCount} present · ${attendanceStats.lateCount} late · ${attendanceStats.absentCount} absent`
                    : 'No attendance recorded yet'
                }
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('attendance')}
                  >
                    Monitor
                  </Button>
                }
              >
                <ComparisonBarChart
                  data={classAttendanceBars}
                  emptyTitle="No attendance sessions yet"
                  emptyDescription="Class attendance bars will appear here after teachers submit sessions."
                  ariaLabel="Class attendance breakdown"
                />
              </Card>

              {hasFinanceData && financeStats ? (
                <Card
                  title="Fee Collection & Claims Mix"
                  subtitle={`Current period: ${financeStats.currentPeriod}`}
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigate('finance')}
                    >
                      Finance
                    </Button>
                  }
                >
                  <DistributionDonutChart
                    centerLabel="Verified"
                    centerValue={formatInrFromPaise(financeStats.totalVerifiedCollectionsPaise)}
                    segments={financeDonutSegments}
                  />
                </Card>
              ) : (
                <Card
                  title="Attendance Distribution"
                  subtitle="Cumulative breakdown across all recorded sessions"
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigate('attendance')}
                    >
                      Attendance
                    </Button>
                  }
                >
                  <DistributionDonutChart
                    centerLabel="Sessions"
                    centerValue={String(attendanceStats?.submittedSessions ?? 0)}
                    segments={attendanceDonutSegments}
                    emptyTitle="No distribution records yet"
                    emptyDescription="Distribution metrics render automatically once attendance or fee records exist."
                  />
                </Card>
              )}
            </div>

            {/* Assessments & Financial Summary */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Card
                title="Assessments & Notices Snapshot"
                subtitle="Live status across homework, online tests, exams & centre notices"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('assessments')}
                  >
                    Inspect
                  </Button>
                }
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
                    <p className="text-xs text-[var(--text-muted)]">Homework Published</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-[var(--text-primary)]">
                      {assessmentStats?.publishedHomework ?? 0}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {assessmentStats?.pendingHomeworkSubmissions ?? 0} pending submissions
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
                    <p className="text-xs text-[var(--text-muted)]">Online Tests</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-[var(--text-primary)]">
                      {assessmentStats?.publishedTests ?? 0}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {assessmentStats?.completedTestAttempts ?? 0} completed attempts
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
                    <p className="text-xs text-[var(--text-muted)]">Examinations</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-[var(--text-primary)]">
                      {(assessmentStats?.upcomingExaminations ?? 0) +
                        (assessmentStats?.completedExaminations ?? 0)}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {assessmentStats?.pendingMarksEntry ?? 0} pending marks entry
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
                    <p className="text-xs text-[var(--text-muted)]">Live Notices</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-[var(--text-primary)]">
                      {academicStats.publishedAnnouncements}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {accountStats.activeAccounts} active accounts
                    </p>
                  </div>
                </div>
              </Card>

              <Card
                title="Financial & Payroll Summary"
                subtitle={
                  financeStats
                    ? `Net recorded balance · ${financeStats.verifiedPaymentsCount} verified payment(s)`
                    : 'Fee collections, pending claims, and teacher salaries'
                }
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('finance')}
                  >
                    Open Finance
                  </Button>
                }
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3.5">
                    <p className="text-xs text-[var(--accent-text)] font-medium">
                      Verified Fees
                    </p>
                    <p className="mt-1 text-lg sm:text-xl font-semibold font-mono tabular-nums text-[var(--text-primary)]">
                      {financeStats
                        ? formatInrFromPaise(financeStats.totalVerifiedCollectionsPaise)
                        : '₹0'}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {financeStats
                        ? `${formatInrFromPaise(financeStats.currentMonthCollectionsPaise)} this month`
                        : 'No collections yet'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
                    <p className="text-xs text-[var(--text-muted)]">
                      Pending Verification
                    </p>
                    <p className="mt-1 text-lg sm:text-xl font-semibold font-mono tabular-nums text-[var(--text-primary)]">
                      {financeStats
                        ? formatInrFromPaise(financeStats.pendingPaymentClaimsPaise)
                        : '₹0'}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {financeStats?.pendingPaymentClaimsCount ?? 0} awaiting verification
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
                    <p className="text-xs text-[var(--text-muted)]">
                      Outstanding Fees
                    </p>
                    <p className="mt-1 text-lg sm:text-xl font-semibold font-mono tabular-nums text-[var(--text-primary)]">
                      {financeStats
                        ? formatInrFromPaise(financeStats.totalOutstandingStudentFeesPaise)
                        : '₹0'}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      Student ledger balance
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
                    <p className="text-xs text-[var(--text-muted)]">
                      Teacher Salaries Paid
                    </p>
                    <p className="mt-1 text-lg sm:text-xl font-semibold font-mono tabular-nums text-[var(--text-primary)]">
                      {financeStats
                        ? formatInrFromPaise(financeStats.totalTeacherSalaryPaidPaise)
                        : '₹0'}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {financeStats
                        ? `${formatInrFromPaise(financeStats.pendingTeacherSalaryPaise)} pending`
                        : 'Payroll tracking'}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Module Navigation Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card
                title="Teacher & Student Accounts"
                subtitle={`${accountStats.activeAccounts} active · ${accountStats.inactiveAccounts} inactive`}
              >
                <div className="space-y-4">
                  <p className="text-sm text-[var(--text-muted)]">
                    Provision unique Teacher (TCH-xxxx) and Student (STU-xxxx) IDs, edit records, or toggle login eligibility.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onNavigate(accountsTarget)}
                    iconLeft={<Users className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>Open Accounts</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </Button>
                </div>
              </Card>

              <Card
                title="Academic Structure"
                subtitle={`${academicStats.totalClasses} classes · ${academicStats.totalBatches} batches · ${academicStats.totalSubjects} subjects`}
              >
                <div className="space-y-4">
                  <p className="text-sm text-[var(--text-muted)]">
                    Manage classes, batch cohorts, subjects, student enrolments, teacher assignments, and weekly timetables.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onNavigate('academics')}
                    iconLeft={<BookOpen className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>Open Academics</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </Button>
                </div>
              </Card>

              <Card
                title="Announcements & Finance"
                subtitle={`${academicStats.publishedAnnouncements} live notices · UPI & payroll`}
              >
                <div className="space-y-4">
                  <p className="text-sm text-[var(--text-muted)]">
                    Draft text-only announcements targeted to teachers or classes, or open Fee & Salary verification.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onNavigate(noticesTarget)}
                      iconLeft={<Megaphone className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
                    >
                      <span>Notices</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onNavigate('finance')}
                      iconLeft={<IndianRupee className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
                    >
                      <span>Finance</span>
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <Card
              title="Active Centre Scope & Settings"
              subtitle={
                isFirebaseConnectedMode()
                  ? 'All Auth, Accounts, Academics, Attendance, Assessments, Finance/Salaries, Student Portal & Settings connected to Firebase academy-0007 (Spark Plan).'
                  : 'All ecosystem modules active in Explicit LOCAL_DEMO Development Mode.'
              }
              padding="sm"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigate('settings')}
                  iconLeft={<Settings className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />}
                >
                  Open Settings
                </Button>
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>
                    Configure centre identity, dynamic app branding, theme defaults, academic session, and notification controls in Settings.
                  </span>
                </span>
                <span className="font-mono">
                  {isFirebaseConnectedMode()
                    ? 'Firebase: Connected (academy-0007)'
                    : 'Firebase: Local Demo Mode'}
                </span>
              </div>
            </Card>
          </>
        )
      )}
    </div>
  );
}
