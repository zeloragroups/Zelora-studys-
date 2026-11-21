import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CalendarClock, Megaphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { academicService, isFirebaseConnectedMode } from '../../services';
import type { DayOfWeek, TeacherWorkspaceData } from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
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
        <p className="text-sm text-[var(--error)]">
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
      <PageHeader
        eyebrow={`Teacher Operations · Scoped to ${principal.loginId} · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo'}`}
        title={
          section === 'classes'
            ? 'My Assigned Classes & Timetable'
            : 'Relevant Centre Announcements'
        }
        rightSlot={<StatusText tone="nominal" label={`Teacher: ${principal.fullName}`} />}
      />

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-[var(--surface-secondary)] animate-pulse"
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
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center space-y-2">
                      <BookOpen className="w-5 h-5 text-[var(--text-muted)] mx-auto" aria-hidden="true" />
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        No active class or subject assignments yet
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Contact the Admin office when your batch assignments are finalized.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {workspace.assignments.map((item) => (
                        <div
                          key={item.assignment.assignmentId}
                          className="rounded-xl border border-[var(--border)] p-4 bg-[var(--surface-secondary)] space-y-1.5"
                        >
                          <p className="font-mono text-xs text-[var(--accent-text)] font-semibold">
                            {item.assignment.assignmentId}
                            {item.subjectRecord.code ? ` · ${item.subjectRecord.code}` : ''}
                          </p>
                          <p className="text-base font-semibold text-[var(--text-primary)]">
                            {item.subjectRecord.name}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
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
                    <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center space-y-2">
                      <CalendarClock
                        className="w-5 h-5 text-[var(--text-muted)] mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        No active teaching sessions scheduled
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Mobile Day Selector */}
                      <div className="md:hidden space-y-3">
                        <Tabs
                          ariaLabel="Select teaching day"
                          value={selectedDay}
                          onChange={setSelectedDay}
                          items={DAYS_OF_WEEK.map((day) => ({
                            id: day,
                            label: day.slice(0, 3),
                          }))}
                        />
                        <div className="space-y-2.5">
                          {sortedTimetable.filter((t) => t.entry.dayOfWeek === selectedDay).length ===
                          0 ? (
                            <p className="text-xs text-[var(--text-muted)] py-4 text-center">
                              No sessions on {selectedDay}.
                            </p>
                          ) : (
                            sortedTimetable
                              .filter((t) => t.entry.dayOfWeek === selectedDay)
                              .map((slot) => (
                                <div
                                  key={slot.entry.entryId}
                                  className="rounded-xl border border-[var(--border)] p-3.5 bg-[var(--surface-secondary)]"
                                >
                                  <p className="font-mono text-xs font-semibold tabular-nums text-[var(--accent-text)]">
                                    {slot.entry.startTime}–{slot.entry.endTime}
                                    {slot.entry.room ? ` · ${slot.entry.room}` : ''}
                                  </p>
                                  <p className="mt-1 font-semibold text-sm text-[var(--text-primary)]">
                                    {slot.subjectName}
                                  </p>
                                  <p className="text-xs text-[var(--text-muted)]">
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
                              className="rounded-xl border border-[var(--border)] p-3.5 bg-[var(--surface-secondary)] space-y-2.5"
                            >
                              <h3 className="text-xs font-semibold text-[var(--text-muted)]">
                                {day}
                              </h3>
                              {slots.length === 0 ? (
                                <p className="text-xs text-[var(--text-muted)] py-2">No sessions</p>
                              ) : (
                                slots.map((slot) => (
                                  <div
                                    key={slot.entry.entryId}
                                    className="rounded-xl border border-[var(--border)] p-3 bg-[var(--surface)] space-y-1"
                                  >
                                    <p className="font-mono text-xs font-semibold tabular-nums text-[var(--accent-text)]">
                                      {slot.entry.startTime}–{slot.entry.endTime}
                                    </p>
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                                      {slot.subjectName}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)]">
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
                <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center space-y-2">
                  <Megaphone className="w-5 h-5 text-[var(--text-muted)] mx-auto" aria-hidden="true" />
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    No active announcements for your teaching assignments
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {workspace.announcements.map((ann) => (
                    <article key={ann.announcementId} className="py-3.5 first:pt-1 last:pb-1 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          {ann.title}
                        </h3>
                        <span className="font-mono tabular-nums text-xs text-[var(--text-muted)]">
                          {formatShortDate(ann.publishedAt ?? ann.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line">
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
