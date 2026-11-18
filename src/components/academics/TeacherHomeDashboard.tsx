import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  Megaphone,
  NotebookPen,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import { academicService } from '../../services';
import { examinationService } from '../../services';
import { homeworkService } from '../../services';
import { testService } from '../../services';
import type {
  DayOfWeek,
  ExaminationDetailView,
  TeacherHomeworkSummaryItem,
  TeacherObjectiveTestSummary,
  TeacherWorkspaceData,
} from '../../types';
import { formatShortDate } from '../../utils/formatters';
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${branding.centreName} · ${publicSettings.academicDefaults.academicYearDisplay} · ${principal.loginId}`}
        title={`Welcome back, ${principal.fullName}`}
        subtitle="Mark attendance quickly, inspect today’s timetable, track pending homework reviews, and manage tests & exams."
        rightSlot={<StatusText tone="nominal" label="Teacher Active" />}
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
            {/* Key Daily KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Assigned Classes"
                value={uniqueClasses}
                caption={`${workspace.assignments.length} batch assignment(s)`}
                icon={<BookOpen className="w-4 h-4" />}
              />
              <StatTile
                label="My Subjects"
                value={uniqueSubjects}
                caption={`${workspace.timetable.length} weekly session(s)`}
                icon={<CalendarClock className="w-4 h-4" />}
              />
              <StatTile
                label="Homework to Review"
                value={pendingHwReviews}
                caption={`${homeworkList.length} homework created`}
                icon={<NotebookPen className="w-4 h-4" />}
                accent={pendingHwReviews > 0}
              />
              <StatTile
                label="Tests & Exams"
                value={activeTestsCount + upcomingExamsCount}
                caption={`${activeTestsCount} tests · ${upcomingExamsCount} scheduled exams`}
                icon={<FileSpreadsheet className="w-4 h-4" />}
              />
            </div>

            {/* Quick Action Cards */}
            <Card
              title="Quick Teacher Actions"
              subtitle="Jump straight into your primary daily classroom operations."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <button
                  type="button"
                  onClick={() => onNavigate('attendance')}
                  className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F1EEFA] dark:bg-[#202844] hover:border-[#7552D9] dark:hover:border-[#8B5CF6] p-4 text-left transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <CalendarCheck2 className="w-5 h-5 text-[#7552D9] dark:text-[#C4B5FD]" aria-hidden="true" />
                    <ArrowRight className="w-4 h-4 text-[#7552D9] dark:text-[#C4B5FD]" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    Mark Attendance
                  </p>
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                    Daily or exam attendance
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('homework')}
                  className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 hover:border-[#7552D9] dark:hover:border-[#8B5CF6] p-4 text-left transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <NotebookPen className="w-5 h-5 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                    <ArrowRight className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3]" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    Assign & Review Homework
                  </p>
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                    Text-only tasks & feedback
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('assessments')}
                  className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 hover:border-[#7552D9] dark:hover:border-[#8B5CF6] p-4 text-left transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <ClipboardCheck className="w-5 h-5 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                    <ArrowRight className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3]" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    Tests & Exam Marks
                  </p>
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                    MCQ builder & marks entry
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('classes')}
                  className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 hover:border-[#7552D9] dark:hover:border-[#8B5CF6] p-4 text-left transition-colors cursor-pointer space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <BookOpen className="w-5 h-5 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                    <ArrowRight className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3]" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    Classes & Timetable
                  </p>
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                    Full weekly schedule
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('salary')}
                  className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 hover:border-[#7552D9] dark:hover:border-[#8B5CF6] p-4 text-left transition-colors cursor-pointer space-y-2 sm:col-span-2 lg:col-span-1"
                >
                  <div className="flex items-center justify-between">
                    <Banknote className="w-5 h-5 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                    <ArrowRight className="w-4 h-4 text-[#687086] dark:text-[#A6B0C3]" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    My Salary
                  </p>
                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                    Structure & payout history
                  </p>
                </button>
              </div>
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
                        className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="font-mono text-xs font-semibold tabular-nums text-[#7552D9] dark:text-[#A78BFA]">
                            {slot.entry.startTime}–{slot.entry.endTime}
                            {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                            {slot.subjectName}
                          </p>
                          <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {todayWeekday
                        ? `No sessions scheduled on ${todayWeekday}. Showing upcoming weekly sessions:`
                        : 'Weekend — showing upcoming weekly sessions:'}
                    </p>
                    {sortedTimetable.slice(0, 3).map((slot) => (
                      <div
                        key={slot.entry.entryId}
                        className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5"
                      >
                        <p className="font-mono text-xs font-semibold tabular-nums text-[#7552D9] dark:text-[#A78BFA]">
                          {slot.entry.dayOfWeek} · {slot.entry.startTime}–{slot.entry.endTime}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                          {slot.subjectName}
                        </p>
                        <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                          {slot.className} · {slot.batchName}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#687086] dark:text-[#A6B0C3] py-4 text-center">
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
                    <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                      No active assignments yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {workspace.assignments.slice(0, 4).map((item) => (
                        <div
                          key={item.assignment.assignmentId}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
                              {item.subjectRecord.name}
                            </p>
                            <p className="text-xs text-[#687086] dark:text-[#A6B0C3] truncate">
                              {item.classRecord.name} · {item.batchRecord.name}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA] shrink-0">
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
                    <div className="flex items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                      <Megaphone className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>No active announcements right now.</span>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                      {workspace.announcements.slice(0, 2).map((ann) => (
                        <div key={ann.announcementId} className="py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC] truncate">
                              {ann.title}
                            </p>
                            <span className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3] shrink-0">
                              {formatShortDate(ann.publishedAt ?? ann.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#687086] dark:text-[#A6B0C3] line-clamp-2">
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
