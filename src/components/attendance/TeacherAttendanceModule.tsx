import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
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
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { StatusText } from '../ui/StatusText';
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
      <Card title="Access Restricted">
        <p className="text-sm text-red-700 dark:text-red-400">
          Only authenticated Teacher accounts can access Attendance Marking.
        </p>
      </Card>
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
            Teacher Attendance Operations · Scoped to {principal.loginId} · {isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo'}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] text-balance">
            Daily & Exam Attendance
          </h1>
        </div>
        <StatusText tone="nominal" label={`Teacher: ${principal.fullName}`} />
      </div>

      {banner && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-xs sm:text-sm font-medium text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{banner}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F1EEFA] dark:bg-[#202844]"
        role="tablist"
        aria-label="Teacher attendance sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'mark'}
          onClick={() => setActiveTab('mark')}
          className={cn(
            'min-h-[40px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
            activeTab === 'mark'
              ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white shadow-xs'
              : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
          )}
        >
          Mark Attendance
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sessions'}
          onClick={() => setActiveTab('sessions')}
          className={cn(
            'min-h-[40px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer',
            activeTab === 'sessions'
              ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white shadow-xs'
              : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
          )}
        >
          My Attendance History ({mySessions.length})
        </button>
      </div>

      {loading ? (
        <div className="h-44 rounded-2xl bg-[#F1EEFA] dark:bg-[#202844] animate-pulse" />
      ) : activeTab === 'mark' ? (
        options && options.assignments.length === 0 ? (
          <Card title="No Active Teaching Assignments">
            <p className="text-sm text-slate-600 dark:text-slate-400">
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
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 mr-1">
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
                            ? 'bg-[#7552D9] text-white border-[#7552D9] dark:bg-[#8B5CF6] dark:border-[#8B5CF6]'
                            : 'bg-white dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] border-[#E5E7EF] dark:border-[#303A55] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                      Assigned Class
                    </label>
                    <select
                      value={selectedClassId}
                      onChange={(e) => handleClassChange(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl px-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                    >
                      {(options?.classes ?? []).map((c) => (
                        <option key={c.classId} value={c.classId}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                      Assigned Batch
                    </label>
                    <select
                      value={selectedBatchId}
                      onChange={(e) => handleBatchChange(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl px-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                    >
                      {assignedBatchesForClass.map((b) => (
                        <option key={b.batchId} value={b.batchId}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                      Assigned Subject
                    </label>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => {
                        setSelectedSubjectId(e.target.value);
                        setSelectedTimetableId('');
                        setRoster(null);
                      }}
                      className="w-full min-h-[44px] rounded-xl px-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                    >
                      {assignedSubjectsForSelection.map((s) => (
                        <option key={s.subjectId} value={s.subjectId}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Input
                    label="Attendance Date"
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    required
                  />
                </div>

                {sessionType === 'regular' ? (
                  <div className="space-y-1.5 max-w-md">
                    <label className="block text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                      Scheduled Timetable Session (Optional)
                    </label>
                    <select
                      value={selectedTimetableId}
                      onChange={(e) => setSelectedTimetableId(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl px-3 py-2 text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                    >
                      <option value="">Daily Regular Session (No specific slot selected)</option>
                      {matchingTimetableSlots.map((tt) => (
                        <option key={tt.entryId} value={tt.entryId}>
                          {tt.dayOfWeek} · {tt.startTime}–{tt.endTime}
                          {tt.room ? ` (${tt.room})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="max-w-md">
                    <Input
                      label="Examination Title / Reference"
                      value={examTitle}
                      onChange={(e) => setExamTitle(e.target.value)}
                      placeholder="e.g. Monthly Algebra Assessment — Nov 2026"
                      hint="Records exam-day attendance only. Question papers and marks belong to Phase 6."
                      required
                    />
                  </div>
                )}

                {workflowError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs sm:text-sm text-red-800 dark:text-red-300"
                  >
                    {workflowError}
                  </div>
                )}

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
                    <span className="text-xs font-mono text-amber-700 dark:text-amber-400">
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
                  <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center text-sm text-[#687086] dark:text-[#A6B0C3]">
                    No active enrolled students found in this batch. Contact Admin to verify student enrolments.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Live Status Counter Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E5E7EF] dark:border-[#303A55] text-xs font-mono tabular-nums">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          Present: {liveSummary.presentCount}
                        </span>
                        <span className="text-red-700 dark:text-red-400 font-semibold">
                          Absent: {liveSummary.absentCount}
                        </span>
                        <span className="text-amber-700 dark:text-amber-400 font-semibold">
                          Late: {liveSummary.lateCount}
                        </span>
                        <span className="text-slate-600 dark:text-slate-400 font-semibold">
                          Excused: {liveSummary.excusedCount}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'font-semibold',
                          unmarkedStudents.length > 0
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        )}
                      >
                        Unmarked: {unmarkedStudents.length}
                      </span>
                    </div>

                    {unmarkedStudents.length > 0 && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>
                          {unmarkedStudents.length} student(s) still unmarked (highlighted below). Unmarked students are never silently defaulted to Absent.
                        </span>
                      </div>
                    )}

                    <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                      {roster.map((stu) => {
                        const current = marksMap[stu.studentId]?.status;
                        const remarks = marksMap[stu.studentId]?.remarks ?? '';
                        const unmarked = !current;
                        return (
                          <div
                            key={stu.studentId}
                            className={cn(
                              'py-3.5 px-3 -mx-3 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-colors',
                              unmarked && 'bg-[#F5B942]/10 dark:bg-[#F5B942]/10'
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                                  {stu.studentId}
                                </span>
                                {unmarked && (
                                  <span className="text-[11px] font-medium text-[#B7791F] dark:text-[#F5B942]">
                                    · Unmarked
                                  </span>
                                )}
                              </div>
                              <p className="font-medium text-sm text-[#17172B] dark:text-[#F8FAFC]">
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
                                          'bg-[#168A62] text-white border-[#168A62] dark:bg-[#22C58B] dark:border-[#22C58B] dark:text-[#101426]',
                                        selected &&
                                          st === 'absent' &&
                                          'bg-[#D94C5C] text-white border-[#D94C5C] dark:bg-[#F16B75] dark:border-[#F16B75] dark:text-[#101426]',
                                        selected &&
                                          st === 'late' &&
                                          'bg-[#B7791F] text-white border-[#B7791F] dark:bg-[#F5B942] dark:border-[#F5B942] dark:text-[#101426]',
                                        selected &&
                                          st === 'excused' &&
                                          'bg-[#7552D9] text-white border-[#7552D9] dark:bg-[#8B5CF6] dark:border-[#8B5CF6]',
                                        !selected &&
                                          'bg-white dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] border-[#E5E7EF] dark:border-[#303A55] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
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
                                className="min-h-[44px] sm:w-44 rounded-xl px-3 py-1.5 text-xs bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#E5E7EF] dark:border-[#303A55]">
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
            <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-8 text-center space-y-2">
              <CalendarCheck2 className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                No attendance sessions recorded yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
              {mySessions.map((item) => {
                const s = item.session;
                return (
                  <div
                    key={s.id}
                    className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                        <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
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
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {item.subjectName} — {item.className} ({item.batchName})
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
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
          <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-3.5 text-xs space-y-1 bg-[#F1EEFA]/60 dark:bg-[#101426]">
            <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
              {selectedSubjectObj?.name} — {selectedClassObj?.name} ({selectedBatchObj?.name})
            </p>
            <p className="text-[#687086] dark:text-[#A6B0C3] font-mono tabular-nums">
              Date: {sessionDate} · Type:{' '}
              {sessionType === 'examination'
                ? `Examination (${examTitle})`
                : 'Regular Class'}
            </p>
            <p className="font-mono tabular-nums text-[#17172B] dark:text-[#F8FAFC] pt-1">
              Present: {liveSummary.presentCount} · Absent: {liveSummary.absentCount} ·
              Late: {liveSummary.lateCount} · Excused: {liveSummary.excusedCount}
            </p>
          </div>

          <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] max-h-60 overflow-y-auto">
            {(roster ?? []).map((stu) => {
              const st = marksMap[stu.studentId]?.status ?? 'present';
              return (
                <li
                  key={stu.studentId}
                  className="py-2 flex items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs text-slate-500 mr-2">
                      {stu.studentId}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
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
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 font-mono tabular-nums">
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

            <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] max-h-64 overflow-y-auto">
              {detailModal.records.map((item) => (
                <li
                  key={item.record.id}
                  className="py-2.5 flex items-center justify-between gap-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {item.studentName}
                    </p>
                    <p className="font-mono text-xs text-slate-500">
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
