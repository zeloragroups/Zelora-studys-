import type {
  AdminAssessmentOverviewData,
  AssessmentNotification,
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  ExaminationDetailView,
  ExaminationMarks,
  ExaminationRecord,
  ExaminationStatus,
  HomeworkRecord,
  HomeworkReviewAudit,
  HomeworkStatus,
  HomeworkSubmission,
  MarksAuditEntry,
  ObjectiveQuestion,
  ObjectiveTest,
  ObjectiveTestStatus,
  StudentExaminationItem,
  StudentHomeworkItem,
  StudentObjectiveQuestionView,
  StudentObjectiveTestSummary,
  StudentResultsDashboardData,
  StudentSafeHomeworkSubmission,
  StudentSafeTestAttempt,
  SubjectRecord,
  TeacherAssignment,
  TeacherEligibleStudent,
  TeacherHomeworkSummaryItem,
  TeacherObjectiveTestSummary,
  TeacherResultsWorkspaceData,
  TeacherSubmissionViewItem,
  TestAttempt,
  TestResultReleaseMode,
} from '../../types';

export type AssessmentServiceErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_REFERENCE'
  | 'INACTIVE_REFERENCE'
  | 'DUPLICATE_RECORD'
  | 'ATTEMPT_LIMIT_REACHED'
  | 'OUTSIDE_TEST_WINDOW'
  | 'ALREADY_SUBMITTED'
  | 'REVISION_NOT_ALLOWED'
  | 'CORRECTION_REASON_REQUIRED';

export class AssessmentServiceError extends Error {
  code: AssessmentServiceErrorCode;
  field?: string;

  constructor(code: AssessmentServiceErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'AssessmentServiceError';
    this.code = code;
    this.field = field;
  }
}

export interface TeacherScopeResources {
  classes: ClassRecord[];
  batches: BatchRecord[];
  subjects: SubjectRecord[];
  assignments: TeacherAssignment[];
}

export interface CreateHomeworkInput {
  title: string;
  instructions: string;
  classId: string;
  batchId: string;
  subjectId: string;
  dueAt: string; // ISO datetime or YYYY-MM-DDTHH:mm
  maximumMarks?: number;
  publishImmediately?: boolean;
}

export interface UpdateHomeworkInput {
  title?: string;
  instructions?: string;
  dueAt?: string;
  maximumMarks?: number | null;
}

export interface ReviewHomeworkSubmissionInput {
  submissionId: string;
  action: 'reviewed' | 'returned_for_correction' | 'reopened';
  feedback?: string;
  privateTeacherNote?: string;
  marksAwarded?: number;
  correctionReason?: string;
}

export interface ObjectiveQuestionDraftInput {
  id?: string;
  questionText: string;
  options: Array<{ id?: string; text: string }>;
  correctOptionIndex: number;
  marks: number;
  explanation?: string;
}

export interface CreateObjectiveTestInput {
  title: string;
  instructions: string;
  classId: string;
  batchId: string;
  subjectId: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  maximumAttempts: number;
  resultReleaseMode: TestResultReleaseMode;
  scheduledReleaseAt?: string;
  showCorrectAnswersOnRelease?: boolean;
  questions: ObjectiveQuestionDraftInput[];
  publishImmediately?: boolean;
}

export interface UpdateObjectiveTestInput {
  title?: string;
  instructions?: string;
  durationMinutes?: number;
  startsAt?: string;
  endsAt?: string;
  maximumAttempts?: number;
  resultReleaseMode?: TestResultReleaseMode;
  scheduledReleaseAt?: string;
  showCorrectAnswersOnRelease?: boolean;
  questions?: ObjectiveQuestionDraftInput[];
}

export interface CreateExaminationInput {
  title: string;
  classId: string;
  batchId: string;
  subjectId: string;
  examDate: string; // YYYY-MM-DD
  startsAt: string; // HH:mm
  endsAt: string; // HH:mm
  maximumMarks: number;
  passingMarks?: number;
  instructions: string;
  publishImmediately?: boolean;
}

export interface UpdateExaminationInput {
  title?: string;
  examDate?: string;
  startsAt?: string;
  endsAt?: string;
  maximumMarks?: number;
  passingMarks?: number | null;
  instructions?: string;
}

export interface BulkMarksEntryInput {
  examinationId: string;
  entries: Array<{
    studentId: string;
    marksObtained: number;
  }>;
  releaseImmediately?: boolean;
}

export interface CorrectMarksInput {
  marksRecordId: string;
  newMarksObtained: number;
  reason: string;
}

export interface AdminAssessmentFilter {
  classId?: string;
  batchId?: string;
  subjectId?: string;
  teacherId?: string;
  studentIdSearch?: string;
  homeworkId?: string;
  testId?: string;
  examinationId?: string;
  date?: string;
  status?: string;
}

export interface StudentResultFilter {
  subjectId?: string;
  sourceType?: 'all' | 'examination' | 'objective_test' | 'homework';
  examinationId?: string;
  testId?: string;
  dateFrom?: string;
  dateTo?: string;
  month?: string; // YYYY-MM
  year?: string; // YYYY
  resultStatus?: 'all' | 'pass' | 'fail' | 'recorded';
}

