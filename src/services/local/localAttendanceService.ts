import {
  ATTENDANCE_STATUSES,
  hasPermission,
  type AbsenceNotification,
  type AdminAttendanceOverview,
  type AdminClassAttendanceBreakdown,
  type AttendanceAuditEntry,
  type AttendanceRecord,
  type AttendanceSession,
  type AttendanceSessionDetail,
  type AttendanceStatus,
  type AuthPrincipal,
  type StudentAttendanceDashboardData,
  type StudentAttendanceHistoryItem,
  type TeacherEligibleStudent,
} from '../../types';
import { calculateAttendanceSummary } from '../../utils/attendanceCalculations';
import { validateIsoDate, validateRequiredText } from '../../utils/validation';
import {
  type AdminAttendanceFilter,
  AttendanceServiceError,
  type IAttendanceService,
  type SaveAttendanceDraftInput,
  type StudentAttendanceFilter,
  type SubmitAttendanceInput,
  type TeacherAttendanceScopeOptions,
} from '../contracts/attendanceService';
import {
  formatAttendanceId,
  LocalAttendanceStore,
  sharedLocalAttendanceStore,
} from './localAttendanceStore';

function isValidAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === 'string' && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

function capitalizeStatus(status: AttendanceStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export class LocalDevAttendanceService implements IAttendanceService {
  private readonly store: LocalAttendanceStore;

  constructor(store: LocalAttendanceStore = sharedLocalAttendanceStore) {
    this.store = store;
  }

  private get academicStore() {
    return this.store.academicStore;
  }

  private get accountStore() {
    return this.store.academicStore.accountStore;
  }

  private requireActiveActor(actor: AuthPrincipal | null): AuthPrincipal {
    if (!actor) {
      throw new AttendanceServiceError('UNAUTHORIZED', 'Authentication is required.');
    }
    if (actor.status !== 'active') {
      throw new AttendanceServiceError('UNAUTHORIZED', 'Active account status is required.');
    }
    if (actor.role !== 'admin') {
      const acc = this.accountStore.findAccountById(actor.loginId);
      if (!acc || acc.status !== 'active') {
        throw new AttendanceServiceError('UNAUTHORIZED', 'Account is deactivated or not found.');
      }
    }
    return actor;
  }

  private requireAdminActor(actor: AuthPrincipal | null): AuthPrincipal {
    const active = this.requireActiveActor(actor);
    if (active.role !== 'admin' || !hasPermission(active.role, 'academics:manage_structure')) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'Access denied. Only an authorized Admin may access all attendance and audit records.'
      );
    }
    return active;
  }

  private requireTeacherActor(actor: AuthPrincipal | null): AuthPrincipal {
    const active = this.requireActiveActor(actor);
    if (active.role !== 'teacher' || !hasPermission(active.role, 'attendance:mark_assigned')) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'Access denied. Only an active Teacher may mark attendance.'
      );
    }
    return active;
  }

  private requireStudentActor(actor: AuthPrincipal | null): AuthPrincipal {
    const active = this.requireActiveActor(actor);
    if (active.role !== 'student' || !hasPermission(active.role, 'attendance:read_personal')) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'Access denied. Only an active Student account may view personal attendance.'
      );
    }
    return active;
  }

  private getEligibleRosterInternal(classId: string, batchId: string): TeacherEligibleStudent[] {
    const activeEnrolments = this.academicStore.enrolments.filter(
      (e) => e.status === 'active' && e.classId === classId && e.batchId === batchId
    );

    const eligible: TeacherEligibleStudent[] = [];
    for (const enr of activeEnrolments) {
      const stuAcc = this.accountStore.findAccountById(enr.studentAccountId);
      if (stuAcc && stuAcc.role === 'student' && stuAcc.status === 'active') {
        eligible.push({
          studentId: stuAcc.accountId,
          studentName: stuAcc.name,
          enrolmentId: enr.enrolmentId,
        });
      }
    }

    return eligible.sort((a, b) => a.studentId.localeCompare(b.studentId));
  }

  private validateTeacherScope(
    teacherLoginId: string,
    params: {
      classId: string;
      batchId: string;
      subjectId: string;
      sessionDate?: string;
      sessionType?: 'regular' | 'examination';
      timetableEntryId?: string;
      examTitle?: string;
    }
  ) {
    if (params.sessionDate !== undefined) {
      const dateCheck = validateIsoDate(params.sessionDate, 'Attendance date');
      if (!dateCheck.valid) {
        throw new AttendanceServiceError('VALIDATION_ERROR', dateCheck.error!, 'sessionDate');
      }
    }

    const targetClass = this.academicStore.classes.find((c) => c.classId === params.classId);
    if (!targetClass) {
      throw new AttendanceServiceError('INVALID_REFERENCE', 'Selected class does not exist.', 'classId');
    }
    if (targetClass.status !== 'active') {
      throw new AttendanceServiceError('INACTIVE_REFERENCE', 'Selected class is inactive.', 'classId');
    }

    const targetBatch = this.academicStore.batches.find((b) => b.batchId === params.batchId);
    if (!targetBatch) {
      throw new AttendanceServiceError('INVALID_REFERENCE', 'Selected batch does not exist.', 'batchId');
    }
    if (targetBatch.status !== 'active') {
      throw new AttendanceServiceError('INACTIVE_REFERENCE', 'Selected batch is inactive.', 'batchId');
    }
    if (targetBatch.classId !== targetClass.classId) {
      throw new AttendanceServiceError(
        'VALIDATION_ERROR',
        `Batch "${targetBatch.name}" does not belong to "${targetClass.name}".`,
        'batchId'
      );
    }

    const targetSubject = this.academicStore.subjects.find(
      (s) => s.subjectId === params.subjectId
    );
    if (!targetSubject) {
      throw new AttendanceServiceError(
        'INVALID_REFERENCE',
        'Selected subject does not exist.',
        'subjectId'
      );
    }
    if (targetSubject.status !== 'active') {
      throw new AttendanceServiceError('INACTIVE_REFERENCE', 'Selected subject is inactive.', 'subjectId');
    }
    if (!targetSubject.classIds.includes(targetClass.classId)) {
      throw new AttendanceServiceError(
        'VALIDATION_ERROR',
        `Subject "${targetSubject.name}" is not mapped to "${targetClass.name}".`,
        'subjectId'
      );
    }

    const normalizedTeacher = teacherLoginId.trim().toUpperCase();
    const hasActiveAssignment = this.academicStore.assignments.some(
      (a) =>
        a.status === 'active' &&
        a.teacherAccountId.toUpperCase() === normalizedTeacher &&
        a.classId === params.classId &&
        a.batchId === params.batchId &&
        a.subjectId === params.subjectId
    );

    if (!hasActiveAssignment) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'You do not have an active assignment for this class, batch, and subject.'
      );
    }

    if (params.timetableEntryId) {
      const tt = this.academicStore.timetable.find(
        (t) => t.entryId === params.timetableEntryId
      );
      if (!tt) {
        throw new AttendanceServiceError(
          'INVALID_REFERENCE',
          'Referenced timetable session does not exist.',
          'timetableEntryId'
        );
      }
      if (tt.status === 'cancelled') {
        throw new AttendanceServiceError(
          'CANCELLED_TIMETABLE_SESSION',
          `Cannot mark attendance for cancelled timetable session ${tt.entryId}.`,
          'timetableEntryId'
        );
      }
      if (
        tt.teacherAccountId.toUpperCase() !== normalizedTeacher ||
        tt.classId !== params.classId ||
        tt.batchId !== params.batchId ||
        tt.subjectId !== params.subjectId
      ) {
        throw new AttendanceServiceError(
          'INVALID_REFERENCE',
          'Selected timetable entry does not match your assignment, class, batch, or subject.',
          'timetableEntryId'
        );
      }
    }

    if (params.sessionType === 'examination') {
      const titleCheck = validateRequiredText(params.examTitle ?? '', 'Exam title', 3);
      if (!titleCheck.valid) {
        throw new AttendanceServiceError('VALIDATION_ERROR', titleCheck.error!, 'examTitle');
      }
    }

    return { targetClass, targetBatch, targetSubject };
  }

  private buildSessionDetail(session: AttendanceSession): AttendanceSessionDetail {
    const cls = this.academicStore.classes.find((c) => c.classId === session.classId);
    const bat = this.academicStore.batches.find((b) => b.batchId === session.batchId);
    const sub = this.academicStore.subjects.find((s) => s.subjectId === session.subjectId);
    const teacher = this.accountStore.findAccountById(session.teacherId);

    const sessionRecords = this.store.records
      .filter((r) => r.attendanceSessionId === session.id)
      .map((record) => {
        const stuAcc = this.accountStore.findAccountById(record.studentId);
        return {
          record: { ...record },
          studentName: stuAcc?.name ?? record.studentId,
        };
      })
      .sort((a, b) => a.record.studentId.localeCompare(b.record.studentId));

    const summary = calculateAttendanceSummary(sessionRecords.map((r) => r.record.status));
    const auditEntries = this.store.auditEntries
      .filter((a) => a.attendanceSessionId === session.id)
      .map((a) => ({ ...a }));

    return {
      session: { ...session },
      className: cls?.name ?? session.classId,
      batchName: bat?.name ?? session.batchId,
      subjectName: sub?.name ?? session.subjectId,
      teacherName: teacher?.name ?? session.teacherId,
      records: sessionRecords,
      summary,
      auditEntries,
    };
  }

  private appendAudit(entry: Omit<AttendanceAuditEntry, 'id'>): AttendanceAuditEntry {
    const seq = this.store.counters.auditSeq;
    const id = formatAttendanceId('AAUD', seq);
    this.store.counters.auditSeq = seq + 1;
    const created: AttendanceAuditEntry = { id, ...entry };
    this.store.auditEntries = [created, ...this.store.auditEntries];
    return created;
  }

  private createAbsenceNotificationIfNeeded(
    session: AttendanceSession,
    record: AttendanceRecord,
    contextNames: { className: string; batchName: string; subjectName: string }
  ): void {
    if (record.status !== 'absent') {
      return;
    }

    const alreadyExists = this.store.notifications.some(
      (n) =>
        n.attendanceSessionId === session.id &&
        n.attendanceRecordId === record.id &&
        n.studentId.toUpperCase() === record.studentId.toUpperCase()
    );
    if (alreadyExists) {
      return;
    }

    const studentAcc = this.accountStore.findAccountById(record.studentId);
    const seq = this.store.counters.notificationSeq;
    const id = formatAttendanceId('ANOT', seq);
    this.store.counters.notificationSeq = seq + 1;

    const notif: AbsenceNotification = {
      id,
      attendanceSessionId: session.id,
      attendanceRecordId: record.id,
      studentId: record.studentId,
      studentName: studentAcc?.name ?? record.studentId,
      absenceDate: session.sessionDate,
      classId: session.classId,
      className: contextNames.className,
      batchId: session.batchId,
      batchName: contextNames.batchName,
      subjectId: session.subjectId,
      subjectName: contextNames.subjectName,
      attendanceType: session.sessionType,
      examTitle: session.examTitle,
      createdAt: new Date().toISOString(),
      readByStudent: false,
      readByAdmin: false,
      resolutionStatus: 'active_absence',
    };

    this.store.notifications = [notif, ...this.store.notifications];
  }

  // -------------------- TEACHER WORKFLOWS --------------------

  async getTeacherAttendanceOptions(
    actor: AuthPrincipal | null
  ): Promise<TeacherAttendanceScopeOptions> {
    const teacher = this.requireTeacherActor(actor);
    const normalizedId = teacher.loginId.toUpperCase();

    const activeAssignments = this.academicStore.assignments.filter(
      (a) => a.status === 'active' && a.teacherAccountId.toUpperCase() === normalizedId
    );

    const assignedClassIds = new Set(activeAssignments.map((a) => a.classId));
    const assignedBatchIds = new Set(activeAssignments.map((a) => a.batchId));
    const assignedSubjectIds = new Set(activeAssignments.map((a) => a.subjectId));

    return {
      classes: this.academicStore.classes
        .filter((c) => c.status === 'active' && assignedClassIds.has(c.classId))
        .map((c) => ({ ...c })),
      batches: this.academicStore.batches
        .filter((b) => b.status === 'active' && assignedBatchIds.has(b.batchId))
        .map((b) => ({ ...b })),
      subjects: this.academicStore.subjects
        .filter((s) => s.status === 'active' && assignedSubjectIds.has(s.subjectId))
        .map((s) => ({ ...s, classIds: [...s.classIds] })),
      assignments: activeAssignments.map((a) => ({ ...a })),
      timetableEntries: this.academicStore.timetable
        .filter(
          (t) =>
            t.status === 'active' &&
            t.teacherAccountId.toUpperCase() === normalizedId
        )
        .map((t) => ({ ...t })),
    };
  }

  async loadEligibleStudentsForBatch(
    actor: AuthPrincipal | null,
    params: { classId: string; batchId: string; subjectId: string }
  ): Promise<TeacherEligibleStudent[]> {
    const teacher = this.requireTeacherActor(actor);
    this.validateTeacherScope(teacher.loginId, params);
    return this.getEligibleRosterInternal(params.classId, params.batchId);
  }

  async listMyTeacherSessions(actor: AuthPrincipal | null): Promise<AttendanceSessionDetail[]> {
    const teacher = this.requireTeacherActor(actor);
    const normalized = teacher.loginId.toUpperCase();
    return this.store.sessions
      .filter((s) => s.teacherId.toUpperCase() === normalized)
      .map((s) => this.buildSessionDetail(s));
  }

  async saveDraftAttendanceSession(
    actor: AuthPrincipal | null,
    input: SaveAttendanceDraftInput
  ): Promise<AttendanceSessionDetail> {
    const teacher = this.requireTeacherActor(actor);
    this.validateTeacherScope(teacher.loginId, input);

    const eligibleRoster = this.getEligibleRosterInternal(input.classId, input.batchId);
    if (eligibleRoster.length === 0) {
      throw new AttendanceServiceError(
        'VALIDATION_ERROR',
        'No active enrolled students found in the selected class and batch.'
      );
    }
    const eligibleSet = new Set(eligibleRoster.map((s) => s.studentId.toUpperCase()));

    for (const mark of input.marks) {
      if (!eligibleSet.has(mark.studentId.trim().toUpperCase())) {
        throw new AttendanceServiceError(
          'INVALID_REFERENCE',
          `Student "${mark.studentId}" is not actively enrolled in this batch.`
        );
      }
      if (mark.status && !isValidAttendanceStatus(mark.status)) {
        throw new AttendanceServiceError(
          'VALIDATION_ERROR',
          `Invalid attendance status "${mark.status}" for ${mark.studentId}.`
        );
      }
    }

    const now = new Date().toISOString();
    let session: AttendanceSession;

    if (input.draftSessionId) {
      const idx = this.store.sessions.findIndex((s) => s.id === input.draftSessionId);
      if (idx === -1) {
        throw new AttendanceServiceError('NOT_FOUND', `Draft session "${input.draftSessionId}" not found.`);
      }
      const existing = this.store.sessions[idx];
      if (existing.teacherId.toUpperCase() !== teacher.loginId.toUpperCase()) {
        throw new AttendanceServiceError('UNAUTHORIZED', 'Cannot edit another teacher’s attendance session.');
      }
      if (existing.status !== 'draft') {
        throw new AttendanceServiceError(
          'DUPLICATE_SUBMISSION',
          'Submitted attendance cannot be overwritten as a draft. Use the Admin correction workflow.'
        );
      }
      session = {
        ...existing,
        sessionDate: input.sessionDate.trim(),
        classId: input.classId,
        batchId: input.batchId,
        subjectId: input.subjectId,
        sessionType: input.sessionType,
        timetableEntryId: input.sessionType === 'regular' ? input.timetableEntryId || undefined : undefined,
        examTitle: input.sessionType === 'examination' ? input.examTitle?.trim() : undefined,
        updatedAt: now,
      };
      this.store.sessions[idx] = session;
      this.store.records = this.store.records.filter((r) => r.attendanceSessionId !== session.id);
    } else {
      const seq = this.store.counters.sessionSeq;
      const id = formatAttendanceId('ATT', seq);
      this.store.counters.sessionSeq = seq + 1;
      session = {
        id,
        sessionDate: input.sessionDate.trim(),
        classId: input.classId,
        batchId: input.batchId,
        subjectId: input.subjectId,
        teacherId: teacher.loginId,
        sessionType: input.sessionType,
        timetableEntryId: input.sessionType === 'regular' ? input.timetableEntryId || undefined : undefined,
        examTitle: input.sessionType === 'examination' ? input.examTitle?.trim() : undefined,
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };
      this.store.sessions = [session, ...this.store.sessions];
    }

    const newRecords: AttendanceRecord[] = [];
    for (const mark of input.marks) {
      if (!mark.status || !isValidAttendanceStatus(mark.status)) {
        continue;
      }
      const rSeq = this.store.counters.recordSeq;
      const rId = formatAttendanceId('AREC', rSeq);
      this.store.counters.recordSeq = rSeq + 1;
      newRecords.push({
        id: rId,
        attendanceSessionId: session.id,
        studentId: mark.studentId.trim().toUpperCase(),
        status: mark.status,
        remarks: mark.remarks?.trim() || undefined,
        markedBy: teacher.loginId,
        markedAt: now,
        updatedAt: now,
      });
    }

    this.store.records = [...newRecords, ...this.store.records];
    this.appendAudit({
      attendanceSessionId: session.id,
      action: input.draftSessionId ? 'session_draft_saved' : 'session_created',
      newValue: `Draft saved with ${newRecords.length}/${eligibleRoster.length} marked`,
      actorId: teacher.loginId,
      timestamp: now,
    });

    this.store.save();
    return this.buildSessionDetail(session);
  }

  async submitAttendanceSession(
    actor: AuthPrincipal | null,
    input: SubmitAttendanceInput
  ): Promise<AttendanceSessionDetail> {
    const teacher = this.requireTeacherActor(actor);
    const { targetClass, targetBatch, targetSubject } = this.validateTeacherScope(
      teacher.loginId,
      input
    );

    const eligibleRoster = this.getEligibleRosterInternal(input.classId, input.batchId);
    if (eligibleRoster.length === 0) {
      throw new AttendanceServiceError(
        'VALIDATION_ERROR',
        'No active enrolled students found in this batch to submit attendance.'
      );
    }

    // Prevent accidental duplicate submissions for the same date, batch, subject, type & timetable/exam slot
    const normalizedExamTitle = input.examTitle?.trim().toLowerCase() ?? '';
    const duplicate = this.store.sessions.find((s) => {
      if (s.status === 'draft') return false;
      if (s.id === input.draftSessionId) return false;
      if (
        s.sessionDate !== input.sessionDate.trim() ||
        s.classId !== input.classId ||
        s.batchId !== input.batchId ||
        s.subjectId !== input.subjectId ||
        s.sessionType !== input.sessionType
      ) {
        return false;
      }
      if (input.sessionType === 'regular') {
        if (input.timetableEntryId && s.timetableEntryId) {
          return s.timetableEntryId === input.timetableEntryId;
        }
        return true;
      }
      return (s.examTitle?.trim().toLowerCase() ?? '') === normalizedExamTitle;
    });

    if (duplicate) {
      throw new AttendanceServiceError(
        'DUPLICATE_SUBMISSION',
        `Attendance has already been submitted (${duplicate.id}) for this session on ${input.sessionDate}.`
      );
    }

    // Build mark lookup and reject invalid statuses, foreign students, or duplicates
    const eligibleSet = new Set(eligibleRoster.map((s) => s.studentId.toUpperCase()));
    const markByStudent = new Map<
      string,
      { status: AttendanceStatus; remarks?: string }
    >();

    for (const mark of input.marks) {
      const normStuId = mark.studentId.trim().toUpperCase();
      if (!eligibleSet.has(normStuId)) {
        throw new AttendanceServiceError(
          'INVALID_REFERENCE',
          `Student "${mark.studentId}" is not an active enrolled student of ${targetBatch.name}.`
        );
      }
      if (!isValidAttendanceStatus(mark.status)) {
        throw new AttendanceServiceError(
          'VALIDATION_ERROR',
          `Invalid attendance status "${String(mark.status)}" for student ${normStuId}. Select Present, Absent, Late, or Excused.`
        );
      }
      if (markByStudent.has(normStuId)) {
        throw new AttendanceServiceError(
          'DUPLICATE_SUBMISSION',
          `Duplicate attendance entry detected for student ${normStuId}.`
        );
      }
      markByStudent.set(normStuId, {
        status: mark.status,
        remarks: mark.remarks?.trim() || undefined,
      });
    }

    // Never silently default unmarked students to Absent
    const missingStudents = eligibleRoster.filter(
      (stu) => !markByStudent.has(stu.studentId.toUpperCase())
    );
    if (missingStudents.length > 0) {
      throw new AttendanceServiceError(
        'INCOMPLETE_ATTENDANCE',
        `Attendance is incomplete. Mark a status for all enrolled students (${missingStudents
          .map((m) => m.studentId)
          .join(', ')} unmarked).`
      );
    }

    const now = new Date().toISOString();
    let session: AttendanceSession;

    if (input.draftSessionId) {
      const idx = this.store.sessions.findIndex((s) => s.id === input.draftSessionId);
      if (idx === -1) {
        throw new AttendanceServiceError('NOT_FOUND', `Draft session "${input.draftSessionId}" not found.`);
      }
      const existing = this.store.sessions[idx];
      if (existing.teacherId.toUpperCase() !== teacher.loginId.toUpperCase()) {
        throw new AttendanceServiceError('UNAUTHORIZED', 'Cannot submit another teacher’s draft.');
      }
      if (existing.status !== 'draft') {
        throw new AttendanceServiceError(
          'DUPLICATE_SUBMISSION',
          `Session "${existing.id}" has already been submitted.`
        );
      }
      session = {
        ...existing,
        sessionDate: input.sessionDate.trim(),
        classId: input.classId,
        batchId: input.batchId,
        subjectId: input.subjectId,
        sessionType: input.sessionType,
        timetableEntryId: input.sessionType === 'regular' ? input.timetableEntryId || undefined : undefined,
        examTitle: input.sessionType === 'examination' ? input.examTitle?.trim() : undefined,
        status: 'submitted',
        submittedAt: now,
        updatedAt: now,
      };
      this.store.sessions[idx] = session;
      this.store.records = this.store.records.filter((r) => r.attendanceSessionId !== session.id);
    } else {
      const seq = this.store.counters.sessionSeq;
      const id = formatAttendanceId('ATT', seq);
      this.store.counters.sessionSeq = seq + 1;
      session = {
        id,
        sessionDate: input.sessionDate.trim(),
        classId: input.classId,
        batchId: input.batchId,
        subjectId: input.subjectId,
        teacherId: teacher.loginId,
        sessionType: input.sessionType,
        timetableEntryId: input.sessionType === 'regular' ? input.timetableEntryId || undefined : undefined,
        examTitle: input.sessionType === 'examination' ? input.examTitle?.trim() : undefined,
        status: 'submitted',
        createdAt: now,
        submittedAt: now,
        updatedAt: now,
      };
      this.store.sessions = [session, ...this.store.sessions];
    }

    const createdRecords: AttendanceRecord[] = [];
    for (const stu of eligibleRoster) {
      const mark = markByStudent.get(stu.studentId.toUpperCase())!;
      const rSeq = this.store.counters.recordSeq;
      const rId = formatAttendanceId('AREC', rSeq);
      this.store.counters.recordSeq = rSeq + 1;

      const rec: AttendanceRecord = {
        id: rId,
        attendanceSessionId: session.id,
        studentId: stu.studentId,
        status: mark.status,
        remarks: mark.remarks,
        markedBy: teacher.loginId,
        markedAt: now,
        updatedAt: now,
      };
      createdRecords.push(rec);
    }

    this.store.records = [...createdRecords, ...this.store.records];

    // Create Absence Notifications strictly after successful submission
    const summary = calculateAttendanceSummary(createdRecords.map((r) => r.status));
    for (const rec of createdRecords) {
      this.createAbsenceNotificationIfNeeded(session, rec, {
        className: targetClass.name,
        batchName: targetBatch.name,
        subjectName: targetSubject.name,
      });
    }

    this.appendAudit({
      attendanceSessionId: session.id,
      action: 'session_submitted',
      newValue: `Submitted ${createdRecords.length} records (${summary.presentCount} present, ${summary.absentCount} absent, ${summary.lateCount} late, ${summary.excusedCount} excused)`,
      actorId: teacher.loginId,
      timestamp: now,
      reason:
        session.sessionType === 'examination' && session.examTitle
          ? `Examination: ${session.examTitle}`
          : undefined,
    });

    this.store.save();
    return this.buildSessionDetail(session);
  }

  // -------------------- SESSION DETAILS & ADMIN CORRECTIONS --------------------

  async getAttendanceSessionDetail(
    actor: AuthPrincipal | null,
    sessionId: string
  ): Promise<AttendanceSessionDetail> {
    const active = this.requireActiveActor(actor);
    const session = this.store.sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new AttendanceServiceError('NOT_FOUND', `Attendance session "${sessionId}" not found.`);
    }

    if (active.role === 'admin') {
      return this.buildSessionDetail(session);
    }
    if (active.role === 'teacher') {
      if (session.teacherId.toUpperCase() !== active.loginId.toUpperCase()) {
        throw new AttendanceServiceError(
          'UNAUTHORIZED',
          'Access denied. You may only view your own attendance sessions.'
        );
      }
      return this.buildSessionDetail(session);
    }
    throw new AttendanceServiceError(
      'UNAUTHORIZED',
      'Students cannot inspect full-batch attendance rosters.'
    );
  }

  /**
   * Admin-mediated correction workflow:
   * - Submitted/corrected records are immutable to Teachers and Students in the local adapter
   *   because client timestamps cannot enforce server-side edit windows.
   * - Only an active Admin may correct a submitted record with a mandatory audit reason.
   */
  async correctAttendanceRecord(
    actor: AuthPrincipal | null,
    input: {
      sessionId: string;
      recordId: string;
      newStatus: AttendanceStatus | string;
      reason: string;
    }
  ): Promise<{ sessionDetail: AttendanceSessionDetail; updatedRecord: AttendanceRecord }> {
    const admin = this.requireAdminActor(actor);

    if (!isValidAttendanceStatus(input.newStatus)) {
      throw new AttendanceServiceError(
        'VALIDATION_ERROR',
        `Invalid status "${String(input.newStatus)}". Choose Present, Absent, Late, or Excused.`
      );
    }

    const reasonCheck = validateRequiredText(input.reason, 'Correction reason', 5);
    if (!reasonCheck.valid) {
      throw new AttendanceServiceError(
        'CORRECTION_REASON_REQUIRED',
        reasonCheck.error!,
        'reason'
      );
    }

    const sessionIdx = this.store.sessions.findIndex((s) => s.id === input.sessionId);
    if (sessionIdx === -1) {
      throw new AttendanceServiceError('NOT_FOUND', `Attendance session "${input.sessionId}" not found.`);
    }
    const session = this.store.sessions[sessionIdx];
    if (session.status === 'draft') {
      throw new AttendanceServiceError(
        'VALIDATION_ERROR',
        'Draft attendance sessions have not been submitted yet and do not require formal correction.'
      );
    }

    const recIdx = this.store.records.findIndex(
      (r) => r.id === input.recordId && r.attendanceSessionId === session.id
    );
    if (recIdx === -1) {
      throw new AttendanceServiceError('NOT_FOUND', `Attendance record "${input.recordId}" not found.`);
    }

    const existingRec = this.store.records[recIdx];
    const previousStatus = existingRec.status;
    if (previousStatus === input.newStatus) {
      throw new AttendanceServiceError(
        'VALIDATION_ERROR',
        `Record is already marked as ${capitalizeStatus(input.newStatus)}.`
      );
    }

    const now = new Date().toISOString();
    const updatedRec: AttendanceRecord = {
      ...existingRec,
      status: input.newStatus,
      updatedAt: now,
      corrected: true,
    };
    this.store.records[recIdx] = updatedRec;

    const updatedSession: AttendanceSession = {
      ...session,
      status: 'corrected',
      updatedAt: now,
    };
    this.store.sessions[sessionIdx] = updatedSession;

    this.appendAudit({
      attendanceSessionId: session.id,
      attendanceRecordId: updatedRec.id,
      action: 'record_corrected',
      previousValue: previousStatus,
      newValue: input.newStatus,
      actorId: admin.loginId,
      timestamp: now,
      reason: input.reason.trim(),
    });

    // Synchronize AbsenceNotification state cleanly
    const clsName =
      this.academicStore.classes.find((c) => c.classId === session.classId)?.name ??
      session.classId;
    const batName =
      this.academicStore.batches.find((b) => b.batchId === session.batchId)?.name ??
      session.batchId;
    const subName =
      this.academicStore.subjects.find((s) => s.subjectId === session.subjectId)?.name ??
      session.subjectId;

    if (previousStatus !== 'absent' && input.newStatus === 'absent') {
      this.createAbsenceNotificationIfNeeded(updatedSession, updatedRec, {
        className: clsName,
        batchName: batName,
        subjectName: subName,
      });
    } else if (previousStatus === 'absent' && input.newStatus !== 'absent') {
      const notifIdx = this.store.notifications.findIndex(
        (n) =>
          n.attendanceSessionId === session.id &&
          n.attendanceRecordId === updatedRec.id
      );
      if (notifIdx !== -1) {
        this.store.notifications[notifIdx] = {
          ...this.store.notifications[notifIdx],
          resolutionStatus: 'corrected_not_absent',
          correctionNote: `Corrected from Absent to ${capitalizeStatus(input.newStatus)} by ${admin.loginId}: ${input.reason.trim()}`,
          updatedAt: now,
          readByStudent: false,
          readByStudentAt: undefined,
          readByAdmin: false,
          readByAdminAt: undefined,
        };
      }
    }

    this.store.save();
    return {
      sessionDetail: this.buildSessionDetail(updatedSession),
      updatedRecord: { ...updatedRec },
    };
  }

  // -------------------- STUDENT PERSONAL ATTENDANCE & NOTIFICATIONS --------------------

  async getMyStudentAttendance(
    actor: AuthPrincipal | null,
    filter?: StudentAttendanceFilter
  ): Promise<StudentAttendanceDashboardData> {
    const student = this.requireStudentActor(actor);
    const normalizedId = student.loginId.toUpperCase();

    const submittedSessionIds = new Set(
      this.store.sessions
        .filter((s) => s.status === 'submitted' || s.status === 'corrected')
        .map((s) => s.id)
    );

    const sessionMap = new Map(this.store.sessions.map((s) => [s.id, s]));

    const allPersonalItems: StudentAttendanceHistoryItem[] = this.store.records
      .filter(
        (r) =>
          r.studentId.toUpperCase() === normalizedId &&
          submittedSessionIds.has(r.attendanceSessionId)
      )
      .map((record) => {
        const session = sessionMap.get(record.attendanceSessionId)!;
        const cls = this.academicStore.classes.find((c) => c.classId === session.classId);
        const bat = this.academicStore.batches.find((b) => b.batchId === session.batchId);
        const sub = this.academicStore.subjects.find((s) => s.subjectId === session.subjectId);
        const tch = this.accountStore.findAccountById(session.teacherId);
        return {
          record: { ...record },
          session: { ...session },
          className: cls?.name ?? session.classId,
          batchName: bat?.name ?? session.batchId,
          subjectName: sub?.name ?? session.subjectId,
          teacherName: tch?.name ?? session.teacherId,
        };
      })
      .sort((a, b) => {
        const dateCmp = b.session.sessionDate.localeCompare(a.session.sessionDate);
        if (dateCmp !== 0) return dateCmp;
        return (b.session.submittedAt ?? b.session.createdAt).localeCompare(
          a.session.submittedAt ?? a.session.createdAt
        );
      });

    const summary = calculateAttendanceSummary(allPersonalItems.map((item) => item.record.status));

    const filteredHistory = allPersonalItems.filter((item) => {
      if (filter?.dateFrom && item.session.sessionDate < filter.dateFrom) return false;
      if (filter?.dateTo && item.session.sessionDate > filter.dateTo) return false;
      if (
        filter?.subjectId &&
        filter.subjectId !== 'all' &&
        item.session.subjectId !== filter.subjectId
      ) {
        return false;
      }
      if (
        filter?.sessionType &&
        filter.sessionType !== 'all' &&
        item.session.sessionType !== filter.sessionType
      ) {
        return false;
      }
      return true;
    });

    const subjectIdsSeen = Array.from(
      new Set(allPersonalItems.map((item) => item.session.subjectId))
    );
    const availableSubjects = subjectIdsSeen.map((sid) => ({
      subjectId: sid,
      name:
        this.academicStore.subjects.find((s) => s.subjectId === sid)?.name ?? sid,
    }));

    const personalNotifications = this.store.notifications
      .filter((n) => n.studentId.toUpperCase() === normalizedId)
      .map((n) => ({ ...n }));

    const unreadNotificationCount = personalNotifications.filter(
      (n) => !n.readByStudent
    ).length;

    return {
      summary,
      recentRecords: allPersonalItems.slice(0, 5),
      history: filteredHistory,
      availableSubjects,
      notifications: personalNotifications,
      unreadNotificationCount,
    };
  }

  async markNotificationAsRead(
    actor: AuthPrincipal | null,
    notificationId: string
  ): Promise<AbsenceNotification> {
    const active = this.requireActiveActor(actor);
    if (active.role === 'teacher') {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'Teachers cannot modify Student or Admin absence notification states.'
      );
    }

    const idx = this.store.notifications.findIndex((n) => n.id === notificationId);
    if (idx === -1) {
      throw new AttendanceServiceError(
        'NOT_FOUND',
        `Notification "${notificationId}" not found.`
      );
    }

    const existing = this.store.notifications[idx];
    const now = new Date().toISOString();

    if (active.role === 'student') {
      if (existing.studentId.toUpperCase() !== active.loginId.toUpperCase()) {
        throw new AttendanceServiceError(
          'UNAUTHORIZED',
          'Access denied. You may only mark your own notifications as read.'
        );
      }
      const updated: AbsenceNotification = {
        ...existing,
        readByStudent: true,
        readByStudentAt: now,
      };
      this.store.notifications[idx] = updated;
      this.store.save();
      return { ...updated };
    }

    const updated: AbsenceNotification = {
      ...existing,
      readByAdmin: true,
      readByAdminAt: now,
    };
    this.store.notifications[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async markAllNotificationsAsRead(actor: AuthPrincipal | null): Promise<void> {
    const active = this.requireActiveActor(actor);
    if (active.role === 'teacher') {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        'Teachers cannot modify Student or Admin absence notifications.'
      );
    }
    const now = new Date().toISOString();
    if (active.role === 'student') {
      const normalized = active.loginId.toUpperCase();
      this.store.notifications = this.store.notifications.map((n) =>
        n.studentId.toUpperCase() === normalized
          ? { ...n, readByStudent: true, readByStudentAt: n.readByStudentAt ?? now }
          : n
      );
    } else {
      this.store.notifications = this.store.notifications.map((n) => ({
        ...n,
        readByAdmin: true,
        readByAdminAt: n.readByAdminAt ?? now,
      }));
    }
    this.store.save();
  }

  // -------------------- ADMIN ATTENDANCE MONITORING & AUDIT --------------------

  async getAdminAttendanceOverview(
    actor: AuthPrincipal | null
  ): Promise<AdminAttendanceOverview> {
    this.requireAdminActor(actor);

    const submittedOrCorrectedIds = new Set(
      this.store.sessions
        .filter((s) => s.status === 'submitted' || s.status === 'corrected')
        .map((s) => s.id)
    );

    const submittedRecords = this.store.records.filter((r) =>
      submittedOrCorrectedIds.has(r.attendanceSessionId)
    );
    const overallSummary = calculateAttendanceSummary(submittedRecords.map((r) => r.status));

    const byClass: AdminClassAttendanceBreakdown[] = this.academicStore.classes.map((cls) => {
      const classSessions = this.store.sessions.filter((s) => s.classId === cls.classId);
      const classSubmittedIds = new Set(
        classSessions
          .filter((s) => s.status === 'submitted' || s.status === 'corrected')
          .map((s) => s.id)
      );
      const classRecords = this.store.records.filter((r) =>
        classSubmittedIds.has(r.attendanceSessionId)
      );
      return {
        classId: cls.classId,
        className: cls.name,
        totalSessions: classSessions.length,
        submittedSessions: classSubmittedIds.size,
        summary: calculateAttendanceSummary(classRecords.map((r) => r.status)),
      };
    });

    const unreadNotificationCount = this.store.notifications.filter(
      (n) => !n.readByAdmin
    ).length;

    return {
      totalSessions: this.store.sessions.length,
      submittedSessions: this.store.sessions.filter(
        (s) => s.status === 'submitted' || s.status === 'corrected'
      ).length,
      draftSessions: this.store.sessions.filter((s) => s.status === 'draft').length,
      correctedSessions: this.store.sessions.filter((s) => s.status === 'corrected').length,
      presentCount: overallSummary.presentCount,
      absentCount: overallSummary.absentCount,
      lateCount: overallSummary.lateCount,
      excusedCount: overallSummary.excusedCount,
      overallSummary,
      byClass,
      unreadNotificationCount,
    };
  }

  async listAdminAttendanceSessions(
    actor: AuthPrincipal | null,
    filter?: AdminAttendanceFilter
  ): Promise<AttendanceSessionDetail[]> {
    this.requireAdminActor(actor);

    const studentSearch = filter?.studentIdSearch?.trim().toLowerCase();

    const filteredSessions = this.store.sessions.filter((s) => {
      if (filter?.date && s.sessionDate !== filter.date) return false;
      if (filter?.classId && filter.classId !== 'all' && s.classId !== filter.classId) {
        return false;
      }
      if (filter?.batchId && filter.batchId !== 'all' && s.batchId !== filter.batchId) {
        return false;
      }
      if (
        filter?.teacherId &&
        filter.teacherId !== 'all' &&
        s.teacherId.toUpperCase() !== filter.teacherId.toUpperCase()
      ) {
        return false;
      }
      if (filter?.subjectId && filter.subjectId !== 'all' && s.subjectId !== filter.subjectId) {
        return false;
      }
      if (
        filter?.sessionType &&
        filter.sessionType !== 'all' &&
        s.sessionType !== filter.sessionType
      ) {
        return false;
      }
      if (studentSearch) {
        const hasMatch = this.store.records.some((r) => {
          if (r.attendanceSessionId !== s.id) return false;
          if (r.studentId.toLowerCase().includes(studentSearch)) return true;
          const acc = this.accountStore.findAccountById(r.studentId);
          return (acc?.name ?? '').toLowerCase().includes(studentSearch);
        });
        if (!hasMatch) return false;
      }
      return true;
    });

    return filteredSessions
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
      .map((s) => this.buildSessionDetail(s));
  }

  async listAttendanceAuditHistory(
    actor: AuthPrincipal | null,
    sessionId?: string
  ): Promise<AttendanceAuditEntry[]> {
    this.requireAdminActor(actor);
    const items = sessionId
      ? this.store.auditEntries.filter((a) => a.attendanceSessionId === sessionId)
      : this.store.auditEntries;
    return items.map((a) => ({ ...a }));
  }

  async listAdminAbsenceNotifications(
    actor: AuthPrincipal | null
  ): Promise<AbsenceNotification[]> {
    this.requireAdminActor(actor);
    return this.store.notifications.map((n) => ({ ...n }));
  }
}

export const localAttendanceService = new LocalDevAttendanceService();
