import type {
  AbsenceNotification,
  AdminAttendanceOverview,
  AttendanceAuditEntry,
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionDetail,
  AttendanceSessionType,
  AttendanceStatus,
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  StudentAttendanceDashboardData,
  SubjectRecord,
  TeacherAssignment,
  TeacherEligibleStudent,
  TimetableEntry,
} from '../../types';

export type AttendanceServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_REFERENCE'
  | 'INACTIVE_REFERENCE'
  | 'DUPLICATE_SUBMISSION'
  | 'INCOMPLETE_ATTENDANCE'
  | 'CANCELLED_TIMETABLE_SESSION'
  | 'CORRECTION_REASON_REQUIRED';

export class AttendanceServiceError extends Error {
  code: AttendanceServiceErrorCode;
  field?: string;

  constructor(code: AttendanceServiceErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'AttendanceServiceError';
    this.code = code;
    this.field = field;
  }
}

export interface TeacherAttendanceScopeOptions {
  classes: ClassRecord[];
  batches: BatchRecord[];
  subjects: SubjectRecord[];
  assignments: TeacherAssignment[];
  timetableEntries: TimetableEntry[];
}

export interface SaveAttendanceDraftInput {
  draftSessionId?: string;
  sessionDate: string;
  classId: string;
  batchId: string;
  subjectId: string;
  sessionType: AttendanceSessionType;
  timetableEntryId?: string;
  examTitle?: string;
  marks: Array<{
    studentId: string;
    status?: AttendanceStatus | '';
    remarks?: string;
  }>;
}

export interface SubmitAttendanceInput {
  draftSessionId?: string;
  sessionDate: string;
  classId: string;
  batchId: string;
  subjectId: string;
  sessionType: AttendanceSessionType;
  timetableEntryId?: string;
  examTitle?: string;
  marks: Array<{
    studentId: string;
    status: AttendanceStatus | string;
    remarks?: string;
  }>;
}

export interface StudentAttendanceFilter {
  dateFrom?: string;
  dateTo?: string;
  subjectId?: string;
  sessionType?: 'all' | AttendanceSessionType;
}

export interface AdminAttendanceFilter {
  date?: string;
  classId?: string;
  batchId?: string;
  teacherId?: string;
  subjectId?: string;
  sessionType?: 'all' | AttendanceSessionType;
  studentIdSearch?: string;
}

export interface IAttendanceService {
  // Teacher workflows
  getTeacherAttendanceOptions(actor: AuthPrincipal | null): Promise<TeacherAttendanceScopeOptions>;
  loadEligibleStudentsForBatch(
    actor: AuthPrincipal | null,
    params: { classId: string; batchId: string; subjectId: string }
  ): Promise<TeacherEligibleStudent[]>;
  listMyTeacherSessions(actor: AuthPrincipal | null): Promise<AttendanceSessionDetail[]>;
  saveDraftAttendanceSession(
    actor: AuthPrincipal | null,
    input: SaveAttendanceDraftInput
  ): Promise<AttendanceSessionDetail>;
  submitAttendanceSession(
    actor: AuthPrincipal | null,
    input: SubmitAttendanceInput
  ): Promise<AttendanceSessionDetail>;

  // Shared detail & correction
  getAttendanceSessionDetail(
    actor: AuthPrincipal | null,
    sessionId: string
  ): Promise<AttendanceSessionDetail>;
  correctAttendanceRecord(
    actor: AuthPrincipal | null,
    input: {
      sessionId: string;
      recordId: string;
      newStatus: AttendanceStatus | string;
      reason: string;
    }
  ): Promise<{ sessionDetail: AttendanceSessionDetail; updatedRecord: AttendanceRecord }>;

  // Student personal attendance & absence notifications
  getMyStudentAttendance(
    actor: AuthPrincipal | null,
    filter?: StudentAttendanceFilter
  ): Promise<StudentAttendanceDashboardData>;
  markNotificationAsRead(
    actor: AuthPrincipal | null,
    notificationId: string
  ): Promise<AbsenceNotification>;
  markAllNotificationsAsRead(actor: AuthPrincipal | null): Promise<void>;

  // Admin monitoring, audit history & absence notifications
  getAdminAttendanceOverview(actor: AuthPrincipal | null): Promise<AdminAttendanceOverview>;
  listAdminAttendanceSessions(
    actor: AuthPrincipal | null,
    filter?: AdminAttendanceFilter
  ): Promise<AttendanceSessionDetail[]>;
  listAttendanceAuditHistory(
    actor: AuthPrincipal | null,
    sessionId?: string
  ): Promise<AttendanceAuditEntry[]>;
  listAdminAbsenceNotifications(actor: AuthPrincipal | null): Promise<AbsenceNotification[]>;
}
