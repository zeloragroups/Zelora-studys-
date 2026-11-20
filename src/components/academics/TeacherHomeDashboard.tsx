import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarClock,
  FileSpreadsheet,
  Megaphone,
  NotebookPen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import {
  academicService,
  examinationService,
  homeworkService,
  testService,
} from '../../services';
import type {
  DayOfWeek,
  ExaminationDetailView,
  TeacherHomeworkSummaryItem,
  TeacherObjectiveTestSummary,
  TeacherWorkspaceData,
} from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { ComparisonBarChart, type BarChartDatum } from '../charts/AnalyticsCharts';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';

interface TeacherHomeDashboardProps {
  onNavigate: (navId: string) => void;
}

const WEEKDAY_NAMES: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function getTodayWeekday(): DayOfWeek | null {
  const dayIndex = new Date().getDay(); // 0 = Sun, 1 = Mon .. 6 = Sat
  if (dayIndex === 0) return null;
  return WEEKDAY_NAMES[dayIndex - 1] ?? null;
}

export function TeacherHomeDashboard({ onNavigate }: TeacherHomeDashboardProps) {
  const { principal } = useAuth();
  const { branding, publicSettings } = useInterface();
  const [workspace, setWorkspace] = useState<TeacherWorkspaceData | null>(null);
  const [homeworkList, setHomeworkList] = useState<TeacherHomeworkSummaryItem[]>([]);
  const [testsList, setTestsList] = useState<TeacherObjectiveTestSummary[]>([]);
  const [examsList, setExamsList] = useState<ExaminationDetailView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHome = useCallback(async () => {
    if (!principal || principal.role !== 'teacher') {
      setError('Teacher authentication is required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ws, hw, tst, exm] = await Promise.all([
        academicService.getMyTeacherWorkspace(principal),
        homeworkService.listTeacherHomework(principal),
        testService.listTeacherTests(principal),
        examinationService.listTeacherExaminations(principal),
      ]);
      setWorkspace(ws);
      setHomeworkList(hw);
      setTestsList(tst);
      setExamsList(exm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load teacher home.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  if (!principal || principal.role !== 'teacher') {
    return null;
  }

  const uniqueClasses = new Set(workspace?.assignments.map((a) => a.classRecord.classId) ?? []).size;
  const uniqueSubjects = new Set(workspace?.assignments.map((a) => a.subjectRecord.subjectId) ?? []).size;
  const pendingHwReviews = homeworkList.reduce(
    (sum, item) => sum + Math.max(0, item.submittedCount - item.reviewedCount),
    0
  );
  const activeTestsCount = testsList.filter(
    (t) => t.effectiveStatus === 'active' || t.effectiveStatus === 'published'
  ).length;
  const upcomingExamsCount = examsList.filter((e) => e.examination.status === 'published').length;

  const todayWeekday = getTodayWeekday();
  const sortedTimetable = [...(workspace?.timetable ?? [])].sort((a, b) =>
    a.entry.startTime.localeCompare(b.entry.startTime)
  );
  const todaySlots = todayWeekday
    ? sortedTimetable.filter((slot) => slot.entry.dayOfWeek === todayWeekday)
    : [];

  const homeworkBars: BarChartDatum[] = homeworkList.slice(0, 5).map((item) => ({
    id: item.homework.id,
    label: item.homework.title,
    value: item.submittedCount,
    maxValue: Math.max(1, item.totalAssignedStudents),
    displayValue: `${item.submittedCount}/${item.totalAssignedStudents}`,
    helperText: `${item.reviewedCount} reviewed`,
    tone:
      item.submittedCount >= item.totalAssignedStudents && item.totalAssignedStudents > 0
        ? 'mint'
        : item.pendingCount > 0
          ? 'warning'
          : 'charcoal',
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${branding.centreName} · ${publicSettings.academicDefaults.academicYearDisplay} · ${principal.loginId}`}
        title={`Welcome back, ${principal.fullName}`}
        subtitle="Mark attendance quickly, inspect today’s timetable, track pending homework reviews, and manage tests & exams."
        rightSlot={<StatusText tone="nominal" label="Teacher Active" />}
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
            {/* Teacher Charcoal Daily Teaching Pulse */}
            <Card variant="charcoal" padding="md">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-1.5 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#42DDA9]">
                    {todayWeekday ? `${todayWeekday} Teaching Focus` : 'Teaching Workspace'} · {principal.loginId}
                  </p>
                  <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-[#F4F7F6] truncate">
                    {uniqueClasses} Assigned Class{uniqueClasses === 1 ? '' : 'es'} · {uniqueSubjects} Subject{uniqueSubjects === 1 ? '' : 's'}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#AAB6B4]">
                    {workspace.assignments.length} active batch assignment(s) and {workspace.timetable.length} scheduled weekly session(s).
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 sm:gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 lg:border-l border-[#343C42] lg:pl-6 shrink-0">
                  <div>
                    <p className="text-[11px] text-[#AAB6B4]">Today’s Classes</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums text-[#F4F7F6]">
                      {todaySlots.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#AAB6B4]">Pending Reviews</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums text-[#42DDA9]">
                      {pendingHwReviews}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#AAB6B4]">Tests & Exams</p>
                    <p className="mt-1 text-base sm:text-lg font-semibold font-mono tabular-nums text-[#F4F7F6]">
                      {activeTestsCount + upcomingExamsCount}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Key Daily KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Assigned Classes"
                value={uniqueClasses}
                caption={`${workspace.assignments.length} batch assignment(s)`}
                icon={<BookOpen className="w-4 h-4" strokeWidth={1.75} />}
              />
              <StatTile
                label="My Subjects"
                value={uniqueSubjects}
                caption={`${workspace.timetable.length} weekly session(s)`}
                icon={<CalendarClock className="w-4 h-4" strokeWidth={1.75} />}
              />
              <StatTile
                label="Homework to Review"
                value={pendingHwReviews}
                caption={`${homeworkList.length} homework created`}
                icon={<NotebookPen className="w-4 h-4" strokeWidth={1.75} />}
                tone={pendingHwReviews > 0 ? 'mint' : 'default'}
              />
              <StatTile
                label="Tests & Exams"
                value={activeTestsCount + upcomingExamsCount}
                caption={`${activeTestsCount} tests · ${upcomingExamsCount} scheduled exams`}
                icon={<FileSpreadsheet className="w-4 h-4" strokeWidth={1.75} />}
              />
            </div>

            {/* Real-Data Homework Submission Progress Chart */}
            <Card
              title="Homework Submission Progress"
              subtitle="Submitted vs assigned batch student counts across recent homework"
            >
              <ComparisonBarChart
                data={homeworkBars}
                emptyTitle="No homework assigned yet"
                emptyDescription="Homework submission progress bars will appear once you assign homework to a batch."
                ariaLabel="Homework submission progress"
              />
            </Card>

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Today's Timetable Preview */}
              <Card
                title={todayWeekday ? `Today’s Schedule (${todayWeekday})` : 'Teaching Schedule'}
                subtitle="Filtered to your assigned classes and batches."
                action={
                  <Button variant="ghost" size="sm" onClick={() => onNavigate('classes')}>
                    Full Timetable
                  </Button>
                }
              >
                {todaySlots.length > 0 ? (
                  <div className="space-y-2.5">
                    {todaySlots.map((slot) => (
                      <div
                        key={slot.entry.entryId}
                        className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3.5 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="font-mono text-xs font-semibold tabular-nums text-[#168A63] dark:text-[#42DDA9]">
                            {slot.entry.startTime}–{slot.entry.endTime}
                            {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                            {slot.subjectName}
                          </p>
                          <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                            {slot.className} · {slot.batchName}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onNavigate('attendance')}
                        >
                          Attendance
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : sortedTimetable.length > 0 ? (
                  <div className="space-y-2.5">
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      {todayWeekday
                        ? `No sessions scheduled on ${todayWeekday}. Showing upcoming weekly sessions:`
                        : 'Weekend — showing upcoming weekly sessions:'}
                    </p>
                    {sortedTimetable.slice(0, 3).map((slot) => (
                      <div
                        key={slot.entry.entryId}
                        className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] p-3.5"
                      >
                        <p className="font-mono text-xs font-semibold tabular-nums text-[#168A63] dark:text-[#42DDA9]">
                          {slot.entry.dayOfWeek} · {slot.entry.startTime}–{slot.entry.endTime}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                          {slot.subjectName}
                        </p>
                        <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                          {slot.className} · {slot.batchName}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#68737C] dark:text-[#AAB6B4] py-4 text-center">
                    No active teaching sessions scheduled yet.
                  </p>
                )}
              </Card>

              {/* Assigned Batches & Announcements */}
              <div className="space-y-5">
                <Card
                  title="Assigned Classes & Batches"
                  subtitle="Subjects actively linked to your Teacher ID"
                >
                  {workspace.assignments.length === 0 ? (
                    <p className="text-sm text-[#68737C] dark:text-[#AAB6B4]">
                      No active assignments yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {workspace.assignments.slice(0, 4).map((item) => (
                        <div
                          key={item.assignment.assignmentId}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33] px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                              {item.subjectRecord.name}
                            </p>
                            <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] truncate">
                              {item.classRecord.name} · {item.batchRecord.name}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9] shrink-0">
                            {item.assignment.assignmentId}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card
                  title="Recent Notices"
                  action={
                    <Button variant="ghost" size="sm" onClick={() => onNavigate('notices')}>
                      View All
                    </Button>
                  }
                >
                  {workspace.announcements.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      <Megaphone className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>No active announcements right now.</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
                      {workspace.announcements.slice(0, 2).map((ann) => (
                        <div key={ann.announcementId} className="py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                              {ann.title}
                            </p>
                            <span className="font-mono tabular-nums text-xs text-[#68737C] dark:text-[#AAB6B4] shrink-0">
                              {formatShortDate(ann.publishedAt ?? ann.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#68737C] dark:text-[#AAB6B4] line-clamp-2">
                            {ann.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