export interface IHomeworkService {
  getTeacherScopeResources(actor: AuthPrincipal | null): Promise<TeacherScopeResources>;
  listTeacherHomework(
    actor: AuthPrincipal | null,
    filter?: { search?: string; status?: 'all' | HomeworkStatus; classId?: string; subjectId?: string }
  ): Promise<TeacherHomeworkSummaryItem[]>;
  createHomework(actor: AuthPrincipal | null, input: CreateHomeworkInput): Promise<HomeworkRecord>;
  updateHomework(
    actor: AuthPrincipal | null,
    homeworkId: string,
    input: UpdateHomeworkInput
  ): Promise<HomeworkRecord>;
  setHomeworkStatus(
    actor: AuthPrincipal | null,
    homeworkId: string,
    status: HomeworkStatus
  ): Promise<HomeworkRecord>;
  getTeacherHomeworkRosterAndSubmissions(
    actor: AuthPrincipal | null,
    homeworkId: string
  ): Promise<{
    homework: HomeworkRecord;
    assignedStudents: TeacherEligibleStudent[];
    submissions: TeacherSubmissionViewItem[];
    pendingStudents: TeacherEligibleStudent[];
    auditEntries: HomeworkReviewAudit[];
  }>;
}

export interface IHomeworkSubmissionService {
  listStudentHomework(actor: AuthPrincipal | null): Promise<StudentHomeworkItem[]>;
  submitStudentHomework(
    actor: AuthPrincipal | null,
    homeworkId: string,
    responseText: string
  ): Promise<StudentSafeHomeworkSubmission>;
  reviewHomeworkSubmission(
    actor: AuthPrincipal | null,
    input: ReviewHomeworkSubmissionInput
  ): Promise<HomeworkSubmission>;
}

export interface IObjectiveTestService {
  listTeacherTests(actor: AuthPrincipal | null): Promise<TeacherObjectiveTestSummary[]>;
  createObjectiveTest(
    actor: AuthPrincipal | null,
    input: CreateObjectiveTestInput
  ): Promise<ObjectiveTest>;
  updateObjectiveTest(
    actor: AuthPrincipal | null,
    testId: string,
    input: UpdateObjectiveTestInput
  ): Promise<ObjectiveTest>;
  setObjectiveTestStatus(
    actor: AuthPrincipal | null,
    testId: string,
    status: ObjectiveTestStatus
  ): Promise<ObjectiveTest>;
  releaseTestResults(actor: AuthPrincipal | null, testId: string): Promise<ObjectiveTest>;
  listTestAttemptsForTeacher(
    actor: AuthPrincipal | null,
    testId: string
  ): Promise<Array<TestAttempt & { studentName: string }>>;
}

export interface ITestAttemptService {
  listStudentAvailableTests(actor: AuthPrincipal | null): Promise<StudentObjectiveTestSummary[]>;
  startOrResumeTestAttempt(
    actor: AuthPrincipal | null,
    testId: string
  ): Promise<{
    test: StudentObjectiveTestSummary;
    attempt: StudentSafeTestAttempt;
    questions: StudentObjectiveQuestionView[];
  }>;
  saveTestAttemptAnswer(
    actor: AuthPrincipal | null,
    attemptId: string,
    questionId: string,
    optionId: string
  ): Promise<StudentSafeTestAttempt>;
  getStudentAttemptReviewDetail(
    actor: AuthPrincipal | null,
    attemptId: string
  ): Promise<{
    test: StudentObjectiveTestSummary;
    attempt: StudentSafeTestAttempt;
    questions: StudentObjectiveQuestionView[];
  }>;
}

export interface ITestEvaluationService {
  submitAndEvaluateTestAttempt(
    actor: AuthPrincipal | null,
    attemptId: string
  ): Promise<{
    attempt: StudentSafeTestAttempt;
    questions: StudentObjectiveQuestionView[];
  }>;
}

export interface IExaminationService {
  listTeacherExaminations(actor: AuthPrincipal | null): Promise<ExaminationDetailView[]>;
  createExamination(
    actor: AuthPrincipal | null,
    input: CreateExaminationInput
  ): Promise<ExaminationRecord>;
  updateExamination(
    actor: AuthPrincipal | null,
    examinationId: string,
    input: UpdateExaminationInput
  ): Promise<ExaminationRecord>;
  setExaminationStatus(
    actor: AuthPrincipal | null,
    examinationId: string,
    status: ExaminationStatus
  ): Promise<ExaminationRecord>;
  listStudentExaminations(actor: AuthPrincipal | null): Promise<StudentExaminationItem[]>;
}

export interface IExaminationMarksService {
  getExaminationMarksRoster(
    actor: AuthPrincipal | null,
    examinationId: string
  ): Promise<{
    examination: ExaminationRecord;
    eligibleStudents: TeacherEligibleStudent[];
    marks: Array<ExaminationMarks & { studentName: string }>;
    auditEntries: MarksAuditEntry[];
  }>;
  submitBulkExaminationMarks(
    actor: AuthPrincipal | null,
    input: BulkMarksEntryInput
  ): Promise<ExaminationMarks[]>;
  correctExaminationMarks(
    actor: AuthPrincipal | null,
    input: CorrectMarksInput
  ): Promise<ExaminationMarks>;
  releaseExaminationResults(
    actor: AuthPrincipal | null,
    examinationId: string
  ): Promise<ExaminationRecord>;
}

export interface IAssessmentOverviewService {
  getStudentResultsDashboard(
    actor: AuthPrincipal | null,
    filter?: StudentResultFilter
  ): Promise<StudentResultsDashboardData>;
  getTeacherResultsWorkspace(
    actor: AuthPrincipal | null
  ): Promise<TeacherResultsWorkspaceData>;
  getAdminAssessmentOverview(
    actor: AuthPrincipal | null,
    filter?: AdminAssessmentFilter
  ): Promise<AdminAssessmentOverviewData>;
  listMyAssessmentNotifications(actor: AuthPrincipal | null): Promise<AssessmentNotification[]>;
  markAssessmentNotificationRead(
    actor: AuthPrincipal | null,
    notificationId: string
  ): Promise<AssessmentNotification>;
  markAllAssessmentNotificationsRead(actor: AuthPrincipal | null): Promise<void>;
}

export type VerifiedQuestionSet = ObjectiveQuestion[];
