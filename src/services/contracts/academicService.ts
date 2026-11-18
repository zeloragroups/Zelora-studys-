import type {
  AcademicOverviewStats,
  AcademicStatus,
  AccountRecord,
  AnnouncementAudience,
  AnnouncementRecord,
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  DayOfWeek,
  StudentEnrolment,
  StudentWorkspaceData,
  SubjectRecord,
  TeacherAssignment,
  TeacherWorkspaceData,
  TimetableEntry,
  TimetableEntryStatus,
} from '../../types';

export type AcademicServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_RECORD'
  | 'NOT_FOUND'
  | 'INVALID_REFERENCE'
  | 'INACTIVE_REFERENCE'
  | 'TIMETABLE_CONFLICT'
  | 'DELETE_BLOCKED';

export class AcademicServiceError extends Error {
  code: AcademicServiceErrorCode;
  field?: string;

  constructor(code: AcademicServiceErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'AcademicServiceError';
    this.code = code;
    this.field = field;
  }
}

export interface IAcademicManagementService {
  getAcademicOverview(actor: AuthPrincipal | null): Promise<AcademicOverviewStats>;

  // Classes
  listClasses(actor: AuthPrincipal | null, searchQuery?: string): Promise<ClassRecord[]>;
  createClass(
    actor: AuthPrincipal | null,
    input: { name: string; description?: string; status?: AcademicStatus }
  ): Promise<ClassRecord>;
  updateClass(
    actor: AuthPrincipal | null,
    classId: string,
    updates: { name: string; description?: string }
  ): Promise<ClassRecord>;
  setClassStatus(
    actor: AuthPrincipal | null,
    classId: string,
    status: AcademicStatus
  ): Promise<ClassRecord>;
  deleteClass(actor: AuthPrincipal | null, classId: string): Promise<void>;

  // Batches
  listBatches(
    actor: AuthPrincipal | null,
    filter?: { classId?: string; searchQuery?: string }
  ): Promise<BatchRecord[]>;
  createBatch(
    actor: AuthPrincipal | null,
    input: { name: string; classId: string; description?: string; status?: AcademicStatus }
  ): Promise<BatchRecord>;
  updateBatch(
    actor: AuthPrincipal | null,
    batchId: string,
    updates: { name: string; classId: string; description?: string }
  ): Promise<BatchRecord>;
  setBatchStatus(
    actor: AuthPrincipal | null,
    batchId: string,
    status: AcademicStatus
  ): Promise<BatchRecord>;
  deleteBatch(actor: AuthPrincipal | null, batchId: string): Promise<void>;

  // Subjects
  listSubjects(
    actor: AuthPrincipal | null,
    filter?: { classId?: string; searchQuery?: string }
  ): Promise<SubjectRecord[]>;
  createSubject(
    actor: AuthPrincipal | null,
    input: { name: string; code?: string; classIds: string[]; status?: AcademicStatus }
  ): Promise<SubjectRecord>;
  updateSubject(
    actor: AuthPrincipal | null,
    subjectId: string,
    updates: { name: string; code?: string; classIds: string[] }
  ): Promise<SubjectRecord>;
  setSubjectStatus(
    actor: AuthPrincipal | null,
    subjectId: string,
    status: AcademicStatus
  ): Promise<SubjectRecord>;

  // Student Enrolments
  listEnrolments(actor: AuthPrincipal | null): Promise<StudentEnrolment[]>;
  listUnenrolledStudents(actor: AuthPrincipal | null): Promise<AccountRecord[]>;
  enrolStudent(
    actor: AuthPrincipal | null,
    input: { studentAccountId: string; classId: string; batchId: string; enrolmentDate?: string }
  ): Promise<StudentEnrolment>;
  updateEnrolmentClassBatch(
    actor: AuthPrincipal | null,
    enrolmentId: string,
    updates: { classId: string; batchId: string }
  ): Promise<StudentEnrolment>;
  setEnrolmentStatus(
    actor: AuthPrincipal | null,
    enrolmentId: string,
    status: AcademicStatus
  ): Promise<StudentEnrolment>;

  // Teacher Assignments
  listTeacherAssignments(actor: AuthPrincipal | null): Promise<TeacherAssignment[]>;
  createTeacherAssignment(
    actor: AuthPrincipal | null,
    input: { teacherAccountId: string; subjectId: string; classId: string; batchId: string }
  ): Promise<TeacherAssignment>;
  updateTeacherAssignment(
    actor: AuthPrincipal | null,
    assignmentId: string,
    updates: { teacherAccountId: string; subjectId: string; classId: string; batchId: string }
  ): Promise<TeacherAssignment>;
  setTeacherAssignmentStatus(
    actor: AuthPrincipal | null,
    assignmentId: string,
    status: AcademicStatus
  ): Promise<TeacherAssignment>;

  // Timetable
  listTimetableEntries(
    actor: AuthPrincipal | null,
    filter?: { classId?: string; batchId?: string; teacherAccountId?: string; subjectId?: string }
  ): Promise<TimetableEntry[]>;
  createTimetableEntry(
    actor: AuthPrincipal | null,
    input: {
      classId: string;
      batchId: string;
      subjectId: string;
      teacherAccountId: string;
      dayOfWeek: DayOfWeek;
      startTime: string;
      endTime: string;
      room?: string;
    }
  ): Promise<TimetableEntry>;
  updateTimetableEntry(
    actor: AuthPrincipal | null,
    entryId: string,
    updates: {
      classId: string;
      batchId: string;
      subjectId: string;
      teacherAccountId: string;
      dayOfWeek: DayOfWeek;
      startTime: string;
      endTime: string;
      room?: string;
    }
  ): Promise<TimetableEntry>;
  setTimetableEntryStatus(
    actor: AuthPrincipal | null,
    entryId: string,
    status: TimetableEntryStatus
  ): Promise<TimetableEntry>;

  // Announcements
  listAdminAnnouncements(actor: AuthPrincipal | null): Promise<AnnouncementRecord[]>;
  createAnnouncement(
    actor: AuthPrincipal | null,
    input: {
      title: string;
      content: string;
      audience: AnnouncementAudience;
      targetClassId?: string;
      targetBatchId?: string;
      publishImmediately?: boolean;
    }
  ): Promise<AnnouncementRecord>;
  updateAnnouncement(
    actor: AuthPrincipal | null,
    announcementId: string,
    updates: {
      title: string;
      content: string;
      audience: AnnouncementAudience;
      targetClassId?: string;
      targetBatchId?: string;
    }
  ): Promise<AnnouncementRecord>;
  publishAnnouncement(actor: AuthPrincipal | null, announcementId: string): Promise<AnnouncementRecord>;
  unpublishAnnouncement(actor: AuthPrincipal | null, announcementId: string): Promise<AnnouncementRecord>;
  archiveAnnouncement(actor: AuthPrincipal | null, announcementId: string): Promise<AnnouncementRecord>;

  // Scoped Teacher & Student Workspace Queries
  getMyTeacherWorkspace(actor: AuthPrincipal | null): Promise<TeacherWorkspaceData>;
  getMyStudentWorkspace(actor: AuthPrincipal | null): Promise<StudentWorkspaceData>;
}
