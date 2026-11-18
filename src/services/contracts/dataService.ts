import type { BrandingConfig } from '../../config/branding';
import type {
  AbsenceInAppNotification,
  Announcement,
  AssessmentEntity,
  LegacyAttendanceRecord,
  BatchEntity,
  ClassEntity,
  LegacyFeePaymentRecord,
  LegacyFeeReceipt,
  LegacyFeeStructureConfig,
  StudentMarkRecord,
  SubjectEntity,
  LegacyTeacherSalaryConfig,
  LegacyTeacherSalaryPayout,
  TextHomework,
  TimetableSlot,
} from '../../types';

/**
 * Backend-agnostic data repository contract.
 * Phase 1 provides a clearly separated LocalDevAdapter.
 * Future Firebase integration implements this exact interface with Firestore.
 */
export interface IDataService {
  getBrandingConfig(): Promise<BrandingConfig>;
  getClasses(): Promise<ClassEntity[]>;
  getBatches(): Promise<BatchEntity[]>;
  getSubjects(): Promise<SubjectEntity[]>;
  getTimetableSlots(filter?: { teacherId?: string; batchId?: string }): Promise<TimetableSlot[]>;
  getAnnouncements(audienceFilter?: 'all' | 'teachers' | 'students'): Promise<Announcement[]>;
  getAttendanceRecords(filter?: { studentId?: string; classId?: string }): Promise<LegacyAttendanceRecord[]>;
  getAbsenceNotifications(studentId: string): Promise<AbsenceInAppNotification[]>;
  getTextHomework(filter?: { classId?: string; batchId?: string }): Promise<TextHomework[]>;
  getAssessments(filter?: { classId?: string; teacherId?: string }): Promise<AssessmentEntity[]>;
  getStudentMarks(studentId: string): Promise<StudentMarkRecord[]>;
  getFeeStructure(): Promise<LegacyFeeStructureConfig>;
  getFeePayments(studentId?: string): Promise<LegacyFeePaymentRecord[]>;
  getFeeReceipts(studentId?: string): Promise<LegacyFeeReceipt[]>;
  getTeacherSalaries(): Promise<LegacyTeacherSalaryConfig[]>;
  getSalaryPayouts(teacherId?: string): Promise<LegacyTeacherSalaryPayout[]>;
}
