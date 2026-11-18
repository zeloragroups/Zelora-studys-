import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  IndianRupee,
  Megaphone,
  NotebookPen,
  PlayCircle,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import type { StudentDashboardSummary } from '../../services/contracts/studentPortalService';
import { academicService } from '../../services';
import { studentPortalService } from '../../services';
import type { DayOfWeek, StudentWorkspaceData } from '../../types';
import { cn } from '../../utils/cn';
import { formatInrFromPaise } from '../../utils/currency';
import { formatDateTime, formatShortDate } from '../../utils/formatters';
import { StudentNotificationsModule } from '../student/StudentNotificationsModule';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';

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
        <p className="text-sm text-[#D94C5C] dark:text-[#F16B75]">
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

  const quickActions = [
    {
      id: 'qa-attendance',
      label: 'My Attendance',
      navId: 'attendance',
      icon: CalendarCheck2,
    },
    {
      id: 'qa-homework',
      label: 'Homework',
      navId: 'homework',
      icon: NotebookPen,
    },
    {
      id: 'qa-tests',
      label: 'Online Tests',
      navId: 'assessments',
      subTab: 'tests',
      icon: PlayCircle,
    },
    {
      id: 'qa-results',
      label: 'Exam Results',
      navId: 'assessments',
      subTab: 'results',
      icon: FileSpreadsheet,
    },
    {
      id: 'qa-timetable',
      label: 'Timetable',
      navId: 'academics',
      icon: CalendarClock,
    },
    {
      id: 'qa-announcements',
      label: 'Announcements',
      navId: 'notices',
      subTab: 'announcements',
      icon: Megaphone,
    },
    {
      id: 'qa-fees',
      label: 'Fees & Receipts',
      navId: 'fees',
      icon: IndianRupee,
    },
    {
      id: 'qa-notifications',
      label: 'Notifications',
      navId: 'notices',
      subTab: 'notifications',
      icon: Bell,
    },
    {
      id: 'qa-profile',
      label: 'My Profile',
      navId: 'profile',
      icon: UserCircle2,
    },
  ];

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
        workspace && (
          <>
            {!workspace.enrolment && (
              <Card
                title="No Active Batch Enrolment"
                subtitle="Your student account does not currently have an active class or batch placement."
              >
                <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-2">
                  <GraduationCap
                    className="w-6 h-6 text-[#687086] dark:text-[#A6B0C3] mx-auto"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                    Not Yet Enrolled in an Active Batch
                  </p>
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3] max-w-md mx-auto">
                    Centre-wide announcements, fee history, and notifications remain accessible. Contact the tuition centre Admin to complete your class and batch enrolment.
                  </p>
                </div>
              </Card>
            )}

            {/* HOME DASHBOARD VIEW */}
            {section === 'home' && dashboard && (
              <>
                {/* Top 4 Essential Metric Cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55] p-4 sm:p-5">
                    <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                      Class & Batch
                    </p>
                    <p className="mt-2 text-lg font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {dashboard.profile.enrolmentStatus === 'active'
                        ? dashboard.profile.className ?? dashboard.profile.classId
                        : 'Not Enrolled'}
                    </p>
                    <p className="mt-1 text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {dashboard.profile.enrolmentStatus === 'active' ? (
                        <>
                          {dashboard.profile.batchName ?? dashboard.profile.batchId} ·{' '}
                          <span className="font-mono">
                            {dashboard.profile.enrolmentId}
                          </span>
                        </>
                      ) : (
                        'Contact Admin for batch assignment'
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-[#F1EEFA] dark:bg-[#202844] border border-[#7552D9]/25 dark:border-[#8B5CF6]/35 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                        Overall Attendance
                      </p>
                      <span className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#C4B5FD]">
                        {dashboard.attendanceSummary.eligibleDenominator > 0
                          ? `${dashboard.attendanceSummary.attendedCount}/${dashboard.attendanceSummary.eligibleDenominator}`
                          : '—'}
                      </span>
                    </div>
                    <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#17172B] dark:text-[#F8FAFC] font-mono tabular-nums">
                      {dashboard.attendanceSummary.percentage === null
                        ? 'N/A'
                        : dashboard.attendanceSummary.displayPercentage}
                    </p>
                    <div className="mt-2.5 h-1.5 rounded-full bg-white/80 dark:bg-[#101426] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#168A62] dark:bg-[#22C58B] transition-[width] duration-300"
                        style={{
                          width: `${Math.min(100, Math.max(0, attendancePct))}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55] p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                        Fee Balance Due
                      </p>
                      <IndianRupee
                        className="w-4 h-4 text-[#7552D9] dark:text-[#A78BFA]"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-[#17172B] dark:text-[#F8FAFC] font-mono tabular-nums">
                      {formatInrFromPaise(
                        dashboard.feeSummary.totalRemainingBalancePaise
                      )}
                    </p>
                    <p className="mt-1 text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {dashboard.feeSummary.feeAccountsCount === 0
                        ? 'No fee account generated yet'
                        : dashboard.feeSummary.nextDueDate
                          ? `Next due: ${formatShortDate(dashboard.feeSummary.nextDueDate)}${
                              dashboard.feeSummary.hasOverdue ? ' (Overdue)' : ''
                            }`
                          : 'All generated fees verified'}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55] p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                        Unread Updates
                      </p>
                      <Bell
                        className="w-4 h-4 text-[#7552D9] dark:text-[#A78BFA]"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-[#17172B] dark:text-[#F8FAFC] font-mono tabular-nums">
                      {dashboard.unreadNotificationCount}
                    </p>
                    <p className="mt-1 text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {dashboard.unreadAnnouncementCount} unread announcement(s)
                    </p>
                  </div>
                </div>

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
                    icon={<NotebookPen className="w-4 h-4" />}
                  />
                  <StatTile
                    label="Upcoming & Open Tests"
                    value={dashboard.upcomingOrAvailableTests.length}
                    caption="Online objective tests"
                    icon={<PlayCircle className="w-4 h-4" />}
                  />
                  <StatTile
                    label="Scheduled Exams"
                    value={dashboard.upcomingExaminations.length}
                    caption="Upcoming or awaiting release"
                    icon={<ClipboardList className="w-4 h-4" />}
                  />
                  <StatTile
                    label="Released Results"
                    value={dashboard.releasedResultsCount}
                    caption={
                      dashboard.unreleasedPendingCount > 0
                        ? `${dashboard.unreleasedPendingCount} awaiting release`
                        : 'All scores published'
                    }
                    icon={<FileSpreadsheet className="w-4 h-4" />}
                  />
                </div>

                {/* Quick Actions Grid (9 destinations) */}
                {onNavigate && (
                  <Card
                    title="Quick Actions"
                    subtitle="Direct one-tap access across your learning, tests, attendance, fees, and profile."
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                      {quickActions.map((qa) => {
                        const Icon = qa.icon;
                        return (
                          <button
                            key={qa.id}
                            type="button"
                            onClick={() => onNavigate(qa.navId, qa.subTab)}
                            className="min-h-[48px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 hover:bg-[#F1EEFA] dark:hover:bg-[#202844] px-3.5 py-2.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
                          >
                            <Icon
                              className="w-4 h-4 text-[#7552D9] dark:text-[#A78BFA] shrink-0"
                              aria-hidden="true"
                            />
                            <span className="text-xs sm:text-sm font-medium text-[#17172B] dark:text-[#F8FAFC] truncate">
                              {qa.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                )}

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
                        <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-5 text-center space-y-1.5">
                          <CheckCircle2
                            className="w-5 h-5 text-[#168A62] dark:text-[#22C58B] mx-auto"
                            aria-hidden="true"
                          />
                          <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                            You are all caught up right now
                          </p>
                          <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                            No pending homework deadlines, open online tests, or upcoming exams at this moment.
                          </p>
                        </div>
                      ) : (
                        <>
                          {dashboard.upcomingOrAvailableTests.slice(0, 2).map((tst) => (
                            <div
                              key={tst.id}
                              className="rounded-xl border border-[#7552D9]/30 dark:border-[#8B5CF6]/40 bg-[#F1EEFA] dark:bg-[#202844] p-3.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-mono font-semibold text-[#7552D9] dark:text-[#C4B5FD]">
                                  Online Test · {tst.subjectName} · {tst.durationMinutes} min
                                </p>
                                <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
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
                              className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-mono text-[#687086] dark:text-[#A6B0C3]">
                                  Homework · {hw.subjectName} · Due{' '}
                                  {formatShortDate(hw.homework.dueAt)}
                                </p>
                                <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
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
                              className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-mono text-[#687086] dark:text-[#A6B0C3]">
                                  Examination · {ex.subjectName} ·{' '}
                                  {formatShortDate(ex.examination.examDate)}
                                </p>
                                <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
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
                            className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5"
                          >
                            <p className="font-mono text-xs font-semibold tabular-nums text-[#7552D9] dark:text-[#A78BFA]">
                              {slot.entry.startTime}–{slot.entry.endTime}
                              {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                              {slot.subjectName}
                            </p>
                            <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                              Teacher: {slot.teacherName}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : sortedTimetable.length > 0 ? (
                      <div className="space-y-2.5">
                        <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                          {todayWeekday
                            ? `No classes scheduled on ${todayWeekday}. Next scheduled slots:`
                            : 'Weekend — upcoming scheduled slots:'}
                        </p>
                        {sortedTimetable.slice(0, 3).map((slot) => (
                          <div
                            key={slot.entry.entryId}
                            className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5"
                          >
                            <p className="font-mono text-xs font-semibold tabular-nums text-[#7552D9] dark:text-[#A78BFA]">
                              {slot.entry.dayOfWeek} · {slot.entry.startTime}–
                              {slot.entry.endTime}
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                              {slot.subjectName}
                            </p>
                            <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                              Teacher: {slot.teacherName}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#687086] dark:text-[#A6B0C3] py-4 text-center">
                        No active sessions scheduled for this batch yet.
                      </p>
                    )}
                  </Card>
                </div>

                {/* Recent Released Results */}
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
                    <div className="flex items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                      <ClipboardList className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>
                        {dashboard.unreleasedPendingCount > 0
                          ? `${dashboard.unreleasedPendingCount} assessment(s) awaiting completion or teacher release.`
                          : 'No released assessment results yet.'}
                      </span>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {dashboard.recentReleasedResults.slice(0, 3).map((res) => (
                        <div
                          key={res.id}
                          className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5 space-y-1"
                        >
                          <p className="text-xs text-[#687086] dark:text-[#A6B0C3] capitalize">
                            {res.subjectName} · {res.sourceType.replace(/_/g, ' ')}
                          </p>
                          <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
                            {res.title}
                          </p>
                          <p className="font-mono text-sm font-bold tabular-nums text-[#168A62] dark:text-[#22C58B]">
                            {res.marksObtained} / {res.maximumMarks} ({res.percentage}%)
                          </p>
                        </div>
                      ))}
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
                    <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-2">
                      <Activity
                        className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                        No recent activity recorded yet
                      </p>
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                        Activity updates appear here when homework, tests, attendance, results, or fee receipts are recorded.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                      {dashboard.recentActivity.map((act) => (
                        <li
                          key={act.id}
                          className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                              <StatusText
                                tone={act.tone}
                                label={act.category.toUpperCase()}
                              />
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {formatDateTime(act.timestamp)}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
                              {act.title}
                            </p>
                            <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
                    <div className="text-sm text-[#687086] dark:text-[#A6B0C3] py-4 text-center">
                      No active subjects mapped to this class yet.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {workspace.subjects.map((sub) => (
                        <div
                          key={sub.subjectId}
                          className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3.5 bg-[#F8F9FC] dark:bg-[#101426]/60 flex items-center gap-3"
                        >
                          <span className="w-9 h-9 rounded-lg bg-[#F1EEFA] dark:bg-[#202844] text-[#7552D9] dark:text-[#A78BFA] inline-flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                              {sub.name}
                            </p>
                            <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
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
                    <div
                      className="inline-flex rounded-xl bg-[#F1EEFA] dark:bg-[#202844] p-0.5 border border-[#E5E7EF] dark:border-[#303A55]"
                      role="group"
                      aria-label="Timetable view mode"
                    >
                      <button
                        type="button"
                        onClick={() => setTimetableViewMode('today')}
                        className={cn(
                          'min-h-[34px] px-2.5 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                          timetableViewMode === 'today'
                            ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white'
                            : 'text-[#687086] dark:text-[#A6B0C3]'
                        )}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimetableViewMode('weekly')}
                        className={cn(
                          'min-h-[34px] px-2.5 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                          timetableViewMode === 'weekly'
                            ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white'
                            : 'text-[#687086] dark:text-[#A6B0C3]'
                        )}
                      >
                        Full Week
                      </button>
                    </div>
                  }
                >
                  {sortedTimetable.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-2">
                      <CalendarClock
                        className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                        No active sessions scheduled for this batch yet
                      </p>
                    </div>
                  ) : timetableViewMode === 'today' ? (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                        {todayWeekday
                          ? `Showing sessions for ${todayWeekday} (Admin default: Today view).`
                          : 'Sunday — no classes today. Switch to Full Week to inspect Monday–Saturday.'}
                      </p>
                      {todaySlots.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-5 text-center text-xs text-[#687086] dark:text-[#A6B0C3]">
                          No classes scheduled for today. Use Full Week above to browse all weekdays.
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {todaySlots.map((slot) => (
                            <div
                              key={slot.entry.entryId}
                              className="rounded-xl border border-[#7552D9]/30 dark:border-[#8B5CF6]/40 p-3.5 bg-[#F1EEFA]/50 dark:bg-[#202844]/70 space-y-1"
                            >
                              <p className="font-mono text-xs font-semibold tabular-nums text-[#7552D9] dark:text-[#C4B5FD]">
                                {slot.entry.startTime}–{slot.entry.endTime}
                                {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                              </p>
                              <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                                {slot.subjectName}
                              </p>
                              <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
                        <div className="flex overflow-x-auto gap-1.5 pb-1">
                          {DAYS_OF_WEEK.map((day) => {
                            const active = selectedDay === day;
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => setSelectedDay(day)}
                                className={cn(
                                  'min-h-[38px] px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer border transition-colors',
                                  active
                                    ? 'bg-[#7552D9] text-white border-[#7552D9] dark:bg-[#8B5CF6] dark:border-[#8B5CF6]'
                                    : 'bg-white dark:bg-[#202844] border-[#E5E7EF] dark:border-[#303A55] text-[#434960] dark:text-[#A6B0C3]'
                                )}
                              >
                                {day.slice(0, 3)}
                              </button>
                            );
                          })}
                        </div>
                        <div className="space-y-2.5">
                          {sortedTimetable.filter((t) => t.entry.dayOfWeek === selectedDay)
                            .length === 0 ? (
                            <p className="text-xs text-[#687086] dark:text-[#A6B0C3] py-4 text-center">
                              No classes scheduled on {selectedDay}.
                            </p>
                          ) : (
                            sortedTimetable
                              .filter((t) => t.entry.dayOfWeek === selectedDay)
                              .map((slot) => (
                                <div
                                  key={slot.entry.entryId}
                                  className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3.5 bg-[#F8F9FC] dark:bg-[#101426]/60"
                                >
                                  <p className="font-mono text-xs font-semibold tabular-nums text-[#7552D9] dark:text-[#A78BFA]">
                                    {slot.entry.startTime}–{slot.entry.endTime}
                                    {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                                    {slot.subjectName}
                                  </p>
                                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
                              className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3.5 bg-[#F8F9FC] dark:bg-[#101426]/60 space-y-2.5"
                            >
                              <h3 className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3]">
                                {day}
                              </h3>
                              {slots.length === 0 ? (
                                <p className="text-xs text-[#687086]/70 dark:text-[#A6B0C3]/70 py-2">
                                  No sessions
                                </p>
                              ) : (
                                slots.map((slot) => (
                                  <div
                                    key={slot.entry.entryId}
                                    className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3 bg-white dark:bg-[#171D34] space-y-1"
                                  >
                                    <p className="font-mono text-xs font-semibold tabular-nums text-[#7552D9] dark:text-[#A78BFA]">
                                      {slot.entry.startTime}–{slot.entry.endTime}
                                    </p>
                                    <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                                      {slot.subjectName}
                                    </p>
                                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
