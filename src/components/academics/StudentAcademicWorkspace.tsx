import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  NotebookPen,
  PlayCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import type { StudentDashboardSummary } from '../../services/contracts/studentPortalService';
import { academicService, studentPortalService } from '../../services';
import type { DayOfWeek, StudentWorkspaceData } from '../../types';
import { formatInrFromPaise } from '../../utils/currency';
import { formatDateTime, formatShortDate } from '../../utils/formatters';
import { ComparisonBarChart, type BarChartDatum } from '../charts/AnalyticsCharts';
import { StudentNotificationsModule } from '../student/StudentNotificationsModule';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';
import { Tabs } from '../ui/Tabs';

const DAYS_OF_WEEK: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function getTodayWeekday(): DayOfWeek | null {
  const idx = new Date().getDay();
  if (idx === 0) return null;
  return DAYS_OF_WEEK[idx - 1] ?? null;
}

interface StudentAcademicWorkspaceProps {
  section: 'home' | 'academics' | 'notices';
  initialNoticeTab?: 'notifications' | 'announcements';
  onNavigate?: (navId: string, subTab?: string) => void;
}

export function StudentAcademicWorkspace({
  section,
  initialNoticeTab = 'notifications',
  onNavigate,
}: StudentAcademicWorkspaceProps) {
  const { principal } = useAuth();
  const { branding, publicSettings } = useInterface();
  const { academicDefaults } = publicSettings;
  const [dashboard, setDashboard] = useState<StudentDashboardSummary | null>(null);
  const [academicsOnlyWorkspace, setAcademicsOnlyWorkspace] =
    useState<StudentWorkspaceData | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(
    () => getTodayWeekday() ?? 'Monday'
  );
  const [timetableViewMode, setTimetableViewMode] = useState<'weekly' | 'today'>(
    () => academicDefaults.defaultTimetableView
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTimetableViewMode(academicDefaults.defaultTimetableView);
  }, [academicDefaults.defaultTimetableView]);

  const loadWorkspace = useCallback(async () => {
    if (section === 'notices') {
      setLoading(false);
      return;
    }
    if (!principal || principal.role !== 'student') {
      setError('Student account authentication required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (section === 'home') {
        const summary = await studentPortalService.getMyStudentDashboard(principal);
        setDashboard(summary);
        setAcademicsOnlyWorkspace(summary.workspace);
      } else {
        const ws = await academicService.getMyStudentWorkspace(principal);
        setAcademicsOnlyWorkspace(ws);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load student workspace.'
      );
    } finally {
      setLoading(false);
    }
  }, [principal, section]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  if (!principal || principal.role !== 'student') {
    return (
      <Card title="Access Restricted">
        <p className="text-sm text-[#D64C55] dark:text-[#EF6D75]">
          This workspace is strictly restricted to authenticated Student / Parent credentials.
        </p>
      </Card>
    );
  }

  if (section === 'notices') {
    return (
      <StudentNotificationsModule
        initialFocus={initialNoticeTab}
        onNavigate={onNavigate}
      />
    );
  }

  const workspace = dashboard?.workspace ?? academicsOnlyWorkspace;
  const sortedTimetable = [...(workspace?.timetable ?? [])].sort((a, b) =>
    a.entry.startTime.localeCompare(b.entry.startTime)
  );
  const todayWeekday = getTodayWeekday();
  const todaySlots = todayWeekday
    ? sortedTimetable.filter((t) => t.entry.dayOfWeek === todayWeekday)
    : [];

  const attendancePct = dashboard?.attendanceSummary.percentage ?? 0;

  const recentResultBars: BarChartDatum[] = (
    dashboard?.recentReleasedResults.slice(0, 5) ?? []
  ).map((res) => ({
    id: res.id,
    label: res.title,
    value: res.percentage,
    maxValue: 100,
    displayValue: `${res.marksObtained}/${res.maximumMarks} (${res.percentage}%)`,
    helperText: res.subjectName,
    tone: res.percentage >= 75 ? 'mint' : res.percentage >= 40 ? 'charcoal' : 'danger',
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${branding.centreName} · ${academicDefaults.academicYearDisplay} · ${principal.loginId}`}
        title={
          section === 'home'
            ? `Welcome, ${principal.fullName}`
            : 'My Class, Subjects & Timetable'
        }
        subtitle={
          section === 'home'
            ? 'Your class placement, attendance, upcoming homework, tests, exam results, fee balance, and notifications in one place.'
            : 'Review your enrolled batch details, mapped subjects, and weekly batch timetable.'
        }
        rightSlot={<StatusText tone="nominal" label={`Student ID: ${principal.loginId}`} />}
      />

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-[#E2E8E5] dark:bg-[#252E33] animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-[#F0F4F2] dark:bg-[#252E33] animate-pulse"
              />
            ))}
          </div>
        </div>
      ) : (
        workspace && (
          <>
            {!workspace.enrolment && (
              <Card
                title="No Active Batch Enrolment"
                subtitle="Your student account does not currently have an active class or batch placement."
              >
                <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-6 text-center space-y-2">
                  <GraduationCap
                    className="w-6 h-6 text-[#68737C] dark:text-[#AAB6B4] mx-auto"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-[#171D21] dark:text-[#F4F7F6]">
                    Not Yet Enrolled in an Active Batch
                  </p>
                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] max-w-md mx-auto">
                    Centre-wide announcements, fee history, and notifications remain accessible. Contact the tuition centre Admin to complete your class and batch enrolment.
                  </p>
                </div>
              </Card>
            )}

            {/* HOME DASHBOARD VIEW */}
            {section === 'home' && dashboard && (
              <>
                {/* Charcoal Hero Academic & Attendance Pulse */}
                <Card variant="charcoal" padding="md">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div className="space-y-2 min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#42DDA9] truncate">
                        {dashboard.profile.enrolmentStatus === 'active'
                          ? `${dashboard.profile.className ?? dashboard.profile.classId} · ${dashboard.profile.batchName ?? dashboard.profile.batchId}`
                          : 'Not Enrolled'}
                        {dashboard.profile.enrolmentId
                          ? ` · ${dashboard.profile.enrolmentId}`
                          : ` · ${principal.loginId}`}
                      </p>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-[#F4F7F6]">
                          Overall Attendance:{' '}
                          <span className="font-mono tabular-nums text-[#42DDA9]">
                            {dashboard.attendanceSummary.percentage === null
                              ? 'N/A'
                              : dashboard.attendanceSummary.displayPercentage}
                          </span>
                        </h2>
                        <span className="text-xs font-mono tabular-nums text-[#AAB6B4]">
                          {dashboard.attendanceSummary.eligibleDenominator > 0
                            ? `${dashboard.attendanceSummary.attendedCount}/${dashboard.attendanceSummary.eligibleDenominator} eligible sessions`
                            : 'No eligible sessions yet'}
                        </span>
                      </div>
                      <div className="max-w-md h-1.5 rounded-full bg-[#343C42] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#42DDA9] transition-[width] duration-300"
                          style={{
                            width: `${Math.min(100, Math.max(0, attendancePct))}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 lg:border-l border-[#343C42] lg:pl-6 shrink-0">
                      <div>
                        <p className="text-[11px] text-[#AAB6B4]">Fee Balance Due</p>
                        <p className="mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums text-[#F4F7F6]">
                          {formatInrFromPaise(
                            dashboard.feeSummary.totalRemainingBalancePaise
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#AAB6B4] truncate max-w-[180px]">
                          {dashboard.feeSummary.feeAccountsCount === 0
                            ? 'No fee account yet'
                            : dashboard.feeSummary.nextDueDate
                              ? `Due ${formatShortDate(dashboard.feeSummary.nextDueDate)}${
                                  dashboard.feeSummary.hasOverdue ? ' · Overdue' : ''
                                }`
                              : 'All generated fees verified'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#AAB6B4]">Unread Updates</p>
                        <p className="mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums text-[#42DDA9]">
                          {dashboard.unreadNotificationCount}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#AAB6B4]">
                          {dashboard.unreadAnnouncementCount} unread notice(s)
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Academic Pulse Stat Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatTile
                    label="Homework Deadlines"
                    value={dashboard.upcomingHomework.length}
                    caption={
                      dashboard.overdueHomeworkCount > 0
                        ? `${dashboard.overdueHomeworkCount} overdue · ${dashboard.dueTodayHomeworkCount} due today`
                        : `${dashboard.dueTodayHomeworkCount} due today`
                    }
                    icon={<NotebookPen className="w-4 h-4" strokeWidth={1.75} />}
                    tone={dashboard.overdueHomeworkCount > 0 ? 'mint' : 'default'}
                  />
                  <StatTile
                    label="Upcoming & Open Tests"
                    value={dashboard.upcomingOrAvailableTests.length}
                    caption="Online objective tests"
                    icon={<PlayCircle className="w-4 h-4" strokeWidth={1.75} />}
                  />
                  <StatTile
                    label="Scheduled Exams"
                    value={dashboard.upcomingExaminations.length}
                    caption="Upcoming or awaiting release"
                    icon={<ClipboardList className="w-4 h-4" strokeWidth={1.75} />}
                  />
                  <StatTile
                    label="Released Results"
                    value={dashboard.releasedResultsCount}
                    caption={
                      dashboard.unreleasedPendingCount > 0
                        ? `${dashboard.unreleasedPendingCount} awaiting release`
                        : 'All scores published'
                    }
                    icon={<FileSpreadsheet className="w-4 h-4" strokeWidth={1.75} />}
                  />
                </div>

                {/* Priority Tasks & Today's Schedule */}
                <div className="grid gap-5 lg:grid-cols-2">
                  <Card
                    title="Upcoming Deadlines, Tests & Exams"
                    subtitle="Prioritized items requiring attention or scheduled next"
                    action={
                      onNavigate ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onNavigate('learning', 'homework')}
                        >
                          Open Learning
                        </Button>
                      ) : undefined
                    }
                  >
                    <div className="space-y-3">
                      {dashboard.upcomingHomework.length === 0 &&
                      dashboard.upcomingOrAvailableTests.length === 0 &&
                      dashboard.upcomingExaminations.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-5 text-center space-y-1.5">
                          <CheckCircle2
                            className="w-5 h-5 text-[#168A63] dark:text-[#42DDA9] mx-auto"
                            aria-hidden="true"
                          />
                          <p className="text-sm font-medium text-[#171D21] dark:text-[#F4F7F6]">
                            You are all caught up right now
                          </p>
                          <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                            No pending homework deadlines, open online tests, or upcoming exams at this moment.
                          </p>
                        </div>
                      ) : (
                        <>
                          {dashboard.upcomingOrAvailableTests.slice(0, 2).map((tst) => (
                            <div
                              key={tst.id}
                              className="rounded-xl border border-[#B8EBD8] dark:border-[#316453] bg-[#DDF8EE]/60 dark:bg-[#244B3E]/60 p-3.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-mono font-semibold text-[#168A63] dark:text-[#42DDA9]">
                                  Online Test · {tst.subjectName} · {tst.durationMinutes} min
                                </p>
                                <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                                  {tst.title}
                                </p>
                              </div>
                              {onNavigate && (
                                <Button
                                  size="sm"
                                  onClick={() => onNavigate('assessments', 'tests')}
                                >
                                  {tst.inProgressAttempt
                                    ? 'Resume'
                                    : tst.effectiveStatus === 'active'
                                      ? 'Open'
                                      : 'Details'}
                                </Button>
                              )}
                            </div>
                          ))}

                          {dashboard.upcomingHomework.slice(0, 3).map((hw) => (
                            <div
                              key={hw.homework.id}
                              className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-mono text-[#68737C] dark:text-[#AAB6B4]">
                                  Homework · {hw.subjectName} · Due{' '}
                                  {formatShortDate(hw.homework.dueAt)}
                                </p>
                                <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                                  {hw.homework.title}
                                </p>
                              </div>
                              {onNavigate && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => onNavigate('homework')}
                                >
                                  Open
                                </Button>
                              )}
                            </div>
                          ))}

                          {dashboard.upcomingExaminations.slice(0, 2).map((ex) => (
                            <div
                              key={ex.examination.id}
                              className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-mono text-[#68737C] dark:text-[#AAB6B4]">
                                  Examination · {ex.subjectName} ·{' '}
                                  {formatShortDate(ex.examination.examDate)}
                                </p>
                                <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                                  {ex.examination.title}
                                </p>
                              </div>
                              {onNavigate && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => onNavigate('assessments', 'examinations')}
                                >
                                  View
                                </Button>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </Card>

                  <Card
                    title={
                      todayWeekday
                        ? `Today’s Classes (${todayWeekday})`
                        : 'Upcoming Classes'
                    }
                    subtitle={`${workspace.batchRecord?.name ?? 'Your batch'} schedule`}
                    action={
                      onNavigate ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onNavigate('academics')}
                        >
                          Full Week
                        </Button>
                      ) : undefined
                    }
                  >
                    {todaySlots.length > 0 ? (
                      <div className="space-y-2.5">
                        {todaySlots.map((slot) => (
                          <div
                            key={slot.entry.entryId}
                            className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3.5"
                          >
                            <p className="font-mono text-xs font-semibold tabular-nums text-[#168A63] dark:text-[#42DDA9]">
                              {slot.entry.startTime}–{slot.entry.endTime}
                              {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                              {slot.subjectName}
                            </p>
                            <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                              Teacher: {slot.teacherName}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : sortedTimetable.length > 0 ? (
                      <div className="space-y-2.5">
                        <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                          {todayWeekday
                            ? `No classes scheduled on ${todayWeekday}. Next scheduled slots:`
                            : 'Weekend — upcoming scheduled slots:'}
                        </p>
                        {sortedTimetable.slice(0, 3).map((slot) => (
                          <div
                            key={slot.entry.entryId}
                            className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3.5"
                          >
                            <p className="font-mono text-xs font-semibold tabular-nums text-[#168A63] dark:text-[#42DDA9]">
                              {slot.entry.dayOfWeek} · {slot.entry.startTime}–
                              {slot.entry.endTime}
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                              {slot.subjectName}
                            </p>
                            <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                              Teacher: {slot.teacherName}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#68737C] dark:text-[#AAB6B4] py-4 text-center">
                        No active sessions scheduled for this batch yet.
                      </p>
                    )}
                  </Card>
                </div>

                {/* Recent Released Results + Real-Data Score Chart */}
                <Card
                  title="Recently Released Results"
                  subtitle="Scores published by your subject teachers"
                  action={
                    onNavigate ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigate('assessments', 'results')}
                      >
                        <span className="inline-flex items-center gap-1">
                          <span>All Results</span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                      </Button>
                    ) : undefined
                  }
                >
                  {dashboard.recentReleasedResults.length === 0 ? (
                    <ComparisonBarChart
                      data={[]}
                      emptyTitle="No released assessment results yet"
                      emptyDescription={
                        dashboard.unreleasedPendingCount > 0
                          ? `${dashboard.unreleasedPendingCount} assessment(s) awaiting completion or teacher release.`
                          : 'Released scores across online tests, examinations, and graded homework will render here.'
                      }
                      ariaLabel="Recent released results"
                    />
                  ) : (
                    <div className="space-y-5">
                      <ComparisonBarChart
                        data={recentResultBars}
                        ariaLabel="Recent released results percentage"
                      />
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2 border-t border-[#E2E8E5] dark:border-[#344047]">
                        {dashboard.recentReleasedResults.slice(0, 3).map((res) => (
                          <div
                            key={res.id}
                            className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3.5 space-y-1"
                          >
                            <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] capitalize">
                              {res.subjectName} · {res.sourceType.replace(/_/g, ' ')}
                            </p>
                            <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                              {res.title}
                            </p>
                            <p className="font-mono text-sm font-bold tabular-nums text-[#168A63] dark:text-[#42DDA9]">
                              {res.marksObtained} / {res.maximumMarks} ({res.percentage}%)
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Unified Recent Activity Feed */}
                <Card
                  title="Recent Activity"
                  subtitle="Chronological updates across homework, tests, examinations, attendance, and fees"
                  action={
                    onNavigate ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigate('notices', 'notifications')}
                      >
                        Notification Centre
                      </Button>
                    ) : undefined
                  }
                >
                  {dashboard.recentActivity.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-6 text-center space-y-2">
                      <Activity
                        className="w-5 h-5 text-[#68737C] dark:text-[#AAB6B4] mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-[#171D21] dark:text-[#F4F7F6]">
                        No recent activity recorded yet
                      </p>
                      <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                        Activity updates appear here when homework, tests, attendance, results, or fee receipts are recorded.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
                      {dashboard.recentActivity.map((act) => (
                        <li
                          key={act.id}
                          className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                              <StatusText
                                tone={act.tone}
                                label={act.category.toUpperCase()}
                              />
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {formatDateTime(act.timestamp)}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                              {act.title}
                            </p>
                            <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                              {act.detail}
                            </p>
                          </div>

                          {onNavigate && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onNavigate(act.targetNavId, act.targetSubTab)}
                              iconRight={
                                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                              }
                            >
                              Open
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}

            {/* FULL ACADEMICS VIEW (Subjects & Timetable) */}
            {section === 'academics' && workspace.enrolment && (
              <>
                <Card
                  title="My Subjects"
                  subtitle={`Subjects mapped to ${workspace.classRecord?.name ?? 'your class'}.`}
                >
                  {workspace.subjects.length === 0 ? (
                    <div className="text-sm text-[#68737C] dark:text-[#AAB6B4] py-4 text-center">
                      No active subjects mapped to this class yet.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {workspace.subjects.map((sub) => (
                        <div
                          key={sub.subjectId}
                          className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3.5 bg-[#F0F4F2] dark:bg-[#252E33] flex items-center gap-3"
                        >
                          <span className="w-9 h-9 rounded-lg bg-[#DDF8EE] dark:bg-[#244B3E] text-[#168A63] dark:text-[#42DDA9] border border-[#B8EBD8]/70 dark:border-[#316453] inline-flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                              {sub.name}
                            </p>
                            <p className="font-mono text-xs text-[#68737C] dark:text-[#AAB6B4]">
                              {sub.code ?? sub.subjectId}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card
                  title="My Batch Timetable"
                  subtitle={`${timetableViewMode === 'today' ? "Today's focus" : 'Weekly schedule'} for ${workspace.batchRecord?.name ?? 'your batch'} (${academicDefaults.academicYearDisplay}).`}
                  action={
                    <Tabs
                      ariaLabel="Timetable view mode"
                      value={timetableViewMode}
                      onChange={setTimetableViewMode}
                      items={[
                        { id: 'today', label: 'Today' },
                        { id: 'weekly', label: 'Full Week' },
                      ]}
                    />
                  }
                >
                  {sortedTimetable.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-6 text-center space-y-2">
                      <CalendarClock
                        className="w-5 h-5 text-[#68737C] dark:text-[#AAB6B4] mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-[#171D21] dark:text-[#F4F7F6]">
                        No active sessions scheduled for this batch yet
                      </p>
                    </div>
                  ) : timetableViewMode === 'today' ? (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-[#68737C] dark:text-[#AAB6B4]">
                        {todayWeekday
                          ? `Showing sessions for ${todayWeekday} (Admin default: Today view).`
                          : 'Sunday — no classes today. Switch to Full Week to inspect Monday–Saturday.'}
                      </p>
                      {todaySlots.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-5 text-center text-xs text-[#68737C] dark:text-[#AAB6B4]">
                          No classes scheduled for today. Use Full Week above to browse all weekdays.
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {todaySlots.map((slot) => (
                            <div
                              key={slot.entry.entryId}
                              className="rounded-xl border border-[#B8EBD8] dark:border-[#316453] p-3.5 bg-[#DDF8EE]/60 dark:bg-[#244B3E]/60 space-y-1"
                            >
                              <p className="font-mono text-xs font-semibold tabular-nums text-[#168A63] dark:text-[#42DDA9]">
                                {slot.entry.startTime}–{slot.entry.endTime}
                                {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                              </p>
                              <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                                {slot.subjectName}
                              </p>
                              <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                                Teacher: {slot.teacherName}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Mobile Day Selector */}
                      <div className="md:hidden space-y-3">
                        <Tabs
                          ariaLabel="Select weekday"
                          value={selectedDay}
                          onChange={setSelectedDay}
                          items={DAYS_OF_WEEK.map((day) => ({
                            id: day,
                            label: day.slice(0, 3),
                          }))}
                        />
                        <div className="space-y-2.5">
                          {sortedTimetable.filter((t) => t.entry.dayOfWeek === selectedDay)
                            .length === 0 ? (
                            <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] py-4 text-center">
                              No classes scheduled on {selectedDay}.
                            </p>
                          ) : (
                            sortedTimetable
                              .filter((t) => t.entry.dayOfWeek === selectedDay)
                              .map((slot) => (
                                <div
                                  key={slot.entry.entryId}
                                  className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3.5 bg-[#F0F4F2] dark:bg-[#252E33]"
                                >
                                  <p className="font-mono text-xs font-semibold tabular-nums text-[#168A63] dark:text-[#42DDA9]">
                                    {slot.entry.startTime}–{slot.entry.endTime}
                                    {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                                    {slot.subjectName}
                                  </p>
                                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                                    Teacher: {slot.teacherName}
                                  </p>
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      {/* Desktop Weekly Grid */}
                      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {DAYS_OF_WEEK.map((day) => {
                          const slots = sortedTimetable.filter(
                            (t) => t.entry.dayOfWeek === day
                          );
                          return (
                            <div
                              key={day}
                              className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3.5 bg-[#F0F4F2] dark:bg-[#252E33] space-y-2.5"
                            >
                              <h3 className="text-xs font-semibold text-[#68737C] dark:text-[#AAB6B4]">
                                {day}
                              </h3>
                              {slots.length === 0 ? (
                                <p className="text-xs text-[#68737C]/70 dark:text-[#AAB6B4]/70 py-2">
                                  No sessions
                                </p>
                              ) : (
                                slots.map((slot) => (
                                  <div
                                    key={slot.entry.entryId}
                                    className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3 bg-white dark:bg-[#1D2429] space-y-1"
                                  >
                                    <p className="font-mono text-xs font-semibold tabular-nums text-[#168A63] dark:text-[#42DDA9]">
                                      {slot.entry.startTime}–{slot.entry.endTime}
                                    </p>
                                    <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                                      {slot.subjectName}
                                    </p>
                                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                                      {slot.teacherName}
                                      {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
