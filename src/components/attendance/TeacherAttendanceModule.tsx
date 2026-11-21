import { useCallback, useEffect, useState } from 'react';
import {
  CalendarCheck2,
  Eye,
  Save,
  Send,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  AttendanceServiceError,
  type TeacherAttendanceScopeOptions,
} from '../../services/contracts/attendanceService';
import { attendanceService, isFirebaseConnectedMode } from '../../services';
import {
  ATTENDANCE_STATUSES,
  type AttendanceSessionDetail,
  type AttendanceSessionType,
  type AttendanceStatus,
  type TeacherEligibleStudent,
} from '../../types';
import { calculateAttendanceSummary } from '../../utils/attendanceCalculations';
import { cn } from '../../utils/cn';
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { Select } from '../ui/Select';
import { StatusText } from '../ui/StatusText';
import { Tabs } from '../ui/Tabs';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';

type TeacherTab = 'mark' | 'sessions';

interface StudentMarkDraft {
  status?: AttendanceStatus;
  remarks: string;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
};

export function TeacherAttendanceModule() {
  const { principal } = useAuth();
  const [activeTab, setActiveTab] = useState<TeacherTab>('mark');
  const [options, setOptions] = useState<TeacherAttendanceScopeOptions | null>(null);
  const [mySessions, setMySessions] = useState<AttendanceSessionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Marking Workflow Form State
  const [sessionType, setSessionType] = useState<AttendanceSessionType>('regular');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [sessionDate, setSessionDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [selectedTimetableId, setSelectedTimetableId] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [draftSessionId, setDraftSessionId] = useState<string | undefined>(undefined);

  // Loaded Roster & Marks
  const [roster, setRoster] = useState<TeacherEligibleStudent[] | null>(null);
  const [marksMap, setMarksMap] = useState<Record<string, StudentMarkDraft>>({});
  const [rosterLoading, setRosterLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  // Confirm & Detail Modals
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailModal, setDetailModal] = useState<AttendanceSessionDetail | null>(null);

  const loadTeacherData = useCallback(async () => {
    if (!principal || principal.role !== 'teacher') {
      setError('Teacher authorization required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [scopeOpts, sessionsList] = await Promise.all([
        attendanceService.getTeacherAttendanceOptions(principal),
        attendanceService.listMyTeacherSessions(principal),
      ]);
      setOptions(scopeOpts);
      setMySessions(sessionsList);

      // Initialize defaults if none chosen yet
      if (scopeOpts.assignments.length > 0 && !selectedClassId) {
        const first = scopeOpts.assignments[0];
        setSelectedClassId(first.classId);
        setSelectedBatchId(first.batchId);
        setSelectedSubjectId(first.subjectId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load attendance options.');
    } finally {
      setLoading(false);
    }
  }, [principal, selectedClassId]);

  useEffect(() => {
    void loadTeacherData();
  }, [loadTeacherData]);

  if (!principal || principal.role !== 'teacher') {
    return (
      <Alert tone="error" title="Access Restricted">
        Only authenticated Teacher accounts can access Attendance Marking.
      </Alert>
    );
  }

  // Strictly filtered dropdown options based on active TeacherAssignment rows
  const assignedBatchesForClass = (options?.batches ?? []).filter(
    (b) =>
      b.classId === selectedClassId &&
      options?.assignments.some(
        (a) => a.classId === selectedClassId && a.batchId === b.batchId
      )
  );

  const assignedSubjectsForSelection = (options?.subjects ?? []).filter((s) =>
    options?.assignments.some(
      (a) =>
        a.classId === selectedClassId &&
        a.batchId === selectedBatchId &&
        a.subjectId === s.subjectId
    )
  );

  const matchingTimetableSlots = (options?.timetableEntries ?? []).filter(
    (t) =>
      t.classId === selectedClassId &&
      t.batchId === selectedBatchId &&
      t.subjectId === selectedSubjectId
  );

  const handleClassChange = (cid: string) => {
    setSelectedClassId(cid);
    const matchingBatch = (options?.batches ?? []).find(
      (b) =>
        b.classId === cid &&
        options?.assignments.some((a) => a.classId === cid && a.batchId === b.batchId)
    );
    const nextBatchId = matchingBatch?.batchId ?? '';
    setSelectedBatchId(nextBatchId);
    const matchingSub = (options?.subjects ?? []).find((s) =>
      options?.assignments.some(
        (a) =>
          a.classId === cid && a.batchId === nextBatchId && a.subjectId === s.subjectId
      )
    );
    setSelectedSubjectId(matchingSub?.subjectId ?? '');
    setSelectedTimetableId('');
    setRoster(null);
    setDraftSessionId(undefined);
  };

  const handleBatchChange = (bid: string) => {
    setSelectedBatchId(bid);
    const matchingSub = (options?.subjects ?? []).find((s) =>
      options?.assignments.some(
        (a) =>
          a.classId === selectedClassId && a.batchId === bid && a.subjectId === s.subjectId
      )
    );
    setSelectedSubjectId(matchingSub?.subjectId ?? '');
    setSelectedTimetableId('');
    setRoster(null);
    setDraftSessionId(undefined);
  };

  const handleLoadStudents = async () => {
    setRosterLoading(true);
    setWorkflowError(null);
    setBanner(null);
    try {
      const students = await attendanceService.loadEligibleStudentsForBatch(
        principal,
        {
          classId: selectedClassId,
          batchId: selectedBatchId,
          subjectId: selectedSubjectId,
        }
      );
      setRoster(students);
      const nextMap: Record<string, StudentMarkDraft> = {};
      for (const stu of students) {
        nextMap[stu.studentId] = { remarks: '' };
      }
      setMarksMap(nextMap);
      setDraftSessionId(undefined);
    } catch (err) {
      setWorkflowError(
        err instanceof AttendanceServiceError
          ? err.message
          : 'Unable to load eligible enrolled students.'
      );
      setRoster(null);
    } finally {
      setRosterLoading(false);
    }
  };

  const handleResumeDraft = async (sessionDetail: AttendanceSessionDetail) => {
    setActiveTab('mark');
    setWorkflowError(null);
    setBanner(null);
    const s = sessionDetail.session;
    setSessionType(s.sessionType);
    setSelectedClassId(s.classId);
    setSelectedBatchId(s.batchId);
    setSelectedSubjectId(s.subjectId);
    setSessionDate(s.sessionDate);
    setSelectedTimetableId(s.timetableEntryId ?? '');
    setExamTitle(s.examTitle ?? '');
    setDraftSessionId(s.id);

    const students = await attendanceService.loadEligibleStudentsForBatch(principal, {
      classId: s.classId,
      batchId: s.batchId,
      subjectId: s.subjectId,
    });
    const nextMap: Record<string, StudentMarkDraft> = {};
    for (const stu of students) {
      const existing = sessionDetail.records.find(
        (r) => r.record.studentId.toUpperCase() === stu.studentId.toUpperCase()
      );
      nextMap[stu.studentId] = {
        status: existing?.record.status,
        remarks: existing?.record.remarks ?? '',
      };
    }
    setRoster(students);
    setMarksMap(nextMap);
  };

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setMarksMap((prev) => ({
      ...prev,
      [studentId]: {
        status,
        remarks: prev[studentId]?.remarks ?? '',
      },
    }));
  };

  const setStudentRemarks = (studentId: string, remarks: string) => {
    setMarksMap((prev) => ({
      ...prev,
      [studentId]: {
        status: prev[studentId]?.status,
        remarks,
      },
    }));
  };

  const markAllPresent = () => {
    if (!roster) return;
    setMarksMap((prev) => {
      const updated = { ...prev };
      for (const stu of roster) {
        updated[stu.studentId] = {
          status: 'present',
          remarks: updated[stu.studentId]?.remarks ?? '',
        };
      }
      return updated;
    });
  };

  const unmarkedStudents = (roster ?? []).filter((stu) => !marksMap[stu.studentId]?.status);
  const markedStatuses = (roster ?? [])
    .map((stu) => marksMap[stu.studentId]?.status)
    .filter((s): s is AttendanceStatus => Boolean(s));
  const liveSummary = calculateAttendanceSummary(markedStatuses);

  const handleSaveDraft = async () => {
    if (!roster) return;
    setSubmitting(true);
    setWorkflowError(null);
    setBanner(null);
    try {
      const detail = await attendanceService.saveDraftAttendanceSession(principal, {
        draftSessionId,
        sessionDate,
        classId: selectedClassId,
        batchId: selectedBatchId,
        subjectId: selectedSubjectId,
        sessionType,
        timetableEntryId: sessionType === 'regular' ? selectedTimetableId || undefined : undefined,
        examTitle: sessionType === 'examination' ? examTitle : undefined,
        marks: roster.map((stu) => ({
          studentId: stu.studentId,
          status: marksMap[stu.studentId]?.status ?? '',
          remarks: marksMap[stu.studentId]?.remarks || undefined,
        })),
      });
      setDraftSessionId(detail.session.id);
      setBanner(
        `Draft ${detail.session.id} saved (${detail.records.length}/${roster.length} marked). No absence notifications are created for drafts.`
      );
      void loadTeacherData();
    } catch (err) {
      setWorkflowError(
        err instanceof AttendanceServiceError ? err.message : 'Unable to save draft.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!roster) return;
    setSubmitting(true);
    setWorkflowError(null);
    try {
      const submitted = await attendanceService.submitAttendanceSession(principal, {
        draftSessionId,
        sessionDate,
        classId: selectedClassId,
        batchId: selectedBatchId,
        subjectId: selectedSubjectId,
        sessionType,
        timetableEntryId: sessionType === 'regular' ? selectedTimetableId || undefined : undefined,
        examTitle: sessionType === 'examination' ? examTitle : undefined,
        marks: roster.map((stu) => ({
          studentId: stu.studentId,
          status: marksMap[stu.studentId]?.status ?? '',
          remarks: marksMap[stu.studentId]?.remarks || undefined,
        })),
      });
      setConfirmSubmitOpen(false);
      setRoster(null);
      setDraftSessionId(undefined);
      setExamTitle('');
      setBanner(
        `Attendance ${submitted.session.id} submitted successfully (${submitted.summary.presentCount} Present, ${submitted.summary.absentCount} Absent, ${submitted.summary.lateCount} Late, ${submitted.summary.excusedCount} Excused). In-app absence alerts were generated for Absent students.`
      );
      void loadTeacherData();
    } catch (err) {
      setConfirmSubmitOpen(false);
      setWorkflowError(
        err instanceof AttendanceServiceError
          ? err.message
          : 'Unable to submit attendance.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedClassObj = options?.classes.find((c) => c.classId === selectedClassId);
  const selectedBatchObj = options?.batches.find((b) => b.batchId === selectedBatchId);
  const selectedSubjectObj = options?.subjects.find((s) => s.subjectId === selectedSubjectId);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Teacher Attendance Operations · Scoped to ${principal.loginId} · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo'}`}
        title="Daily & Exam Attendance"
        rightSlot={<StatusText tone="nominal" label={`Teacher: ${principal.fullName}`} />}
      />

      {banner && (
        <Alert tone="success" onDismiss={() => setBanner(null)}>
          {banner}
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <Tabs
        ariaLabel="Teacher attendance sections"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { id: 'mark', label: 'Mark Attendance' },
          {
            id: 'sessions',
            label: 'My Attendance History',
            count: mySessions.length,
          },
        ]}
      />

      {loading ? (
        <div className="h-44 rounded-2xl bg-[var(--surface-secondary)] animate-pulse" />
      ) : activeTab === 'mark' ? (
        options && options.assignments.length === 0 ? (
          <Card title="No Active Teaching Assignments">
            <p className="text-sm text-[var(--text-muted)]">
              You have no active class, batch, or subject assignments. Contact the tuition centre Admin to assign your classes before marking attendance.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card
              title="Step 1 — Session & Assigned Cohort"
              subtitle="Only classes, batches, subjects, and non-cancelled timetable slots assigned to your teacher ID are selectable."
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-[var(--text-muted)] mr-1">
                    Session Type:
                  </span>
                  {(
                    [
                      { id: 'regular', label: 'Regular Class' },
                      { id: 'examination', label: 'Examination' },
                    ] as const
                  ).map((t) => {
                    const active = sessionType === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSessionType(t.id);
                          setWorkflowError(null);
                        }}
                        className={cn(
                          'min-h-[42px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-colors cursor-pointer whitespace-nowrap',
                          active
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]'
                            : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:bg-[var(--surface-secondary)]'
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Select
                    label="Assigned Class"
                    value={selectedClassId}
                    onChange={(e) => handleClassChange(e.target.value)}
                  >
                    {(options?.classes ?? []).map((c) => (
                      <option key={c.classId} value={c.classId}>
                        {c.name}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Assigned Batch"
                    value={selectedBatchId}
                    onChange={(e) => handleBatchChange(e.target.value)}
                  >
                    {assignedBatchesForClass.map((b) => (
                      <option key={b.batchId} value={b.batchId}>
                        {b.name}
                      </option>
                    ))}
                  </Select>

                  <Select
                    label="Assigned Subject"
                    value={selectedSubjectId}
                    onChange={(e) => {
                      setSelectedSubjectId(e.target.value);
                      setSelectedTimetableId('');
                      setRoster(null);
                    }}
                  >
                    {assignedSubjectsForSelection.map((s) => (
                      <option key={s.subjectId} value={s.subjectId}>
                        {s.name}
                      </option>
                    ))}
                  </Select>

                  <Input
                    label="Attendance Date"
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    required
                  />
                </div>

                {sessionType === 'regular' ? (
                  <Select
                    label="Scheduled Timetable Session (Optional)"
                    containerClassName="max-w-md"
                    value={selectedTimetableId}
                    onChange={(e) => setSelectedTimetableId(e.target.value)}
                  >
                    <option value="">Daily Regular Session (No specific slot selected)</option>
                    {matchingTimetableSlots.map((tt) => (
                      <option key={tt.entryId} value={tt.entryId}>
                        {tt.dayOfWeek} · {tt.startTime}–{tt.endTime}
                        {tt.room ? ` (${tt.room})` : ''}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div className="max-w-md">
                    <Input
                      label="Examination Title / Reference"
                      value={examTitle}
                      onChange={(e) => setExamTitle(e.target.value)}
                      placeholder="e.g. Monthly Algebra Assessment — Nov 2026"
                      hint="Records exam-day attendance only. Question papers and marks live in Tests & Examinations."
                      required
                    />
                  </div>
                )}

                {workflowError && <Alert tone="error">{workflowError}</Alert>}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    onClick={() => void handleLoadStudents()}
                    loading={rosterLoading}
                    disabled={!selectedClassId || !selectedBatchId || !selectedSubjectId}
                    iconLeft={<Users className="w-4 h-4" aria-hidden="true" />}
                  >
                    Load Enrolled Students
                  </Button>
                  {draftSessionId && (
                    <span className="text-xs font-mono text-[var(--warning)]">
                      Editing Draft {draftSessionId}
                    </span>
                  )}
                </div>
              </div>
            </Card>

            {roster !== null && (
              <Card
                title={`Step 2 — Mark Enrolled Students (${roster.length})`}
                subtitle={`${selectedClassObj?.name ?? ''} · ${selectedBatchObj?.name ?? ''} · ${selectedSubjectObj?.name ?? ''} · ${sessionDate}`}
                action={
                  roster.length > 0 ? (
                    <Button variant="secondary" size="sm" onClick={markAllPresent}>
                      Mark All Present
                    </Button>
                  ) : undefined
                }
              >
                {roster.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-muted)]">
                    No active enrolled students found in this batch. Contact Admin to verify student enrolments.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Live Status Counter Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--border)] text-xs font-mono tabular-nums">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="text-[var(--accent-text)] font-semibold">
                          Present: {liveSummary.presentCount}
                        </span>
                        <span className="text-[var(--error)] font-semibold">
                          Absent: {liveSummary.absentCount}
                        </span>
                        <span className="text-[var(--warning)] font-semibold">
                          Late: {liveSummary.lateCount}
                        </span>
                        <span className="text-[var(--info)] font-semibold">
                          Excused: {liveSummary.excusedCount}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'font-semibold',
                          unmarkedStudents.length > 0
                            ? 'text-[var(--warning)]'
                            : 'text-[var(--accent-text)]'
                        )}
                      >
                        Unmarked: {unmarkedStudents.length}
                      </span>
                    </div>

                    {unmarkedStudents.length > 0 && (
                      <Alert tone="warning">
                        {unmarkedStudents.length} student(s) still unmarked (highlighted below). Unmarked students are never silently defaulted to Absent.
                      </Alert>
                    )}

                    <div className="divide-y divide-[var(--border)]">
                      {roster.map((stu) => {
                        const current = marksMap[stu.studentId]?.status;
                        const remarks = marksMap[stu.studentId]?.remarks ?? '';
                        const unmarked = !current;
                        return (
                          <div
                            key={stu.studentId}
                            className={cn(
                              'py-3.5 px-3 -mx-3 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-colors',
                              unmarked && 'bg-[var(--warning-soft)]'
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-[var(--accent-text)]">
                                  {stu.studentId}
                                </span>
                                {unmarked && (
                                  <span className="text-[11px] font-medium text-[var(--warning)]">
                                    · Unmarked
                                  </span>
                                )}
                              </div>
                              <p className="font-medium text-sm text-[var(--text-primary)]">
                                {stu.studentName}
                              </p>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                              <div
                                className="inline-flex flex-wrap gap-1.5"
                                role="group"
                                aria-label={`Attendance status for ${stu.studentName}`}
                              >
                                {ATTENDANCE_STATUSES.map((st) => {
                                  const selected = current === st;
                                  return (
                                    <button
                                      key={st}
                                      type="button"
                                      aria-pressed={selected}
                                      onClick={() => setStudentStatus(stu.studentId, st)}
                                      className={cn(
                                        'min-h-[44px] px-3 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer',
                                        selected &&
                                          st === 'present' &&
                                          'bg-[var(--success)] text-[var(--accent-contrast)] border-[var(--success)]',
                                        selected &&
                                          st === 'absent' &&
                                          'bg-[var(--error)] text-white border-[var(--error)]',
                                        selected &&
                                          st === 'late' &&
                                          'bg-[var(--warning)] text-[var(--accent-contrast)] border-[var(--warning)]',
                                        selected &&
                                          st === 'excused' &&
                                          'bg-[var(--info)] text-[var(--accent-contrast)] border-[var(--info)]',
                                        !selected &&
                                          'bg-[var(--surface)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--surface-secondary)]'
                                      )}
                                    >
                                      {STATUS_LABELS[st]}
                                    </button>
                                  );
                                })}
                              </div>

                              <input
                                type="text"
                                value={remarks}
                                onChange={(e) =>
                                  setStudentRemarks(stu.studentId, e.target.value)
                                }
                                placeholder="Optional remarks..."
                                aria-label={`Remarks for ${stu.studentName}`}
                                className="min-h-[44px] sm:w-44 rounded-xl px-3.5 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-2 focus:outline-[var(--focus-ring)] transition-colors duration-150"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--border)]">
                      <Button
                        variant="secondary"
                        onClick={() => void handleSaveDraft()}
                        loading={submitting}
                        iconLeft={<Save className="w-4 h-4" aria-hidden="true" />}
                      >
                        Save Draft
                      </Button>

                      <Button
                        onClick={() => {
                          if (unmarkedStudents.length > 0) {
                            setWorkflowError(
                              `Complete all attendance marks before reviewing for submission (${unmarkedStudents.length} student(s) unmarked).`
                            );
                            return;
                          }
                          setWorkflowError(null);
                          setConfirmSubmitOpen(true);
                        }}
                        iconLeft={<Send className="w-4 h-4" aria-hidden="true" />}
                      >
                        Review & Submit Attendance
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )
      ) : (
        /* My Attendance Sessions History */
        <Card
          title="My Submitted & Draft Sessions"
          subtitle="Submitted attendance is locked for teacher edits in this local adapter; contact Admin with a reason if a formal audited correction is required."
        >
          {mySessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center space-y-2">
              <CalendarCheck2 className="w-5 h-5 text-[var(--text-muted)] mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-[var(--text-primary)]">
                No attendance sessions recorded yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {mySessions.map((item) => {
                const s = item.session;
                return (
                  <div
                    key={s.id}
                    className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="font-mono font-semibold text-[var(--accent-text)]">
                          {s.id}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{s.sessionDate}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">
                          {s.sessionType === 'examination'
                            ? `Exam: ${s.examTitle ?? ''}`
                            : 'Regular Class'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {item.subjectName} — {item.className} ({item.batchName})
                      </p>
                      <p className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                        Present: {item.summary.presentCount} · Absent:{' '}
                        {item.summary.absentCount} · Late: {item.summary.lateCount} ·
                        Excused: {item.summary.excusedCount} · Rate:{' '}
                        {item.summary.displayPercentage}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <StatusText
                        tone={
                          s.status === 'submitted'
                            ? 'nominal'
                            : s.status === 'corrected'
                              ? 'warning'
                              : 'neutral'
                        }
                        label={
                          s.status === 'submitted'
                            ? 'Submitted'
                            : s.status === 'corrected'
                              ? 'Corrected'
                              : 'Draft'
                        }
                      />
                      {s.status === 'draft' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleResumeDraft(item)}
                        >
                          Resume Draft
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setDetailModal(item)}
                          iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                          View Details
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Pre-Submission Review Confirmation Modal */}
      <Modal
        open={confirmSubmitOpen}
        onClose={() => setConfirmSubmitOpen(false)}
        title="Review & Confirm Attendance Submission"
        subtitle="Absent students will immediately receive an in-app absence notification upon submission."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] p-3.5 text-xs space-y-1 bg-[var(--surface-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">
              {selectedSubjectObj?.name} — {selectedClassObj?.name} ({selectedBatchObj?.name})
            </p>
            <p className="text-[var(--text-muted)] font-mono tabular-nums">
              Date: {sessionDate} · Type:{' '}
              {sessionType === 'examination'
                ? `Examination (${examTitle})`
                : 'Regular Class'}
            </p>
            <p className="font-mono tabular-nums text-[var(--text-primary)] pt-1">
              Present: {liveSummary.presentCount} · Absent: {liveSummary.absentCount} ·
              Late: {liveSummary.lateCount} · Excused: {liveSummary.excusedCount}
            </p>
          </div>

          <ul className="divide-y divide-[var(--border)] max-h-60 overflow-y-auto">
            {(roster ?? []).map((stu) => {
              const st = marksMap[stu.studentId]?.status ?? 'present';
              return (
                <li
                  key={stu.studentId}
                  className="py-2 flex items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs text-[var(--text-muted)] mr-2">
                      {stu.studentId}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {stu.studentName}
                    </span>
                  </div>
                  <AttendanceStatusBadge status={st} />
                </li>
              );
            })}
          </ul>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => setConfirmSubmitOpen(false)}
            >
              Back to Edit
            </Button>
            <Button loading={submitting} onClick={() => void handleConfirmSubmit()}>
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Submitted Session Read-Only Detail Modal */}
      <Modal
        open={detailModal !== null}
        onClose={() => setDetailModal(null)}
        title={`Attendance Session ${detailModal?.session.id ?? ''}`}
        subtitle={
          detailModal
            ? `${detailModal.subjectName} · ${detailModal.className} · ${detailModal.batchName}`
            : undefined
        }
      >
        {detailModal && (
          <div className="space-y-4">
            <div className="text-xs text-[var(--text-muted)] space-y-1 font-mono tabular-nums">
              <p>
                Date: {detailModal.session.sessionDate} · Submitted:{' '}
                {formatShortDate(
                  detailModal.session.submittedAt ?? detailModal.session.createdAt
                )}
              </p>
              <p>
                Session Attendance Rate: {detailModal.summary.displayPercentage} (
                {detailModal.summary.attendedCount}/
                {detailModal.summary.eligibleDenominator} eligible)
              </p>
            </div>

            <ul className="divide-y divide-[var(--border)] max-h-64 overflow-y-auto">
              {detailModal.records.map((item) => (
                <li
                  key={item.record.id}
                  className="py-2.5 flex items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">
                      {item.studentName}
                    </p>
                    <p className="font-mono text-xs text-[var(--text-muted)]">
                      {item.record.studentId}
                      {item.record.remarks ? ` · ${item.record.remarks}` : ''}
                    </p>
                  </div>
                  <AttendanceStatusBadge
                    status={item.record.status}
                    corrected={item.record.corrected}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
