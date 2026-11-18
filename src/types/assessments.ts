export type HomeworkStatus = 'draft' | 'published' | 'closed' | 'archived';

export type HomeworkComputedIndicator =
  | 'draft'
  | 'published'
  | 'closing_soon'
  | 'overdue'
  | 'closed'
  | 'archived';

export interface HomeworkRecord {
  id: string; // e.g. HW-0001
  title: string;
  instructions: string; // Strictly text-only; no attachments/files permitted
  classId: string;
  batchId: string;
  subjectId: string;
  teacherId: string;
  assignedAt: string; // ISO string
  dueAt: string; // ISO datetime string
  maximumMarks?: number;
  status: HomeworkStatus;
  createdAt: string;
  updatedAt: string;
}

export type HomeworkSubmissionStatus =
  | 'assigned'
  | 'submitted'
  | 'late_submitted'
  | 'reviewed'
  | 'returned_for_correction';

export interface HomeworkRevisionEntry {
  revisionNumber: number;
  responseText: string;
  submittedAt: string;
  isLate: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewAction?: 'reviewed' | 'returned_for_correction';
  feedback?: string;
  marksAwarded?: number;
}

export interface HomeworkSubmission {
  id: string; // e.g. HSUB-0001
  homeworkId: string;
  studentId: string;
  responseText: string; // Strictly text-only
  submittedAt: string;
  status: HomeworkSubmissionStatus;
  feedback?: string; // Released to student when reviewed or returned
  privateTeacherNote?: string; // Strictly hidden from Student API responses
  marksAwarded?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  revisionNumber: number;
  reopenedByTeacher?: boolean;
  revisionHistory: HomeworkRevisionEntry[];
}

export interface StudentSafeHomeworkSubmission {
  id: string;
  homeworkId: string;
  studentId: string;
  responseText: string;
  submittedAt: string;
  status: HomeworkSubmissionStatus;
  feedback?: string;
  marksAwarded?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  revisionNumber: number;
  reopenedByTeacher?: boolean;
  revisionHistory: HomeworkRevisionEntry[];
}

export interface HomeworkReviewAudit {
  id: string; // e.g. HAUD-0001
  homeworkId: string;
  submissionId: string;
  actorId: string;
  action: 'reviewed' | 'returned_for_correction' | 'reopened' | 'marks_corrected';
  previousValues?: string;
  newValues?: string;
  reason?: string;
  timestamp: string;
}

export interface TeacherHomeworkSummaryItem {
  homework: HomeworkRecord;
  className: string;
  batchName: string;
  subjectName: string;
  indicator: HomeworkComputedIndicator;
  totalAssignedStudents: number;
  submittedCount: number;
  reviewedCount: number;
  pendingCount: number;
}

export interface StudentHomeworkItem {
  homework: HomeworkRecord;
  className: string;
  batchName: string;
  subjectName: string;
  teacherName: string;
  indicator: HomeworkComputedIndicator;
  submission: StudentSafeHomeworkSubmission | null;
  effectiveStatus: HomeworkSubmissionStatus;
  canSubmitOrResubmit: boolean;
}

export interface TeacherSubmissionViewItem {
  submission: HomeworkSubmission;
  studentName: string;
  homeworkTitle: string;
  maximumMarks?: number;
}

// ============================================================================
// MODULE B — ONLINE OBJECTIVE TESTS
// ============================================================================

export type ObjectiveTestStatus = 'draft' | 'published' | 'active' | 'completed' | 'archived';

export type TestResultReleaseMode =
  | 'auto_after_submission'
  | 'manual_teacher_release'
  | 'scheduled_after_end';

export interface ObjectiveOption {
  id: string;
  text: string;
}

export interface ObjectiveQuestion {
  id: string;
  questionText: string; // Strictly text-only
  options: ObjectiveOption[]; // Text-only options (min 2, non-empty, unique)
  correctOptionId: string;
  marks: number;
  explanation?: string;
}

export interface StudentObjectiveQuestionView {
  id: string;
  questionText: string;
  options: ObjectiveOption[];
  marks: number;
  correctOptionId?: string; // Only exposed when released & showCorrectAnswersOnRelease is enabled
  explanation?: string;
}

