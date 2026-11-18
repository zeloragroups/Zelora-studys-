import { DEFAULT_BRANDING_CONFIG } from '../../config/branding';
import type { IDataService } from '../contracts/dataService';
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
 * Clearly isolated Local Development Adapter.
 * Supplies realistic sample structure exclusively for Phase 1 foundation previews
 * while Firebase remains disconnected. Never presented as live production data.
 */
export const LOCAL_DEMO_DATA = {
  classes: [
    { id: 'cls-10', name: 'Class 10 — Foundation', gradeLevel: 'Grade 10', batchIds: ['bat-10a', 'bat-10b'] },
    { id: 'cls-12', name: 'Class 12 — Science', gradeLevel: 'Grade 12', batchIds: ['bat-12a'] },
  ] satisfies ClassEntity[],
  batches: [
    { id: 'bat-10a', classId: 'cls-10', name: 'Morning Batch A', studentCount: 28, capacity: 32 },
    { id: 'bat-10b', classId: 'cls-10', name: 'Evening Batch B', studentCount: 24, capacity: 32 },
    { id: 'bat-12a', classId: 'cls-12', name: 'Physics & Math Honours', studentCount: 22, capacity: 25 },
  ] satisfies BatchEntity[],
  subjects: [
    { id: 'sub-math10', name: 'Mathematics', code: 'MTH-10', classId: 'cls-10', assignedTeacherId: 'TCH-204' },
    { id: 'sub-sci10', name: 'Physical Science', code: 'SCI-10', classId: 'cls-10', assignedTeacherId: 'TCH-209' },
    { id: 'sub-phy12', name: 'Physics', code: 'PHY-12', classId: 'cls-12', assignedTeacherId: 'TCH-209' },
  ] satisfies SubjectEntity[],
  timetable: [
    {
      id: 'tt-1',
      day: 'Monday',
      startTime: '16:00',
      endTime: '17:15',
      classId: 'cls-10',
      batchId: 'bat-10a',
      subjectId: 'sub-math10',
      teacherId: 'TCH-204',
    },
    {
      id: 'tt-2',
      day: 'Monday',
      startTime: '17:30',
      endTime: '18:45',
      classId: 'cls-10',
      batchId: 'bat-10a',
      subjectId: 'sub-sci10',
      teacherId: 'TCH-209',
    },
  ] satisfies TimetableSlot[],
  announcements: [
    {
      id: 'ann-1',
      title: 'Term 1 Assessment Schedule Published',
      body: 'Weekly objective tests begin on 24 Nov. Students must review assigned text homework deadlines.',
      audience: 'all',
      publishedByAdminId: 'ADM-001',
      publishedAtIso: '2026-11-15T09:30:00Z',
    },
  ] satisfies Announcement[],
  absenceNotifications: [
    {
      id: 'not-1',
      studentId: 'STU-1042',
      studentName: 'Aarav Mehta',
      dateIso: '2026-11-14',
      className: 'Class 10 — Foundation',
      absenceType: 'normal_day',
      read: false,
      createdAtIso: '2026-11-14T17:45:00Z',
    },
  ] satisfies AbsenceInAppNotification[],
  homework: [
    {
      id: 'hw-1',
      classId: 'cls-10',
      batchId: 'bat-10a',
      subjectId: 'sub-math10',
      teacherId: 'TCH-204',
      title: 'Quadratic Equations Exercise 4.2',
      instructionsText:
        'Solve questions 1 through 10 in your ruled practice notebook showing complete factorization steps.',
      deadlineIso: '2026-11-19',
      createdAtIso: '2026-11-15T18:00:00Z',
    },
  ] satisfies TextHomework[],
  assessments: [
    {
      id: 'asm-1',
      kind: 'online_objective_test',
      title: 'Linear Equations Checkpoint',
      classId: 'cls-10',
      subjectId: 'sub-math10',
      teacherId: 'TCH-204',
      scheduledDateIso: '2026-11-24',
      maxMarks: 25,
    },
  ] satisfies AssessmentEntity[],
  marks: [
    {
      id: 'mrk-1',
      assessmentId: 'asm-1',
      studentId: 'STU-1042',
      marksObtained: 22,
      maxMarks: 25,
      scoredMode: 'auto_objective',
      recordedAtIso: '2026-11-12T12:00:00Z',
    },
  ] satisfies StudentMarkRecord[],
  feeStructure: {
    cadence: 'monthly',
    commonFixedAmount: 2500,
    upiId: 'centre.fees@upi-placeholder',
    verificationMode: 'manual_admin',
    updatedAtIso: '2026-11-01T08:00:00Z',
  } satisfies LegacyFeeStructureConfig,
  feePayments: [
    {
      id: 'pay-101',
      studentId: 'STU-1042',
      amount: 1500,
      paymentType: 'partial',
      upiIdUsed: 'centre.fees@upi-placeholder',
      referenceNote: 'UPI Ref #40291822',
      status: 'verified',
      submittedAtIso: '2026-11-05T10:12:00Z',
      verifiedAtIso: '2026-11-05T14:20:00Z',
      receiptId: 'rcp-101',
    },
  ] satisfies LegacyFeePaymentRecord[],
  feeReceipts: [
    {
      id: 'rcp-101',
      receiptNumber: 'RCP-2026-0101',
      paymentId: 'pay-101',
      studentId: 'STU-1042',
      studentName: 'Aarav Mehta',
      amountPaid: 1500,
      remainingBalance: 1000,
      validUntilIso: '2026-11-30',
      issuedAtIso: '2026-11-05T15:00:00Z',
    },
  ] satisfies LegacyFeeReceipt[],
  teacherSalaries: [
    {
      teacherId: 'TCH-204',
      teacherName: 'Priya Nair',
      structureType: 'fixed_monthly',
      rateAmount: 28000,
    },
    {
      teacherId: 'TCH-209',
      teacherName: 'Rohan Kulkarni',
      structureType: 'per_session',
      rateAmount: 750,
    },
  ] satisfies LegacyTeacherSalaryConfig[],
  salaryPayouts: [
    {
      id: 'sal-1',
      teacherId: 'TCH-204',
      periodLabel: 'October 2026',
      amount: 28000,
      status: 'paid',
      paidAtIso: '2026-11-02T11:00:00Z',
    },
  ] satisfies LegacyTeacherSalaryPayout[],
  attendance: [
    {
      id: 'att-1',
      dateIso: '2026-11-15',
      classId: 'cls-10',
      batchId: 'bat-10a',
      studentId: 'STU-1042',
      status: 'present',
      markedByTeacherId: 'TCH-204',
    },
  ] satisfies LegacyAttendanceRecord[],
};

