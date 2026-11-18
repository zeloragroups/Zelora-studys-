export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'excused',
];

export type AttendanceSessionType = 'regular' | 'examination';

export type AttendanceSessionStatus = 'draft' | 'submitted' | 'corrected';

export interface AttendanceSession {
  id: string; // e.g. ATT-0001
  sessionDate: string; // YYYY-MM-DD
  classId: string;
  batchId: string;
  subjectId: string;
  teacherId: string;
  sessionType: AttendanceSessionType;
  timetableEntryId?: string;
  examTitle?: string;
  status: AttendanceSessionStatus;
  createdAt: string;
  submittedAt?: string;
  updatedAt?: string;
}

export interface AttendanceRecord {
  id: string; // e.g. AREC-0001
  attendanceSessionId: string;
  studentId: string; // STU-xxxx
  status: AttendanceStatus;
  remarks?: string;
  markedBy: string; // Teacher ID or Admin ID
  markedAt: string;
  updatedAt?: string;
  corrected?: boolean;
}

export type AttendanceAuditAction =
  | 'session_created'
  | 'session_draft_saved'
  | 'session_submitted'
  | 'record_corrected';

export interface AttendanceAuditEntry {
  id: string; // e.g. AAUD-0001
  attendanceSessionId: string;
  attendanceRecordId?: string;
  action: AttendanceAuditAction;
  previousValue?: string;
  newValue?: string;
  actorId: string;
  timestamp: string;
  reason?: string;
}

export type AbsenceNotificationResolution =
  | 'active_absence'
  | 'corrected_not_absent';

export interface AbsenceNotification {
  id: string; // e.g. ANOT-0001
  attendanceSessionId: string;
  attendanceRecordId: string;
  studentId: string;
  studentName: string;
  absenceDate: string;
  classId: string;
  className: string;
  batchId: string;
  batchName: string;
  subjectId: string;
  subjectName: string;
  attendanceType: AttendanceSessionType;
  examTitle?: string;
  createdAt: string;
  updatedAt?: string;
  readByStudent: boolean;
  readByStudentAt?: string;
  readByAdmin: boolean;
  readByAdminAt?: string;
  resolutionStatus: AbsenceNotificationResolution;
  correctionNote?: string;
}

export interface AttendanceSummaryStats {
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendedCount: number; // Present + Late
  eligibleDenominator: number; // Present + Absent + Late (Excused excluded)
  percentage: number | null; // null when eligibleDenominator === 0
  displayPercentage: string; // e.g. "87.5%" or "Not available"
}

export interface TeacherEligibleStudent {
  studentId: string;
  studentName: string;
  enrolmentId: string;
}

export interface AttendanceSessionDetail {
  session: AttendanceSession;
  className: string;
  batchName: string;
  subjectName: string;
  teacherName: string;
  records: Array<{
    record: AttendanceRecord;
    studentName: string;
  }>;
  summary: AttendanceSummaryStats;
  auditEntries: AttendanceAuditEntry[];
}

export interface StudentAttendanceHistoryItem {
  record: AttendanceRecord;
  session: AttendanceSession;
  className: string;
  batchName: string;
  subjectName: string;
  teacherName: string;
}

export interface StudentAttendanceDashboardData {
  summary: AttendanceSummaryStats;
  recentRecords: StudentAttendanceHistoryItem[];
  history: StudentAttendanceHistoryItem[];
  availableSubjects: Array<{ subjectId: string; name: string }>;
  notifications: AbsenceNotification[];
  unreadNotificationCount: number;
}

export interface AdminClassAttendanceBreakdown {
  classId: string;
  className: string;
  totalSessions: number;
  submittedSessions: number;
  summary: AttendanceSummaryStats;
}

export interface AdminAttendanceOverview {
  totalSessions: number;
  submittedSessions: number;
  draftSessions: number;
  correctedSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  overallSummary: AttendanceSummaryStats;
  byClass: AdminClassAttendanceBreakdown[];
  unreadNotificationCount: number;
}