export interface ObjectiveTest {
  id: string; // e.g. TST-0001
  title: string;
  instructions: string;
  classId: string;
  batchId: string;
  subjectId: string;
  teacherId: string;
  questions: ObjectiveQuestion[];
  totalMarks: number;
  durationMinutes: number;
  startsAt: string; // ISO datetime
  endsAt: string; // ISO datetime
  maximumAttempts: number;
  resultReleaseMode: TestResultReleaseMode;
  scheduledReleaseAt?: string;
  showCorrectAnswersOnRelease: boolean;
  manualResultsReleased?: boolean;
  status: ObjectiveTestStatus;
  createdAt: string;
  updatedAt: string;
}

export type TestAttemptStatus = 'in_progress' | 'submitted' | 'evaluated';

export interface TestAttempt {
  id: string; // e.g. TATT-0001
  testId: string;
  studentId: string;
  attemptNumber: number;
  startedAt: string;
  expiresAt: string;
  submittedAt?: string;
  answers: Record<string, string>; // questionId -> optionId
  status: TestAttemptStatus;
  marksObtained?: number;
  totalMarks: number;
  percentage?: number;
  evaluatedAt?: string;
  resultReleasedAt?: string;
}

export interface StudentSafeTestAttempt {
  id: string;
  testId: string;
  studentId: string;
  attemptNumber: number;
  startedAt: string;
  expiresAt: string;
  submittedAt?: string;
  answers: Record<string, string>;
  status: TestAttemptStatus;
  totalMarks: number;
  resultsVisible: boolean;
  marksObtained?: number;
  percentage?: number;
  evaluatedAt?: string;
  resultReleasedAt?: string;
}

export interface StudentObjectiveTestSummary {
  id: string;
  title: string;
  instructions: string;
  classId: string;
  className: string;
  batchId: string;
  batchName: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  questionCount: number;
  totalMarks: number;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  maximumAttempts: number;
  resultReleaseMode: TestResultReleaseMode;
  scheduledReleaseAt?: string;
  showCorrectAnswersOnRelease: boolean;
  effectiveStatus: ObjectiveTestStatus;
  attemptsUsed: number;
  attemptsRemaining: number;
  inProgressAttempt: StudentSafeTestAttempt | null;
  completedAttempts: StudentSafeTestAttempt[];
}

export interface TeacherObjectiveTestSummary {
  test: ObjectiveTest;
  className: string;
  batchName: string;
  subjectName: string;
  effectiveStatus: ObjectiveTestStatus;
  attemptCount: number;
  evaluatedCount: number;
}

// ============================================================================
// MODULE C — EXAMINATIONS & MANUAL MARKS
// ============================================================================

export type ExaminationStatus = 'draft' | 'published' | 'completed' | 'archived';

