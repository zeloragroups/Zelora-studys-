import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType } from '../../lib/firebase/firestore';
import {
  AttendanceServiceError,
  type AdminAttendanceFilter,
  type IAttendanceService,
  type SaveAttendanceDraftInput,
  type StudentAttendanceFilter,
  type SubmitAttendanceInput,
  type TeacherAttendanceScopeOptions,
} from '../contracts/attendanceService';
import type {
  AbsenceNotification,
  AdminAttendanceOverview,
  AttendanceAuditEntry,
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionDetail,
  AttendanceStatus,
  AttendanceSummaryStats,
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  StudentAttendanceDashboardData,
  SubjectRecord,
  TeacherAssignment,
  TeacherEligibleStudent,
  TimetableEntry,
} from '../../types';
import { validateIsoDate } from '../../utils/validation';
import {
  generateSafeDocId,
  getActiveAdminUids,
  requireFirestoreDb,
  requireVerifiedActor,
  stripUndefinedFields,
  withFirestoreErrorHandling,
} from './helpers';

function computeSummaryStats(
  records: Array<{ status: AttendanceStatus }>
): AttendanceSummaryStats {
  const presentCount = records.filter((r) => r.status === 'present').length;
  const absentCount = records.filter((r) => r.status === 'absent').length;
  const lateCount = records.filter((r) => r.status === 'late').length;
  const excusedCount = records.filter((r) => r.status === 'excused').length;
  const attendedCount = presentCount + lateCount;
  const eligibleDenominator = presentCount + absentCount + lateCount;
  const percentage =
    eligibleDenominator > 0 ? Math.round((attendedCount / eligibleDenominator) * 1000) / 10 : null;
  return {
    totalSessions: records.length,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    attendedCount,
    eligibleDenominator,
    percentage,
    displayPercentage: percentage === null ? 'Not available' : `${percentage.toFixed(1)}%`,
  };
}