export class LocalDevDataAdapter implements IDataService {
  async getBrandingConfig() {
    return DEFAULT_BRANDING_CONFIG;
  }
  async getClasses() {
    return LOCAL_DEMO_DATA.classes;
  }
  async getBatches() {
    return LOCAL_DEMO_DATA.batches;
  }
  async getSubjects() {
    return LOCAL_DEMO_DATA.subjects;
  }
  async getTimetableSlots() {
    return LOCAL_DEMO_DATA.timetable;
  }
  async getAnnouncements() {
    return LOCAL_DEMO_DATA.announcements;
  }
  async getAttendanceRecords() {
    return LOCAL_DEMO_DATA.attendance;
  }
  async getAbsenceNotifications() {
    return LOCAL_DEMO_DATA.absenceNotifications;
  }
  async getTextHomework() {
    return LOCAL_DEMO_DATA.homework;
  }
  async getAssessments() {
    return LOCAL_DEMO_DATA.assessments;
  }
  async getStudentMarks() {
    return LOCAL_DEMO_DATA.marks;
  }
  async getFeeStructure() {
    return LOCAL_DEMO_DATA.feeStructure;
  }
  async getFeePayments() {
    return LOCAL_DEMO_DATA.feePayments;
  }
  async getFeeReceipts() {
    return LOCAL_DEMO_DATA.feeReceipts;
  }
  async getTeacherSalaries() {
    return LOCAL_DEMO_DATA.teacherSalaries;
  }
  async getSalaryPayouts() {
    return LOCAL_DEMO_DATA.salaryPayouts;
  }
}

export const localDevAdapter = new LocalDevDataAdapter();
