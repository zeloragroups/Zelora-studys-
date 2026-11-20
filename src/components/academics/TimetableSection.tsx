import { useState, type FormEvent } from 'react';
import { CalendarClock, Pencil, Plus, Power, X } from 'lucide-react';
import { academicService } from '../../services';
import { AcademicServiceError } from '../../services/contracts/academicService';
import type {
  AccountRecord,
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  DayOfWeek,
  SubjectRecord,
  TeacherAssignment,
  TimetableEntry,
} from '../../types';
import { cn } from '../../utils/cn';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { IconButton } from '../ui/IconButton';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
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

interface TimetableSectionProps {
  actor: AuthPrincipal;
  classes: ClassRecord[];
  batches: BatchRecord[];
  subjects: SubjectRecord[];
  teacherAccounts: AccountRecord[];
  assignments: TeacherAssignment[];
  entries: TimetableEntry[];
  onChanged: (message: string) => void;
}

export function TimetableSection({
  actor,
  classes,
  batches,
  subjects,
  teacherAccounts,
  assignments,
  entries,
  onChanged,
}: TimetableSectionProps) {
  const [classFilter, setClassFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [mobileDay, setMobileDay] = useState<DayOfWeek>('Monday');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>('Monday');
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime] = useState('17:15');
  const [room, setRoom] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeAssignments = assignments.filter((a) => a.status === 'active');

  const classMap = new Map(classes.map((c) => [c.classId, c]));
  const batchMap = new Map(batches.map((b) => [b.batchId, b]));
  const subjectMap = new Map(subjects.map((s) => [s.subjectId, s]));
  const teacherMap = new Map(teacherAccounts.map((t) => [t.accountId.toUpperCase(), t]));

  const filteredEntries = entries
    .filter((t) => {
      if (classFilter !== 'all' && t.classId !== classFilter) return false;
      if (batchFilter !== 'all' && t.batchId !== batchFilter) return false;
      if (
        teacherFilter !== 'all' &&
        t.teacherAccountId.toUpperCase() !== teacherFilter.toUpperCase()
      ) {
        return false;
      }
      if (subjectFilter !== 'all' && t.subjectId !== subjectFilter) return false;
      return true;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const hasFilters =
    classFilter !== 'all' ||
    batchFilter !== 'all' ||
    teacherFilter !== 'all' ||
    subjectFilter !== 'all';

  const openCreate = () => {
    setEditingEntry(null);
    setSelectedAssignmentId(activeAssignments[0]?.assignmentId ?? '');
    setDayOfWeek('Monday');
    setStartTime('17:30');
    setEndTime('18:30');
    setRoom('');
    setFormError(null);
    setModalMode('create');
  };

  const openEdit = (entry: TimetableEntry) => {
    const match = activeAssignments.find(
      (a) =>
        a.classId === entry.classId &&
        a.batchId === entry.batchId &&
        a.subjectId === entry.subjectId &&
        a.teacherAccountId.toUpperCase() === entry.teacherAccountId.toUpperCase()
    );
    setEditingEntry(entry);
    setSelectedAssignmentId(match?.assignmentId ?? activeAssignments[0]?.assignmentId ?? '');
    setDayOfWeek(entry.dayOfWeek);
    setStartTime(entry.startTime);
    setEndTime(entry.endTime);
    setRoom(entry.room ?? '');
    setFormError(null);
    setModalMode('edit');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const assignment = activeAssignments.find(
      (a) => a.assignmentId === selectedAssignmentId
    );
    if (!assignment) {
      setFormError('Select a valid active teacher assignment first.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (modalMode === 'create') {
        const created = await academicService.createTimetableEntry(actor, {
          classId: assignment.classId,
          batchId: assignment.batchId,
          subjectId: assignment.subjectId,
          teacherAccountId: assignment.teacherAccountId,
          dayOfWeek,
          startTime,
          endTime,
          room: room || undefined,
        });
        setModalMode(null);
        onChanged(
          `Scheduled ${created.entryId} on ${created.dayOfWeek} (${created.startTime}–${created.endTime}).`
        );
      } else if (modalMode === 'edit' && editingEntry) {
        const updated = await academicService.updateTimetableEntry(
          actor,
          editingEntry.entryId,
          {
            classId: assignment.classId,
            batchId: assignment.batchId,
            subjectId: assignment.subjectId,
            teacherAccountId: assignment.teacherAccountId,
            dayOfWeek,
            startTime,
            endTime,
            room: room || undefined,
          }
        );
        setModalMode(null);
        onChanged(`Updated timetable session ${updated.entryId}.`);
      }
    } catch (err) {
      setFormError(
        err instanceof AcademicServiceError
          ? err.message
          : 'Unable to save timetable entry.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (entry: TimetableEntry) => {
    setActionError(null);
    const next = entry.status === 'active' ? 'cancelled' : 'active';
    try {
      await academicService.setTimetableEntryStatus(actor, entry.entryId, next);
      onChanged(`Timetable entry ${entry.entryId} marked ${next}.`);
    } catch (err) {
      setActionError(
        err instanceof AcademicServiceError
          ? err.message
          : 'Unable to change timetable session status.'
      );
    }
  };

  const renderEntryCard = (entry: TimetableEntry) => {
    const subject = subjectMap.get(entry.subjectId)?.name ?? entry.subjectId;
    const batch = batchMap.get(entry.batchId)?.name ?? entry.batchId;
    const cls = classMap.get(entry.classId)?.name ?? entry.classId;
    const teacher =
      teacherMap.get(entry.teacherAccountId.toUpperCase())?.name ?? entry.teacherAccountId;

    return (
      <div
        key={entry.entryId}
        className={cn(
          'rounded-xl border p-3 space-y-2 transition-colors',
          entry.status === 'cancelled'
            ? 'border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#252E33]/60 opacity-75'
            : 'border-[#E2E8E5] dark:border-[#344047] bg-white dark:bg-[#1D2429]'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold tabular-nums text-[#168A63] dark:text-[#42DDA9]">
            {entry.startTime}–{entry.endTime}
          </span>
          <StatusText
            tone={entry.status === 'active' ? 'nominal' : 'warning'}
            label={entry.status === 'active' ? 'Active' : 'Cancelled'}
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">{subject}</p>
          <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
            {cls} · {batch}
          </p>
          <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
            {teacher}
            {entry.room ? ` · ${entry.room}` : ''}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[#E2E8E5] dark:border-[#344047]">
          <span className="font-mono text-[11px] text-[#68737C] dark:text-[#AAB6B4]">{entry.entryId}</span>
          <div className="inline-flex items-center gap-1">
            <IconButton
              size="sm"
              variant="ghost"
              label={`Edit ${entry.entryId}`}
              title="Edit session"
              onClick={() => openEdit(entry)}
              icon={<Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
            />
            <IconButton
              size="sm"
              variant="ghost"
              label={`${entry.status === 'active' ? 'Cancel' : 'Restore'} ${entry.entryId}`}
              title={entry.status === 'active' ? 'Cancel session' : 'Restore session'}
              onClick={() => void handleToggleStatus(entry)}
              icon={<Power className="w-3.5 h-3.5" aria-hidden="true" />}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card
      title="Weekly Timetable"
      subtitle="Manual timetable scheduling backed by active teacher assignments. Rejects overlapping batch or teacher time slots."
      action={
        <Button
          size="sm"
          onClick={openCreate}
          disabled={activeAssignments.length === 0}
          iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
        >
          Schedule Session
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Filter Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
          <Select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            aria-label="Filter timetable by class"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            aria-label="Filter timetable by batch"
          >
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.name}
              </option>
            ))}
          </Select>

          <Select
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            aria-label="Filter timetable by teacher"
          >
            <option value="all">All Teachers</option>
            {teacherAccounts.map((t) => (
              <option key={t.accountId} value={t.accountId}>
                {t.name}
              </option>
            ))}
          </Select>

          <Select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            aria-label="Filter timetable by subject"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.name}
              </option>
            ))}
          </Select>

          {hasFilters && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setClassFilter('all');
                setBatchFilter('all');
                setTeacherFilter('all');
                setSubjectFilter('all');
              }}
              iconLeft={<X className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Clear Filters
            </Button>
          )}
        </div>

        {actionError && <Alert tone="error">{actionError}</Alert>}

        {/* Mobile Day Selector (< md) */}
        <div className="md:hidden space-y-4">
          <Tabs
            items={DAYS_OF_WEEK.map((d) => ({ id: d, label: d.slice(0, 3) }))}
            value={mobileDay}
            onChange={setMobileDay}
            ariaLabel="Select day of week"
            className="w-full"
          />

          <div className="space-y-3">
            {filteredEntries.filter((e) => e.dayOfWeek === mobileDay).length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-6 text-center text-xs text-[#68737C] dark:text-[#AAB6B4]">
                No sessions scheduled on {mobileDay}.
              </div>
            ) : (
              filteredEntries.filter((e) => e.dayOfWeek === mobileDay).map(renderEntryCard)
            )}
          </div>
        </div>

        {/* Desktop Weekly Matrix (>= md) */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DAYS_OF_WEEK.map((day) => {
            const dayEntries = filteredEntries.filter((e) => e.dayOfWeek === day);
            return (
              <div
                key={day}
                className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F0F4F2] dark:bg-[#151A1E]/70 p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-[#E2E8E5] dark:border-[#344047]">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                      {day}
                    </h3>
                  </div>
                  <span className="font-mono text-xs text-[#68737C] dark:text-[#AAB6B4] tabular-nums">
                    {dayEntries.filter((e) => e.status === 'active').length} active
                  </span>
                </div>

                {dayEntries.length === 0 ? (
                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] py-4 text-center">
                    No sessions
                  </p>
                ) : (
                  <div className="space-y-2.5">{dayEntries.map(renderEntryCard)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={modalMode !== null}
        onClose={() => setModalMode(null)}
        title={
          modalMode === 'create'
            ? 'Schedule Timetable Session'
            : `Edit ${editingEntry?.entryId ?? 'Session'}`
        }
        subtitle="Conflicts on the same batch or same teacher on the same day are automatically blocked."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <Select
            label="Active Teacher Assignment (Teacher · Subject · Class & Batch)"
            value={selectedAssignmentId}
            onChange={(e) => setSelectedAssignmentId(e.target.value)}
            required
          >
            {activeAssignments.map((asg) => {
              const tName =
                teacherMap.get(asg.teacherAccountId.toUpperCase())?.name ??
                asg.teacherAccountId;
              const sName = subjectMap.get(asg.subjectId)?.name ?? asg.subjectId;
              const bName = batchMap.get(asg.batchId)?.name ?? asg.batchId;
              const cName = classMap.get(asg.classId)?.name ?? asg.classId;
              return (
                <option key={asg.assignmentId} value={asg.assignmentId}>
                  {tName} · {sName} · {cName} ({bName})
                </option>
              );
            })}
          </Select>

          <Select
            label="Day of Week"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek)}
            required
          >
            {DAYS_OF_WEEK.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Time (24h)"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
            <Input
              label="End Time (24h)"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>

          <Input
            label="Room / Classroom (Optional)"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="e.g. Room 201"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalMode(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={!selectedAssignmentId}>
              {modalMode === 'create' ? 'Schedule Session' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