export class FirebaseAttendanceService implements IAttendanceService {
  private ensureTeacherOrAdmin(actor: AuthPrincipal | null): AuthPrincipal {
    try {
      return requireVerifiedActor(actor, ['teacher', 'admin']);
    } catch (error) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        error instanceof Error ? error.message : 'Teacher or Admin authorization required.'
      );
    }
  }

  private ensureAdmin(actor: AuthPrincipal | null): AuthPrincipal {
    try {
      return requireVerifiedActor(actor, ['admin']);
    } catch (error) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        error instanceof Error ? error.message : 'Admin authorization required.'
      );
    }
  }

  private ensureStudent(actor: AuthPrincipal | null): AuthPrincipal {
    try {
      return requireVerifiedActor(actor, ['student']);
    } catch (error) {
      throw new AttendanceServiceError(
        'UNAUTHORIZED',
        error instanceof Error ? error.message : 'Student authorization required.'
      );
    }
  }

  async getTeacherAttendanceOptions(
    actor: AuthPrincipal | null
  ): Promise<TeacherAttendanceScopeOptions> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'teacherAttendanceScope', async () => {
      const [asgSnap, clsSnap, batSnap, subSnap, ttSnap] = await Promise.all([
        teacher.role === 'admin'
          ? getDocs(query(collection(db, 'teacherAssignments'), where('status', '==', 'active')))
          : getDocs(
              query(
                collection(db, 'teacherAssignments'),
                where('teacherUid', '==', teacher.uid),
                where('status', '==', 'active')
              )
            ),
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'batches')),
        getDocs(collection(db, 'subjects')),
        getDocs(collection(db, 'timetableEntries')),
      ]);

      const assignments = asgSnap.docs.map((d) => d.data() as TeacherAssignment);
      const clsIds = new Set(assignments.map((a) => a.classId));
      const batIds = new Set(assignments.map((a) => a.batchId));
      const subIds = new Set(assignments.map((a) => a.subjectId));

      return {
        classes: clsSnap.docs
          .map((d) => d.data() as ClassRecord)
          .filter((c) => c.status === 'active' && (teacher.role === 'admin' || clsIds.has(c.classId))),
        batches: batSnap.docs
          .map((d) => d.data() as BatchRecord)
          .filter((b) => b.status === 'active' && (teacher.role === 'admin' || batIds.has(b.batchId))),
        subjects: subSnap.docs
          .map((d) => d.data() as SubjectRecord)
          .filter((s) => s.status === 'active' && (teacher.role === 'admin' || subIds.has(s.subjectId))),
        assignments,
        timetableEntries: ttSnap.docs
          .map((d) => d.data() as TimetableEntry)
          .filter(
            (t) =>
              teacher.role === 'admin' ||
              t.teacherAccountId.toUpperCase() === teacher.loginId.toUpperCase()
          ),
      };
    });
  }

  async loadEligibleStudentsForBatch(
    actor: AuthPrincipal | null,
    params: { classId: string; batchId: string; subjectId: string }
  ): Promise<TeacherEligibleStudent[]> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    const db = requireFirestoreDb();

    return withFirestoreErrorHandling(OperationType.LIST, 'enrolments', async () => {
      const snap = await getDocs(
        query(
          collection(db, 'enrolments'),
          where('batchId', '==', params.batchId),
          where('status', '==', 'active')
        )
      );
      return snap.docs
        .map((d) => d.data())
        .filter(
          (e) =>
            e.classId === params.classId &&
            (teacher.role === 'admin' ||
              (Array.isArray(e.teacherUids) && e.teacherUids.includes(teacher.uid)))
        )
        .map((e) => ({
          studentId: String(e.studentAccountId || ''),
          studentName: String(e.studentName || e.studentAccountId || ''),
          enrolmentId: String(e.enrolmentId || e.id || ''),
        }))
        .sort((a, b) => a.studentId.localeCompare(b.studentId));
    });
  }

  private async buildSessionDetails(
    db: ReturnType<typeof requireFirestoreDb>,
    sessions: AttendanceSession[]
  ): Promise<AttendanceSessionDetail[]> {
    if (sessions.length === 0) return [];
    const [clsSnap, batSnap, subSnap, recSnap, audSnap, enrSnap] = await Promise.all([
      getDocs(collection(db, 'classes')),
      getDocs(collection(db, 'batches')),
      getDocs(collection(db, 'subjects')),
      getDocs(collection(db, 'attendanceRecords')),
      getDocs(collection(db, 'attendanceAudit')).catch(() => null),
      getDocs(collection(db, 'enrolments')).catch(() => null),
    ]);

    const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name as string]));
    const batMap = new Map(batSnap.docs.map((d) => [d.id, d.data().name as string]));
    const subMap = new Map(subSnap.docs.map((d) => [d.id, d.data().name as string]));
    const studentNameMap = new Map<string, string>();
    for (const d of enrSnap?.docs ?? []) {
      const data = d.data();
      if (data.studentAccountId && data.studentName) {
        studentNameMap.set(String(data.studentAccountId).toUpperCase(), String(data.studentName));
      }
    }

    const allRecords = recSnap.docs.map((d) => d.data() as AttendanceRecord);
    const allAudits = (audSnap?.docs ?? []).map((d) => d.data() as AttendanceAuditEntry);

    return sessions.map((session) => {
      const sessionRecords = allRecords
        .filter((r) => r.attendanceSessionId === session.id)
        .map((record) => ({
          record,
          studentName: studentNameMap.get(record.studentId.toUpperCase()) || record.studentId,
        }));
      const audits = allAudits
        .filter((a) => a.attendanceSessionId === session.id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      return {
        session,
        className: clsMap.get(session.classId) ?? session.classId,
        batchName: batMap.get(session.batchId) ?? session.batchId,
        subjectName: subMap.get(session.subjectId) ?? session.subjectId,
        teacherName: session.teacherId,
        records: sessionRecords,
        summary: computeSummaryStats(sessionRecords.map((r) => r.record)),
        auditEntries: audits,
      };
    });
  }

  async listMyTeacherSessions(actor: AuthPrincipal | null): Promise<AttendanceSessionDetail[]> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'attendanceSessions', async () => {
      const snap = await getDocs(
        teacher.role === 'admin'
          ? collection(db, 'attendanceSessions')
          : query(collection(db, 'attendanceSessions'), where('teacherUid', '==', teacher.uid))
      );
      const sessions = snap.docs
        .map((d) => d.data() as AttendanceSession)
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
      return this.buildSessionDetails(db, sessions);
    });
  }

  private async upsertAttendanceSession(
    actor: AuthPrincipal,
    input: SaveAttendanceDraftInput | SubmitAttendanceInput,
    submit: boolean
  ): Promise<AttendanceSessionDetail> {
    const dateCheck = validateIsoDate(input.sessionDate, 'Session date');
    if (!dateCheck.valid) {
      throw new AttendanceServiceError('VALIDATION_ERROR', dateCheck.error!, 'sessionDate');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);

    if (input.timetableEntryId) {
      const ttSnap = await getDoc(doc(db, 'timetableEntries', input.timetableEntryId));
      if (ttSnap.exists() && ttSnap.data().status === 'cancelled') {
        throw new AttendanceServiceError(
          'CANCELLED_TIMETABLE_SESSION',
          'Attendance cannot be taken for a cancelled timetable slot.'
        );
      }
    }

    // Duplicate submission check for same date + class + batch + subject + sessionType
    const existingSnap = await getDocs(
      query(
        collection(db, 'attendanceSessions'),
        where('teacherUid', '==', actor.uid),
        where('sessionDate', '==', input.sessionDate)
      )
    );
    const duplicate = existingSnap.docs
      .map((d) => d.data() as AttendanceSession)
      .find(
        (s) =>
          s.id !== input.draftSessionId &&
          s.classId === input.classId &&
          s.batchId === input.batchId &&
          s.subjectId === input.subjectId &&
          s.sessionType === input.sessionType &&
          s.status !== 'draft'
      );
    if (duplicate) {
      throw new AttendanceServiceError(
        'DUPLICATE_SUBMISSION',
        'Attendance has already been submitted for this session date, batch, and subject.'
      );
    }

    const eligible = await this.loadEligibleStudentsForBatch(actor, {
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
    });

    if (submit) {
      const markedIds = new Set(
        input.marks
          .filter((m) => m.status && ['present', 'absent', 'late', 'excused'].includes(m.status))
          .map((m) => m.studentId.toUpperCase())
      );
      const missing = eligible.filter((s) => !markedIds.has(s.studentId.toUpperCase()));
      if (missing.length > 0) {
        throw new AttendanceServiceError(
          'INCOMPLETE_ATTENDANCE',
          `Mark attendance for all eligible students before submitting (${missing.length} unmarked).`
        );
      }
    }

    // Resolve student UIDs from enrolments for ownership fields
    const enrSnap = await getDocs(
      query(
        collection(db, 'enrolments'),
        where('batchId', '==', input.batchId),
        where('status', '==', 'active')
      )
    );
    const studentMeta = new Map<string, { uid: string; name: string }>();
    for (const d of enrSnap.docs) {
      const e = d.data();
      studentMeta.set(String(e.studentAccountId).toUpperCase(), {
        uid: String(e.studentUid || ''),
        name: String(e.studentName || e.studentAccountId),
      });
    }

    const [clsSnap, batSnap, subSnap] = await Promise.all([
      getDoc(doc(db, 'classes', input.classId)),
      getDoc(doc(db, 'batches', input.batchId)),
      getDoc(doc(db, 'subjects', input.subjectId)),
    ]);

    const nowIso = new Date().toISOString();
    const sessionId = input.draftSessionId || generateSafeDocId('ATT');
    const sessionDoc: AttendanceSession & { teacherUid: string; adminUids: string[] } = {
      id: sessionId,
      sessionDate: input.sessionDate,
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: actor.loginId,
      teacherUid: actor.uid,
      sessionType: input.sessionType,
      timetableEntryId: input.timetableEntryId || undefined,
      examTitle: input.examTitle?.trim() || undefined,
      status: submit ? 'submitted' : 'draft',
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(submit ? { submittedAt: nowIso } : {}),
      adminUids,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'attendanceSessions', sessionId), stripUndefinedFields({ ...sessionDoc }));

    for (const mark of input.marks) {
      if (!mark.status || !['present', 'absent', 'late', 'excused'].includes(mark.status)) {
        continue;
      }
      const normalizedStudentId = mark.studentId.trim().toUpperCase();
      const sMeta = studentMeta.get(normalizedStudentId);
      if (!sMeta?.uid) continue;

      const recId = `${sessionId}-${normalizedStudentId}`;
      const recordDoc: AttendanceRecord & {
        studentUid: string;
        teacherUid: string;
        adminUids: string[];
      } = {
        id: recId,
        attendanceSessionId: sessionId,
        studentId: normalizedStudentId,
        studentUid: sMeta.uid,
        teacherUid: actor.uid,
        status: mark.status as AttendanceStatus,
        remarks: mark.remarks?.trim() || undefined,
        markedBy: actor.loginId,
        markedAt: nowIso,
        adminUids,
      };
      batch.set(doc(db, 'attendanceRecords', recId), stripUndefinedFields({ ...recordDoc }));

      if (submit && mark.status === 'absent') {
        const notifId = `ANOT-${recId}`;
        const notifDoc: AbsenceNotification & { studentUid: string; adminUids: string[] } = {
          id: notifId,
          attendanceSessionId: sessionId,
          attendanceRecordId: recId,
          studentId: normalizedStudentId,
          studentUid: sMeta.uid,
          studentName: sMeta.name,
          absenceDate: input.sessionDate,
          classId: input.classId,
          className: String(clsSnap.data()?.name || input.classId),
          batchId: input.batchId,
          batchName: String(batSnap.data()?.name || input.batchId),
          subjectId: input.subjectId,
          subjectName: String(subSnap.data()?.name || input.subjectId),
          attendanceType: input.sessionType,
          examTitle: input.examTitle?.trim() || undefined,
          createdAt: nowIso,
          readByStudent: false,
          readByAdmin: false,
          resolutionStatus: 'active_absence',
          adminUids,
        };
        batch.set(doc(db, 'attendanceNotifications', notifId), stripUndefinedFields({ ...notifDoc }));
      }
    }

    const auditId = generateSafeDocId('AAUD');
    batch.set(doc(db, 'attendanceAudit', auditId), {
      id: auditId,
      attendanceSessionId: sessionId,
      action: submit ? 'session_submitted' : 'session_draft_saved',
      actorId: actor.loginId,
      actorRole: actor.role,
      timestamp: nowIso,
      adminUids,
      createdAt: nowIso,
    });

    await withFirestoreErrorHandling(
      OperationType.WRITE,
      `attendanceSessions/${sessionId}`,
      async () => {
        await batch.commit();
      }
    );

    return this.getAttendanceSessionDetail(actor, sessionId);
  }

  async saveDraftAttendanceSession(
    actor: AuthPrincipal | null,
    input: SaveAttendanceDraftInput
  ): Promise<AttendanceSessionDetail> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    return this.upsertAttendanceSession(teacher, input, false);
  }

  async submitAttendanceSession(
    actor: AuthPrincipal | null,
    input: SubmitAttendanceInput
  ): Promise<AttendanceSessionDetail> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    return this.upsertAttendanceSession(teacher, input, true);
  }

  async getAttendanceSessionDetail(
    actor: AuthPrincipal | null,
    sessionId: string
  ): Promise<AttendanceSessionDetail> {
    this.ensureTeacherOrAdmin(actor);
    const db = requireFirestoreDb();
    const snap = await getDoc(doc(db, 'attendanceSessions', sessionId));
    if (!snap.exists()) {
      throw new AttendanceServiceError('NOT_FOUND', `Attendance session "${sessionId}" not found.`);
    }
    const details = await this.buildSessionDetails(db, [snap.data() as AttendanceSession]);
    return details[0];
  }

  async correctAttendanceRecord(
    actor: AuthPrincipal | null,
    input: {
      sessionId: string;
      recordId: string;
      newStatus: AttendanceStatus | string;
      reason: string;
    }
  ): Promise<{ sessionDetail: AttendanceSessionDetail; updatedRecord: AttendanceRecord }> {
    const activeActor = this.ensureTeacherOrAdmin(actor);
    const reason = input.reason.trim();
    if (!reason || reason.length < 3) {
      throw new AttendanceServiceError(
        'CORRECTION_REASON_REQUIRED',
        'A clear correction reason is mandatory when editing submitted attendance.'
      );
    }
    if (!['present', 'absent', 'late', 'excused'].includes(input.newStatus)) {
      throw new AttendanceServiceError('VALIDATION_ERROR', 'Invalid attendance status.');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const recRef = doc(db, 'attendanceRecords', input.recordId);
    const recSnap = await getDoc(recRef);
    if (!recSnap.exists()) {
      throw new AttendanceServiceError('NOT_FOUND', `Record "${input.recordId}" not found.`);
    }
    const existing = recSnap.data() as AttendanceRecord & {
      studentUid: string;
      teacherUid: string;
    };
    const nowIso = new Date().toISOString();

    const batch = writeBatch(db);
    batch.update(recRef, {
      status: input.newStatus,
      updatedAt: nowIso,
      corrected: true,
    });
    batch.update(doc(db, 'attendanceSessions', input.sessionId), {
      status: 'corrected',
      updatedAt: nowIso,
    });

    const auditId = generateSafeDocId('AAUD');
    batch.set(doc(db, 'attendanceAudit', auditId), {
      id: auditId,
      attendanceSessionId: input.sessionId,
      attendanceRecordId: input.recordId,
      action: 'record_corrected',
      previousValue: existing.status,
      newValue: input.newStatus,
      actorId: activeActor.loginId,
      actorRole: activeActor.role,
      reason,
      timestamp: nowIso,
      adminUids,
      createdAt: nowIso,
    });

    if (existing.status === 'absent' && input.newStatus !== 'absent') {
      const notifRef = doc(db, 'attendanceNotifications', `ANOT-${input.recordId}`);
      const notifSnap = await getDoc(notifRef);
      if (notifSnap.exists()) {
        batch.update(notifRef, {
          resolutionStatus: 'corrected_not_absent',
          correctionNote: reason,
          updatedAt: nowIso,
        });
      }
    }

    await withFirestoreErrorHandling(
      OperationType.UPDATE,
      `attendanceRecords/${input.recordId}`,
      async () => {
        await batch.commit();
      }
    );

    const sessionDetail = await this.getAttendanceSessionDetail(activeActor, input.sessionId);
    const updatedRecord: AttendanceRecord = {
      ...existing,
      status: input.newStatus as AttendanceStatus,
      updatedAt: nowIso,
      corrected: true,
    };
    return { sessionDetail, updatedRecord };
  }

  async getMyStudentAttendance(
    actor: AuthPrincipal | null,
    filter?: StudentAttendanceFilter
  ): Promise<StudentAttendanceDashboardData> {
    const student = this.ensureStudent(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'attendanceRecords', async () => {
      const [recSnap, sesSnap, clsSnap, batSnap, subSnap, notifSnap] = await Promise.all([
        getDocs(query(collection(db, 'attendanceRecords'), where('studentUid', '==', student.uid))),
        getDocs(collection(db, 'attendanceSessions')),
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'batches')),
        getDocs(collection(db, 'subjects')),
        getDocs(
          query(collection(db, 'attendanceNotifications'), where('studentUid', '==', student.uid))
        ),
      ]);

      const sesMap = new Map(sesSnap.docs.map((d) => [d.id, d.data() as AttendanceSession]));
      const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name as string]));
      const batMap = new Map(batSnap.docs.map((d) => [d.id, d.data().name as string]));
      const subMap = new Map(subSnap.docs.map((d) => [d.id, d.data().name as string]));

      let history = recSnap.docs
        .map((d) => d.data() as AttendanceRecord)
        .filter((r) => {
          const ses = sesMap.get(r.attendanceSessionId);
          return Boolean(ses && ses.status !== 'draft');
        })
        .map((record) => {
          const session = sesMap.get(record.attendanceSessionId)!;
          return {
            record,
            session,
            className: clsMap.get(session.classId) ?? session.classId,
            batchName: batMap.get(session.batchId) ?? session.batchId,
            subjectName: subMap.get(session.subjectId) ?? session.subjectId,
            teacherName: session.teacherId,
          };
        })
        .sort((a, b) => b.session.sessionDate.localeCompare(a.session.sessionDate));

      const availableSubjectsMap = new Map<string, string>();
      for (const h of history) {
        availableSubjectsMap.set(h.session.subjectId, h.subjectName);
      }

      if (filter?.dateFrom) history = history.filter((h) => h.session.sessionDate >= filter.dateFrom!);
      if (filter?.dateTo) history = history.filter((h) => h.session.sessionDate <= filter.dateTo!);
      if (filter?.subjectId && filter.subjectId !== 'all') {
        history = history.filter((h) => h.session.subjectId === filter.subjectId);
      }
      if (filter?.sessionType && filter.sessionType !== 'all') {
        history = history.filter((h) => h.session.sessionType === filter.sessionType);
      }

      const notifications = notifSnap.docs
        .map((d) => d.data() as AbsenceNotification)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      return {
        summary: computeSummaryStats(history.map((h) => h.record)),
        recentRecords: history.slice(0, 8),
        history,
        availableSubjects: Array.from(availableSubjectsMap.entries()).map(([subjectId, name]) => ({
          subjectId,
          name,
        })),
        notifications,
        unreadNotificationCount: notifications.filter((n) => !n.readByStudent).length,
      };
    });
  }

  async markNotificationAsRead(
    actor: AuthPrincipal | null,
    notificationId: string
  ): Promise<AbsenceNotification> {
    const student = this.ensureStudent(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'attendanceNotifications', notificationId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().studentUid !== student.uid) {
      throw new AttendanceServiceError('NOT_FOUND', 'Notification not found.');
    }
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { readByStudent: true, readByStudentAt: nowIso });
    return { ...(snap.data() as AbsenceNotification), readByStudent: true, readByStudentAt: nowIso };
  }

  async markAllNotificationsAsRead(actor: AuthPrincipal | null): Promise<void> {
    const student = this.ensureStudent(actor);
    const db = requireFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'attendanceNotifications'),
        where('studentUid', '==', student.uid),
        where('readByStudent', '==', false)
      )
    );
    if (snap.empty) return;
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    for (const d of snap.docs) {
      batch.update(d.ref, { readByStudent: true, readByStudentAt: nowIso });
    }
    await batch.commit();
  }

  async getAdminAttendanceOverview(
    actor: AuthPrincipal | null
  ): Promise<AdminAttendanceOverview> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const [sesSnap, recSnap, clsSnap, notifSnap] = await Promise.all([
      getDocs(collection(db, 'attendanceSessions')),
      getDocs(collection(db, 'attendanceRecords')),
      getDocs(collection(db, 'classes')),
      getDocs(collection(db, 'attendanceNotifications')),
    ]);
    const sessions = sesSnap.docs.map((d) => d.data() as AttendanceSession);
    const records = recSnap.docs.map((d) => d.data() as AttendanceRecord);
    const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name as string]));

    const overall = computeSummaryStats(records);
    const classIds = Array.from(new Set(sessions.map((s) => s.classId)));
    const byClass = classIds.map((classId) => {
      const classSessions = sessions.filter((s) => s.classId === classId);
      const classSessionIds = new Set(classSessions.map((s) => s.id));
      const classRecords = records.filter((r) => classSessionIds.has(r.attendanceSessionId));
      return {
        classId,
        className: clsMap.get(classId) ?? classId,
        totalSessions: classSessions.length,
        submittedSessions: classSessions.filter((s) => s.status !== 'draft').length,
        summary: computeSummaryStats(classRecords),
      };
    });

    return {
      totalSessions: sessions.length,
      submittedSessions: sessions.filter((s) => s.status === 'submitted').length,
      draftSessions: sessions.filter((s) => s.status === 'draft').length,
      correctedSessions: sessions.filter((s) => s.status === 'corrected').length,
      presentCount: overall.presentCount,
      absentCount: overall.absentCount,
      lateCount: overall.lateCount,
      excusedCount: overall.excusedCount,
      overallSummary: overall,
      byClass,
      unreadNotificationCount: notifSnap.docs.filter((d) => !d.data().readByAdmin).length,
    };
  }

  async listAdminAttendanceSessions(
    actor: AuthPrincipal | null,
    filter?: AdminAttendanceFilter
  ): Promise<AttendanceSessionDetail[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const snap = await getDocs(collection(db, 'attendanceSessions'));
    let sessions = snap.docs.map((d) => d.data() as AttendanceSession);
    if (filter?.date) sessions = sessions.filter((s) => s.sessionDate === filter.date);
    if (filter?.classId && filter.classId !== 'all') {
      sessions = sessions.filter((s) => s.classId === filter.classId);
    }
    if (filter?.batchId && filter.batchId !== 'all') {
      sessions = sessions.filter((s) => s.batchId === filter.batchId);
    }
    if (filter?.teacherId && filter.teacherId !== 'all') {
      sessions = sessions.filter(
        (s) => s.teacherId.toUpperCase() === filter.teacherId!.toUpperCase()
      );
    }
    if (filter?.subjectId && filter.subjectId !== 'all') {
      sessions = sessions.filter((s) => s.subjectId === filter.subjectId);
    }
    if (filter?.sessionType && filter.sessionType !== 'all') {
      sessions = sessions.filter((s) => s.sessionType === filter.sessionType);
    }
    const details = await this.buildSessionDetails(
      db,
      sessions.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
    );
    const search = filter?.studentIdSearch?.trim().toLowerCase();
    if (search) {
      return details.filter((d) =>
        d.records.some(
          (r) =>
            r.record.studentId.toLowerCase().includes(search) ||
            r.studentName.toLowerCase().includes(search)
        )
      );
    }
    return details;
  }

  async listAttendanceAuditHistory(
    actor: AuthPrincipal | null,
    sessionId?: string
  ): Promise<AttendanceAuditEntry[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const snap = await getDocs(
      sessionId
        ? query(collection(db, 'attendanceAudit'), where('attendanceSessionId', '==', sessionId))
        : collection(db, 'attendanceAudit')
    );
    return snap.docs
      .map((d) => d.data() as AttendanceAuditEntry)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async listAdminAbsenceNotifications(
    actor: AuthPrincipal | null
  ): Promise<AbsenceNotification[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const snap = await getDocs(collection(db, 'attendanceNotifications'));
    return snap.docs
      .map((d) => d.data() as AbsenceNotification)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export const firebaseAttendanceService = new FirebaseAttendanceService();
