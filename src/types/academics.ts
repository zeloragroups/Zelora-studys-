import type { DayOfWeek } from './domain';

export type AcademicStatus = 'active' | 'inactive';

export interface ClassRecord {
  id: string;
  classId: string; // e.g. CLS-0001
  name: string;
  description?: string;
  status: AcademicStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface BatchRecord {
  id: string;
  batchId: string; // e.g. BAT-0001
  name: string;
  classId: string; // References ClassRecord.classId
  description?: string;
  status: AcademicStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface SubjectRecord {
  id: string;
  subjectId: string; // e.g. SUB-0001
  name: string;
  code?: string;
  classIds: string[]; // References ClassRecord.classId[]
  status: AcademicStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface StudentEnrolment {
  id: string;
  enrolmentId: string; // e.g. ENR-0001
  studentAccountId: string; // References AccountRecord.accountId (STU-xxxx)
  classId: string;
  batchId: string;
  enrolmentDate: string;
  status: AcademicStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface TeacherAssignment {
  id: string;
  assignmentId: string; // e.g. ASG-0001
  teacherAccountId: string; // References AccountRecord.accountId (TCH-xxxx)
  subjectId: string;
  classId: string;
  batchId: string;
  status: AcademicStatus;
  createdAt: string;
  updatedAt?: string;
}

export type TimetableEntryStatus = 'active' | 'cancelled';

export interface TimetableEntry {
  id: string;
  entryId: string; // e.g. TT-0001
  classId: string;
  batchId: string;
  subjectId: string;
  teacherAccountId: string;
  dayOfWeek: DayOfWeek;
  startTime: string; // 24h HH:mm
  endTime: string; // 24h HH:mm
  room?: string;
  status: TimetableEntryStatus;
  createdAt: string;
  updatedAt?: string;
}

export type AnnouncementAudience =
  | 'all'
  | 'teachers'
  | 'students'
  | 'class'
  | 'batch';

export type AnnouncementPublicationStatus =
  | 'draft'
  | 'published'
  | 'unpublished'
  | 'archived';

export interface AnnouncementRecord {
  id: string;
  announcementId: string; // e.g. ANN-0001
  title: string;
  content: string; // Strictly text-only
  audience: AnnouncementAudience;
  targetClassId?: string;
  targetBatchId?: string;
  publicationStatus: AnnouncementPublicationStatus;
  publishedByAdminId: string;
  createdAt: string;
  updatedAt?: string;
  publishedAt?: string;
}

export interface AcademicOverviewStats {
  totalClasses: number;
  activeClasses: number;
  totalBatches: number;
  activeBatches: number;
  totalSubjects: number;
  enrolledStudents: number;
  activeAssignments: number;
  activeTimetableSessions: number;
  publishedAnnouncements: number;
}

export interface TeacherWorkspaceData {
  assignments: Array<{
    assignment: TeacherAssignment;
    classRecord: ClassRecord;
    batchRecord: BatchRecord;
    subjectRecord: SubjectRecord;
  }>;
  timetable: Array<{
    entry: TimetableEntry;
    className: string;
    batchName: string;
    subjectName: string;
  }>;
  announcements: AnnouncementRecord[];
}

export interface StudentWorkspaceData {
  enrolment: StudentEnrolment | null;
  classRecord: ClassRecord | null;
  batchRecord: BatchRecord | null;
  subjects: SubjectRecord[];
  timetable: Array<{
    entry: TimetableEntry;
    subjectName: string;
    teacherName: string;
  }>;
  announcements: AnnouncementRecord[];
}
