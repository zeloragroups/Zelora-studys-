export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

export interface ClassEntity {
  id: string;
  name: string;
  gradeLevel: string;
  batchIds: string[];
}

export interface BatchEntity {
  id: string;
  classId: string;
  name: string;
  studentCount: number;
  capacity: number;
}

export interface SubjectEntity {
  id: string;
  name: string;
  code: string;
  classId: string;
  assignedTeacherId: string | null;
}

export interface TimetableSlot {
  id: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  classId: string;
  batchId: string;
  subjectId: string;
  teacherId: string;
}

export type AbsenceType = 'normal_day' | 'exam_day';

export interface LegacyAttendanceRecord {
  id: string;
  dateIso: string;
  classId: string;
  batchId: string;
  studentId: string;
  status: 'present' | 'absent';
  absenceType?: AbsenceType;
  markedByTeacherId: string;
}

export interface AbsenceInAppNotification {
  id: string;
  studentId: string;
  studentName: string;
  dateIso: string;
  className: string;
  absenceType: AbsenceType;
  read: boolean;
  createdAtIso: string;
}

export interface TextHomework {
  id: string;
  classId: string;
  batchId: string;
  subjectId: string;
  teacherId: string;
  title: string;
  instructionsText: string; // Strictly text-only; no PDF/image attachments permitted
  deadlineIso: string;
  createdAtIso: string;
}

export interface LegacyObjectiveQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctOptionIndex: number;
  marks: number;
}

export interface AssessmentEntity {
  id: string;
  kind: 'online_objective_test' | 'offline_exam';
  title: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  scheduledDateIso: string;
  maxMarks: number;
  questions?: LegacyObjectiveQuestion[];
}

export interface StudentMarkRecord {
  id: string;
  assessmentId: string;
  studentId: string;
  marksObtained: number;
  maxMarks: number;
  scoredMode: 'auto_objective' | 'manual_teacher_entry';
  recordedAtIso: string;
}

export type LegacyFeeCadence = 'monthly' | 'yearly';
export type LegacyPaymentVerificationMode = 'manual_admin' | 'automatic_gateway_future';
export type LegacyPaymentStatus = 'pending_verification' | 'verified' | 'rejected';

export interface LegacyFeeStructureConfig {
  cadence: LegacyFeeCadence;
  commonFixedAmount: number;
  upiId: string;
  verificationMode: LegacyPaymentVerificationMode;
  updatedAtIso: string;
}

export interface LegacyFeePaymentRecord {
  id: string;
  studentId: string;
  amount: number;
  paymentType: 'partial' | 'full';
  upiIdUsed: string;
  referenceNote: string;
  status: LegacyPaymentStatus;
  submittedAtIso: string;
  verifiedAtIso: string | null;
  receiptId: string | null;
}

export interface LegacyFeeReceipt {
  id: string;
  receiptNumber: string;
  paymentId: string;
  studentId: string;
  studentName: string;
  amountPaid: number;
  remainingBalance: number;
  validUntilIso: string;
  issuedAtIso: string;
}

export type LegacySalaryStructureType = 'fixed_monthly' | 'per_session';

export interface LegacyTeacherSalaryConfig {
  teacherId: string;
  teacherName: string;
  structureType: LegacySalaryStructureType;
  rateAmount: number;
}

export interface LegacyTeacherSalaryPayout {
  id: string;
  teacherId: string;
  periodLabel: string;
  sessionsCount?: number;
  amount: number;
  status: 'paid' | 'pending';
  paidAtIso: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: 'all' | 'teachers' | 'students';
  publishedByAdminId: string;
  publishedAtIso: string;
}
