import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CalendarClock, Megaphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { academicService, isFirebaseConnectedMode } from '../../services';
import type { DayOfWeek, TeacherWorkspaceData } from '../../types';
import { cn } from '../../utils/cn';
import { formatShortDate } from '../../utils/formatters';
import { Card } from '../ui/Card';
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

interface TeacherAcademicWorkspaceProps {
  section: 'classes' | 'notices';
}

export function TeacherAcademicWorkspace({ section }: TeacherAcademicWorkspaceProps) {
  const { principal } = useAuth();
  const [workspace, setWorkspace] = useState<TeacherWorkspaceData | null>(null);
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Monday');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    if (!principal || principal.role !== 'teacher') {
      setError('Teacher account authentication required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await academicService.getMyTeacherWorkspace(principal);
      setWorkspace(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load teacher workspace.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  if (!principal || principal.role !== 'teacher') {
    return (
      <Card title="Access Restricted">
        <p className="text-sm text-red-700 dark:text-red-400">
          This workspace is strictly restricted to authenticated Teacher accounts.
        </p>
      </Card>
    );
  }

  const uniqueClassCount = new Set(
    workspace?.assignments.map((a) => a.classRecord.classId) ?? []
  ).size;
  const uniqueSubjectCount = new Set(
    workspace?.assignments.map((a) => a.subjectRecord.subjectId) ?? []
  ).size;

  const sortedTimetable = [...(workspace?.timetable ?? [])].sort((a, b) =>
    a.entry.startTime.localeCompare(b.entry.startTime)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
            Teacher Operations · Scoped to {principal.loginId} · {isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo'}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] text-balance">
            {section === 'classes'
              ? 'My Assigned Classes & Timetable'
              : 'Relevant Centre Announcements'}
          </h1>
        </div>
        <StatusText tone="nominal" label={`Teacher: ${principal.fullName}`} />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-[#F1EEFA] dark:bg-[#202844] animate-pulse"
            />
          ))}
        </div>
      ) : (
        workspace && (
          <>
            {section === 'classes' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <StatTile
                    label="Assigned Classes"
                    value={uniqueClassCount}
                    caption={`${workspace.assignments.length} batch assignments`}
                  />
                  <StatTile
                    label="My Subjects"
                    value={uniqueSubjectCount}
                    caption="Active curriculum assignments"
                  />
                  <StatTile
                    label="Weekly Sessions"
                    value={workspace.timetable.length}
                    caption="Scheduled slots"
                    className="col-span-2 sm:col-span-1"
                  />
                </div>

                {/* Assigned Classes, Batches & Subjects */}
                <Card
                  title="My Assigned Classes & Subjects"
                  subtitle="Only classes, batches, and subjects actively assigned to your teacher ID appear here."
                >
                  {workspace.assignments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-2">
                      <BookOpen className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto" aria-hidden="true" />
                      <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                        No active class or subject assignments yet
                      </p>
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                        Contact the Admin office when your batch assignments are finalized.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {workspace.assignments.map((item) => (
                        <div
                          key={item.assignment.assignmentId}
                          className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-4 bg-white dark:bg-[#101426]/65 space-y-1.5"
                        >
                          <p className="font-mono text-xs text-[#7552D9] dark:text-[#A78BFA] font-semibold">
                            {item.assignment.assignmentId}
                            {item.subjectRecord.code ? ` · ${item.subjectRecord.code}` : ''}
                          </p>
                          <p className="text-base font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                            {item.subjectRecord.name}
                          </p>
                          <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                            {item.classRecord.name} · {item.batchRecord.name}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Personal Teaching Timetable */}
                <Card
                  title="My Teaching Timetable"
                  subtitle="Weekly schedule filtered exclusively to your active teaching sessions."
                >
                  {sortedTimetable.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-2">
                      <CalendarClock
                        className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                        No active teaching sessions scheduled
                      </p>
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
                                  'min-h-[40px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer border transition-colors',
                                  active
                                    ? 'bg-[#7552D9] text-white border-[#7552D9] dark:bg-[#8B5CF6] dark:border-[#8B5CF6]'
                                    : 'bg-white dark:bg-[#101426] border-[#E5E7EF] dark:border-[#303A55] text-[#687086] dark:text-[#A6B0C3]'
                                )}
                              >
                                {day.slice(0, 3)}
                              </button>
                            );
                          })}
                        </div>
                        <div className="space-y-2.5">
                          {sortedTimetable.filter((t) => t.entry.dayOfWeek === selectedDay).length ===
                          0 ? (
                            <p className="text-xs text-[#687086] dark:text-[#A6B0C3] py-4 text-center">
                              No sessions on {selectedDay}.
                            </p>
                          ) : (
                            sortedTimetable
                              .filter((t) => t.entry.dayOfWeek === selectedDay)
                              .map((slot) => (
                                <div
                                  key={slot.entry.entryId}
                                  className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3.5 bg-white dark:bg-[#101426]/65"
                                >
                                  <p className="font-mono text-xs font-semibold tabular-nums text-[#7552D9] dark:text-[#A78BFA]">
                                    {slot.entry.startTime}–{slot.entry.endTime}
                                    {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                                  </p>
                                  <p className="mt-1 font-semibold text-sm text-[#17172B] dark:text-[#F8FAFC]">
                                    {slot.subjectName}
                                  </p>
                                  <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                                    {slot.className} · {slot.batchName}
                                  </p>
                                </div>
                              ))
                          )}
                        </div>
                      </div>

                      {/* Desktop Weekly Schedule */}
                      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {DAYS_OF_WEEK.map((day) => {
                          const slots = sortedTimetable.filter((t) => t.entry.dayOfWeek === day);
                          return (
                            <div
                              key={day}
                              className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3.5 bg-[#F8F9FC] dark:bg-[#101426]/65 space-y-2.5"
                            >
                              <h3 className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3]">
                                {day}
                              </h3>
                              {slots.length === 0 ? (
                                <p className="text-xs text-[#687086] dark:text-[#A6B0C3] py-2">No sessions</p>
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
                                      {slot.className} · {slot.batchName}
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

            {/* Announcements View (Read-Only) */}
            <Card
              title="Centre Announcements"
              subtitle="Read-only notices published by Admin for teachers or your assigned classes and batches."
            >
              {workspace.announcements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-2">
                  <Megaphone className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto" aria-hidden="true" />
                  <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                    No active announcements for your teaching assignments
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                  {workspace.announcements.map((ann) => (
                    <article key={ann.announcementId} className="py-3.5 first:pt-1 last:pb-1 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {ann.title}
                        </h3>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {formatShortDate(ann.publishedAt ?? ann.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">
                        {ann.content}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </Card>
          </>
        )
      )}
    </div>
  );
}