export interface ExaminationRecord {
  id: string; // e.g. EXM-0001
  title: string;
  classId: string;
  batchId: string;
  subjectId: string;
  teacherId: string;
  examDate: string; // YYYY-MM-DD
  startsAt: string; // HH:mm
  endsAt: string; // HH:mm
  maximumMarks: number;
  passingMarks?: number;
  instructions: string; // Text-only
  status: ExaminationStatus;
  resultsReleased: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExaminationMarksResultStatus = 'pass' | 'fail' | 'recorded';

export interface ExaminationMarks {
  id: string; // e.g. EMRK-0001
  examinationId: string;
  studentId: string;
  marksObtained: number;
  maximumMarks: number;
  percentage: number;
  resultStatus: ExaminationMarksResultStatus;
  enteredBy: string;
  enteredAt: string;
  updatedAt: string;
  releasedAt?: string;
  corrected?: boolean;
}

export interface MarksAuditEntry {
  id: string; // e.g. MAUD-0001
  examinationId: string;
  marksRecordId: string;
  studentId: string;
  actorId: string;
  previousMarks: number;
  newMarks: number;
  reason: string;
  timestamp: string;
}

export interface ExaminationDetailView {
  examination: ExaminationRecord;
  className: string;
  batchName: string;
  subjectName: string;
  teacherName: string;
  eligibleStudentCount: number;
  marksEnteredCount: number;
}

export interface StudentExaminationItem {
  examination: ExaminationRecord;
  className: string;
  batchName: string;
  subjectName: string;
  teacherName: string;
  myMarks: ExaminationMarks | null; // Strictly null until resultsReleased is true
  marksEnteredPendingRelease: boolean;
}

// ============================================================================
// MODULE G — IN-APP ASSESSMENT NOTIFICATIONS
// ============================================================================

export type AssessmentNotificationType =
  | 'homework_published'
  | 'homework_reviewed'
  | 'homework_returned'
  | 'test_published'
  | 'test_result_released'
  | 'examination_published'
  | 'examination_updated'
  | 'examination_marks_released';

export interface AssessmentNotification {
  id: string; // e.g. ANF-0001
  recipientStudentId: string;
  type: AssessmentNotificationType;
  relatedRecordId: string;
  title: string;
  message: string;
  createdAt: string;
  readAt?: string;
  dedupeKey: string;
}

// ============================================================================
// MODULE D & F — RESULTS, WORKSPACES & ADMIN OVERVIEW
// ============================================================================

export type SubjectPerformanceAvailability =
  | 'no_assessment_yet'
  | 'assessment_pending'
  | 'result_not_released'
  | 'result_available';

export interface SubjectPerformanceSummary {
  subjectId: string;
  subjectName: string;
  availability: SubjectPerformanceAvailability;
  releasedAssessmentsCount: number;
  pendingAssessmentsCount: number;
  totalMarksObtained: number;
  totalMaximumMarks: number;
  percentage: number | null;
  displayPercentage: string;
  latestResultTitle?: string;
  latestResultDisplay?: string;
  latestReleasedAt?: string;
}

export interface StudentUnifiedResultItem {
  id: string;
  sourceType: 'examination' | 'objective_test' | 'homework';
  relatedId: string;
  title: string;
  subjectId: string;
  subjectName: string;
  assessmentDate: string;
  releasedAt: string;
  marksObtained: number;
  maximumMarks: number;
  percentage: number;
  resultStatus: 'pass' | 'fail' | 'recorded';
  attemptNumber?: number;
}

export interface StudentResultsDashboardData {
  results: StudentUnifiedResultItem[];
  subjectSummaries: SubjectPerformanceSummary[];
  notifications: AssessmentNotification[];
  unreadNotificationCount: number;
  releasedCount: number;
  unreleasedPendingCount: number;
}

export interface TeacherResultsWorkspaceData {
  testResults: Array<{
    test: ObjectiveTest;
    subjectName: string;
    className: string;
    batchName: string;
    attempts: Array<TestAttempt & { studentName: string }>;
  }>;
  examinationResults: Array<{
    examination: ExaminationRecord;
    subjectName: string;
    className: string;
    batchName: string;
    marks: Array<ExaminationMarks & { studentName: string }>;
    pendingStudentCount: number;
  }>;
  homeworkResults: Array<{
    homework: HomeworkRecord;
    subjectName: string;
    className: string;
    batchName: string;
    submissions: Array<HomeworkSubmission & { studentName: string }>;
  }>;
}

export interface AdminAssessmentOverviewStats {
  totalHomeworkCreated: number;
  publishedHomework: number;
  pendingHomeworkSubmissions: number;
  reviewedHomeworkSubmissions: number;
  totalObjectiveTests: number;
  publishedTests: number;
  completedTestAttempts: number;
  upcomingExaminations: number;
  completedExaminations: number;
  pendingMarksEntry: number;
  releasedResults: number;
}

export interface AdminAssessmentOverviewData {
  stats: AdminAssessmentOverviewStats;
  homework: TeacherHomeworkSummaryItem[];
  tests: TeacherObjectiveTestSummary[];
  examinations: ExaminationDetailView[];
  marksAuditEntries: MarksAuditEntry[];
  homeworkAuditEntries: HomeworkReviewAudit[];
}
