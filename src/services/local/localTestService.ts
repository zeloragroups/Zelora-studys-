import type {
  AuthPrincipal,
  ObjectiveQuestion,
  ObjectiveTest,
  ObjectiveTestStatus,
  StudentObjectiveQuestionView,
  StudentObjectiveTestSummary,
  StudentSafeTestAttempt,
  TeacherObjectiveTestSummary,
  TestAttempt,
} from '../../types';
import {
  areTestResultsVisibleToStudent,
  evaluateObjectiveQuestions,
  getEffectiveTestStatus,
} from '../../utils/assessmentCalculations';
import { formatShortDate } from '../../utils/formatters';
import { validateRequiredText } from '../../utils/validation';
import {
  AssessmentServiceError,
  type CreateObjectiveTestInput,
  type IObjectiveTestService,
  type ITestAttemptService,
  type ITestEvaluationService,
  type ObjectiveQuestionDraftInput,
  type UpdateObjectiveTestInput,
} from '../contracts/assessmentService';
import {
  enqueueAssessmentNotification,
  getBatchActiveStudents,
  getStudentActiveEnrolment,
  lookupAcademicNames,
  parseIsoDateTime,
  requireActiveActor,
  requireStudentActor,
  requireTeacherActor,
  validateTeacherAcademicAssignment,
} from './localAssessmentHelpers';
import {
  formatAssessmentId,
  LocalAssessmentStores,
  sharedLocalAssessmentStores,
} from './localAssessmentStores';

export class LocalDevTestService
  implements IObjectiveTestService, ITestAttemptService, ITestEvaluationService
{
  private readonly stores: LocalAssessmentStores;

  constructor(stores: LocalAssessmentStores = sharedLocalAssessmentStores) {
    this.stores = stores;
  }

  private buildVerifiedQuestions(
    drafts: ObjectiveQuestionDraftInput[],
    requireNonEmpty: boolean
  ): ObjectiveQuestion[] {
    if (requireNonEmpty && drafts.length === 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Add at least one objective MCQ question.',
        'questions'
      );
    }

    const result: ObjectiveQuestion[] = [];
    for (let i = 0; i < drafts.length; i += 1) {
      const q = drafts[i];
      const qTextCheck = validateRequiredText(
        q.questionText,
        `Question ${i + 1} text`,
        3
      );
      if (!qTextCheck.valid) {
        throw new AssessmentServiceError('VALIDATION_ERROR', qTextCheck.error!, 'questions');
      }

      if (!Number.isFinite(q.marks) || q.marks <= 0) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          `Question ${i + 1} marks must be greater than zero.`,
          'questions'
        );
      }

      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          `Question ${i + 1} must have at least 2 options.`,
          'questions'
        );
      }

      const seenOptions = new Set<string>();
      const normalizedOptions: Array<{ id: string; text: string }> = [];
      for (let oi = 0; oi < q.options.length; oi += 1) {
        const text = (q.options[oi]?.text ?? '').trim();
        if (!text) {
          throw new AssessmentServiceError(
            'VALIDATION_ERROR',
            `Question ${i + 1}, Option ${oi + 1} cannot be empty.`,
            'questions'
          );
        }
        const key = text.toLowerCase();
        if (seenOptions.has(key)) {
          throw new AssessmentServiceError(
            'VALIDATION_ERROR',
            `Question ${i + 1} contains duplicate option text "${text}".`,
            'questions'
          );
        }
        seenOptions.add(key);
        normalizedOptions.push({
          id: q.options[oi]?.id?.trim() || `OPT-${oi + 1}`,
          text,
        });
      }

      if (
        !Number.isInteger(q.correctOptionIndex) ||
        q.correctOptionIndex < 0 ||
        q.correctOptionIndex >= normalizedOptions.length
      ) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          `Question ${i + 1} must specify exactly one valid correct answer option.`,
          'questions'
        );
      }

      const qSeq = this.stores.testCounters.questionSeq;
      const qId = q.id?.trim() || formatAssessmentId('Q', qSeq);
      if (!q.id?.trim()) {
        this.stores.testCounters.questionSeq = qSeq + 1;
      }

      result.push({
        id: qId,
        questionText: q.questionText.trim(),
        options: normalizedOptions,
        correctOptionId: normalizedOptions[q.correctOptionIndex].id,
        marks: q.marks,
        explanation: q.explanation?.trim() || undefined,
      });
    }

    return result;
  }

  private notifyTestPublished(test: ObjectiveTest): void {
    const roster = getBatchActiveStudents(this.stores, test.classId, test.batchId);
    const names = lookupAcademicNames(this.stores, test);
    for (const stu of roster) {
      enqueueAssessmentNotification(this.stores, {
        recipientStudentId: stu.studentId,
        type: 'test_published',
        relatedRecordId: test.id,
        title: `Online Test Published: ${test.title}`,
        message: `${names.subjectName} (${names.batchName}) · ${test.durationMinutes} mins · Window opens ${formatShortDate(test.startsAt)}.`,
        dedupeKey: `test_published:${test.id}:${stu.studentId}`,
      });
    }
  }

  private notifyTestResultReleased(test: ObjectiveTest, attempt: TestAttempt): void {
    enqueueAssessmentNotification(this.stores, {
      recipientStudentId: attempt.studentId,
      type: 'test_result_released',
      relatedRecordId: test.id,
      title: `Test Result Released: ${test.title}`,
      message: `Score: ${attempt.marksObtained ?? 0} / ${attempt.totalMarks} (${attempt.percentage ?? 0}%).`,
      dedupeKey: `test_result_released:${test.id}:${attempt.id}`,
    });
  }

  private toStudentSafeAttempt(
    test: ObjectiveTest,
    attempt: TestAttempt,
    nowMs: number = Date.now()
  ): StudentSafeTestAttempt {
    const visible = areTestResultsVisibleToStudent(test, attempt, nowMs);
    return {
      id: attempt.id,
      testId: attempt.testId,
      studentId: attempt.studentId,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      submittedAt: attempt.submittedAt,
      answers: { ...attempt.answers },
      status: attempt.status,
      totalMarks: attempt.totalMarks,
      resultsVisible: visible,
      marksObtained: visible ? attempt.marksObtained : undefined,
      percentage: visible ? attempt.percentage : undefined,
      evaluatedAt: visible ? attempt.evaluatedAt : undefined,
      resultReleasedAt: visible ? attempt.resultReleasedAt : undefined,
    };
  }

  private toStudentQuestionsView(
    test: ObjectiveTest,
    attempt: TestAttempt,
    nowMs: number = Date.now()
  ): StudentObjectiveQuestionView[] {
    const revealAnswers =
      areTestResultsVisibleToStudent(test, attempt, nowMs) &&
      test.showCorrectAnswersOnRelease;

    return test.questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      options: q.options.map((o) => ({ ...o })),
      marks: q.marks,
      correctOptionId: revealAnswers ? q.correctOptionId : undefined,
      explanation: revealAnswers ? q.explanation : undefined,
    }));
  }

  private buildStudentTestSummary(
    test: ObjectiveTest,
    studentId: string,
    nowMs: number = Date.now()
  ): StudentObjectiveTestSummary {
    const names = lookupAcademicNames(this.stores, test);
    const normalized = studentId.toUpperCase();
    const myAttempts = this.stores.attempts
      .filter((a) => a.testId === test.id && a.studentId.toUpperCase() === normalized)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);

    const rawInProgress = myAttempts.find((a) => a.status === 'in_progress') ?? null;
    const completed = myAttempts
      .filter((a) => a.status !== 'in_progress')
      .map((a) => this.toStudentSafeAttempt(test, a, nowMs));

    return {
      id: test.id,
      title: test.title,
      instructions: test.instructions,
      classId: test.classId,
      className: names.className,
      batchId: test.batchId,
      batchName: names.batchName,
      subjectId: test.subjectId,
      subjectName: names.subjectName,
      teacherId: test.teacherId,
      teacherName: names.teacherName,
      questionCount: test.questions.length,
      totalMarks: test.totalMarks,
      durationMinutes: test.durationMinutes,
      startsAt: test.startsAt,
      endsAt: test.endsAt,
      maximumAttempts: test.maximumAttempts,
      resultReleaseMode: test.resultReleaseMode,
      scheduledReleaseAt: test.scheduledReleaseAt,
      showCorrectAnswersOnRelease: test.showCorrectAnswersOnRelease,
      effectiveStatus: getEffectiveTestStatus(test, nowMs),
      attemptsUsed: myAttempts.length,
      attemptsRemaining: Math.max(0, test.maximumAttempts - myAttempts.length),
      inProgressAttempt: rawInProgress
        ? this.toStudentSafeAttempt(test, rawInProgress, nowMs)
        : null,
      completedAttempts: completed,
    };
  }

  private finalizeExpiredAttemptInternal(test: ObjectiveTest, attemptIdx: number): void {
    const existing = this.stores.attempts[attemptIdx];
    const evalResult = evaluateObjectiveQuestions(test.questions, existing.answers);
    const now = new Date().toISOString();
    const nowMs = new Date(now).getTime();
    const immediateVisible =
      test.resultReleaseMode === 'auto_after_submission' ||
      Boolean(test.manualResultsReleased) ||
      (test.resultReleaseMode === 'scheduled_after_end' &&
        nowMs >= new Date(test.scheduledReleaseAt ?? test.endsAt).getTime());

    const updated: TestAttempt = {
      ...existing,
      status: 'evaluated',
      submittedAt: existing.expiresAt,
      evaluatedAt: now,
      marksObtained: evalResult.marksObtained,
      totalMarks: evalResult.totalMarks,
      percentage: evalResult.percentage,
      resultReleasedAt: immediateVisible ? now : undefined,
    };
    this.stores.attempts[attemptIdx] = updated;
    if (immediateVisible) {
      this.notifyTestResultReleased(test, updated);
    }
    this.stores.saveTests();
  }

  // -------------------- TEACHER / ADMIN TEST MANAGEMENT --------------------

  async listTeacherTests(actor: AuthPrincipal | null): Promise<TeacherObjectiveTestSummary[]> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    return this.stores.tests
      .filter((t) =>
        active.role === 'teacher'
          ? t.teacherId.toUpperCase() === active.loginId.toUpperCase()
          : true
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((test) => {
        const names = lookupAcademicNames(this.stores, test);
        const testAttempts = this.stores.attempts.filter((a) => a.testId === test.id);
        return {
          test: { ...test, questions: test.questions.map((q) => ({ ...q })) },
          className: names.className,
          batchName: names.batchName,
          subjectName: names.subjectName,
          effectiveStatus: getEffectiveTestStatus(test),
          attemptCount: testAttempts.length,
          evaluatedCount: testAttempts.filter((a) => a.status === 'evaluated').length,
        };
      });
  }

  async createObjectiveTest(
    actor: AuthPrincipal | null,
    input: CreateObjectiveTestInput
  ): Promise<ObjectiveTest> {
    const teacher = requireTeacherActor(this.stores, actor, 'assessments:manage_assigned');

    const titleCheck = validateRequiredText(input.title, 'Test title', 3);
    if (!titleCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', titleCheck.error!, 'title');
    }
    const instCheck = validateRequiredText(input.instructions, 'Test instructions', 3);
    if (!instCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', instCheck.error!, 'instructions');
    }

    if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Duration in minutes must be greater than zero.',
        'durationMinutes'
      );
    }
    if (!Number.isInteger(input.maximumAttempts) || input.maximumAttempts < 1) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Maximum attempts must be at least 1.',
        'maximumAttempts'
      );
    }

    const startParsed = parseIsoDateTime(input.startsAt, 'startsAt', 'Availability start');
    const endParsed = parseIsoDateTime(input.endsAt, 'endsAt', 'Availability end');
    if (endParsed.ms <= startParsed.ms) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Test end time must be later than start time.',
        'endsAt'
      );
    }

    let scheduledReleaseIso: string | undefined;
    if (input.resultReleaseMode === 'scheduled_after_end') {
      const target = input.scheduledReleaseAt ?? input.endsAt;
      const relParsed = parseIsoDateTime(
        target,
        'scheduledReleaseAt',
        'Scheduled result release date'
      );
      if (relParsed.ms < endParsed.ms) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          'Scheduled release date cannot be earlier than the test end time.',
          'scheduledReleaseAt'
        );
      }
      scheduledReleaseIso = relParsed.iso;
    }

    validateTeacherAcademicAssignment(this.stores, teacher.loginId, {
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
    });

    const verifiedQuestions = this.buildVerifiedQuestions(
      input.questions,
      Boolean(input.publishImmediately)
    );
    const totalMarks = verifiedQuestions.reduce((acc, q) => acc + q.marks, 0);

    if (input.publishImmediately && totalMarks <= 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Total marks must be greater than zero before publishing.',
        'questions'
      );
    }

    const seq = this.stores.testCounters.testSeq;
    const id = formatAssessmentId('TST', seq);
    this.stores.testCounters.testSeq = seq + 1;
    const now = new Date().toISOString();

    const created: ObjectiveTest = {
      id,
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: teacher.loginId,
      questions: verifiedQuestions,
      totalMarks,
      durationMinutes: Math.round(input.durationMinutes),
      startsAt: startParsed.iso,
      endsAt: endParsed.iso,
      maximumAttempts: input.maximumAttempts,
      resultReleaseMode: input.resultReleaseMode,
      scheduledReleaseAt: scheduledReleaseIso,
      showCorrectAnswersOnRelease: input.showCorrectAnswersOnRelease ?? true,
      manualResultsReleased: input.resultReleaseMode === 'auto_after_submission',
      status: input.publishImmediately ? 'published' : 'draft',
      createdAt: now,
      updatedAt: now,
    };

    this.stores.tests = [created, ...this.stores.tests];
    if (created.status === 'published') {
      this.notifyTestPublished(created);
      this.stores.saveHomework();
    }
    this.stores.saveTests();
    return { ...created, questions: created.questions.map((q) => ({ ...q })) };
  }

  async updateObjectiveTest(
    actor: AuthPrincipal | null,
    testId: string,
    input: UpdateObjectiveTestInput
  ): Promise<ObjectiveTest> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const idx = this.stores.tests.findIndex((t) => t.id === testId);
    if (idx === -1) {
      throw new AssessmentServiceError('NOT_FOUND', `Objective test "${testId}" not found.`);
    }
    const existing = this.stores.tests[idx];
    if (
      active.role === 'teacher' &&
      existing.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'You may only update your own tests.');
    }

    const existingAttemptsCount = this.stores.attempts.filter(
      (a) => a.testId === existing.id
    ).length;
    if (existingAttemptsCount > 0 && input.questions !== undefined) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Questions cannot be modified after students have started attempts.'
      );
    }

    const nextQuestions =
      input.questions !== undefined
        ? this.buildVerifiedQuestions(input.questions, existing.status !== 'draft')
        : existing.questions;
    const nextTotalMarks = nextQuestions.reduce((acc, q) => acc + q.marks, 0);

    const nextStartsAt =
      input.startsAt !== undefined
        ? parseIsoDateTime(input.startsAt, 'startsAt', 'Availability start').iso
        : existing.startsAt;
    const nextEndsAt =
      input.endsAt !== undefined
        ? parseIsoDateTime(input.endsAt, 'endsAt', 'Availability end').iso
        : existing.endsAt;

    if (new Date(nextEndsAt).getTime() <= new Date(nextStartsAt).getTime()) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Test end time must be later than start time.',
        'endsAt'
      );
    }

    const nextDuration =
      input.durationMinutes !== undefined
        ? Math.round(input.durationMinutes)
        : existing.durationMinutes;
    if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Duration must be greater than zero.',
        'durationMinutes'
      );
    }

    const nextMaxAttempts =
      input.maximumAttempts !== undefined ? input.maximumAttempts : existing.maximumAttempts;
    if (!Number.isInteger(nextMaxAttempts) || nextMaxAttempts < 1) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Maximum attempts must be at least 1.',
        'maximumAttempts'
      );
    }

    const nextTitle = input.title !== undefined ? input.title.trim() : existing.title;
    const nextInstructions =
      input.instructions !== undefined ? input.instructions.trim() : existing.instructions;

    const titleCheck = validateRequiredText(nextTitle, 'Test title', 3);
    if (!titleCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', titleCheck.error!, 'title');
    }

    const updated: ObjectiveTest = {
      ...existing,
      title: nextTitle,
      instructions: nextInstructions,
      durationMinutes: nextDuration,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      maximumAttempts: nextMaxAttempts,
      resultReleaseMode: input.resultReleaseMode ?? existing.resultReleaseMode,
      scheduledReleaseAt:
        input.scheduledReleaseAt !== undefined
          ? parseIsoDateTime(input.scheduledReleaseAt, 'scheduledReleaseAt', 'Release date').iso
          : existing.scheduledReleaseAt,
      showCorrectAnswersOnRelease:
        input.showCorrectAnswersOnRelease ?? existing.showCorrectAnswersOnRelease,
      questions: nextQuestions,
      totalMarks: nextTotalMarks,
      updatedAt: new Date().toISOString(),
    };

    this.stores.tests[idx] = updated;
    this.stores.saveTests();
    return { ...updated, questions: updated.questions.map((q) => ({ ...q })) };
  }

  async setObjectiveTestStatus(
    actor: AuthPrincipal | null,
    testId: string,
    status: ObjectiveTestStatus
  ): Promise<ObjectiveTest> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const idx = this.stores.tests.findIndex((t) => t.id === testId);
    if (idx === -1) {
      throw new AssessmentServiceError('NOT_FOUND', `Objective test "${testId}" not found.`);
    }
    const existing = this.stores.tests[idx];
    if (
      active.role === 'teacher' &&
      existing.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    if ((status === 'published' || status === 'active') && existing.questions.length === 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Add at least one valid MCQ question before publishing this test.'
      );
    }

    const wasDraft = existing.status === 'draft';
    const updated: ObjectiveTest = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.stores.tests[idx] = updated;
    if (wasDraft && (status === 'published' || status === 'active')) {
      this.notifyTestPublished(updated);
      this.stores.saveHomework();
    }
    this.stores.saveTests();
    return { ...updated, questions: updated.questions.map((q) => ({ ...q })) };
  }

  async releaseTestResults(actor: AuthPrincipal | null, testId: string): Promise<ObjectiveTest> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const idx = this.stores.tests.findIndex((t) => t.id === testId);
    if (idx === -1) {
      throw new AssessmentServiceError('NOT_FOUND', `Objective test "${testId}" not found.`);
    }
    const existing = this.stores.tests[idx];
    if (
      active.role === 'teacher' &&
      existing.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const now = new Date().toISOString();
    const updatedTest: ObjectiveTest = {
      ...existing,
      manualResultsReleased: true,
      updatedAt: now,
    };
    this.stores.tests[idx] = updatedTest;

    let notifiedAny = false;
    this.stores.attempts = this.stores.attempts.map((a) => {
      if (a.testId !== updatedTest.id || a.status === 'in_progress') {
        return a;
      }
      const nextAttempt: TestAttempt = {
        ...a,
        resultReleasedAt: a.resultReleasedAt ?? now,
      };
      this.notifyTestResultReleased(updatedTest, nextAttempt);
      notifiedAny = true;
      return nextAttempt;
    });

    if (notifiedAny) {
      this.stores.saveHomework();
    }
    this.stores.saveTests();
    return { ...updatedTest, questions: updatedTest.questions.map((q) => ({ ...q })) };
  }

  async listTestAttemptsForTeacher(
    actor: AuthPrincipal | null,
    testId: string
  ): Promise<Array<TestAttempt & { studentName: string }>> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const test = this.stores.tests.find((t) => t.id === testId);
    if (!test) {
      throw new AssessmentServiceError('NOT_FOUND', `Objective test "${testId}" not found.`);
    }
    if (
      active.role === 'teacher' &&
      test.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    return this.stores.attempts
      .filter((a) => a.testId === test.id)
      .map((a) => {
        const stuAcc = this.stores.academicStore.accountStore.findAccountById(a.studentId);
        return {
          ...a,
          answers: { ...a.answers },
          studentName: stuAcc?.name ?? a.studentId,
        };
      })
      .sort((a, b) => a.studentId.localeCompare(b.studentId));
  }

  // -------------------- STUDENT TEST TAKING & EVALUATION --------------------

  async listStudentAvailableTests(
    actor: AuthPrincipal | null
  ): Promise<StudentObjectiveTestSummary[]> {
    const student = requireStudentActor(this.stores, actor, 'assessments:take_online_test');
    const enrolment = getStudentActiveEnrolment(this.stores, student.loginId);
    if (!enrolment) {
      return [];
    }

    const nowMs = Date.now();
    return this.stores.tests
      .filter(
        (t) =>
          t.classId === enrolment.classId &&
          t.batchId === enrolment.batchId &&
          t.status !== 'draft' &&
          t.status !== 'archived'
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((t) => this.buildStudentTestSummary(t, student.loginId, nowMs));
  }

  async startOrResumeTestAttempt(actor: AuthPrincipal | null, testId: string) {
    const student = requireStudentActor(this.stores, actor, 'assessments:take_online_test');
    const enrolment = getStudentActiveEnrolment(this.stores, student.loginId);
    if (!enrolment) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Active batch enrolment is required to attempt online tests.'
      );
    }

    const test = this.stores.tests.find((t) => t.id === testId);
    if (!test) {
      throw new AssessmentServiceError('NOT_FOUND', `Objective test "${testId}" not found.`);
    }
    if (test.classId !== enrolment.classId || test.batchId !== enrolment.batchId) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'This test does not belong to your enrolled class and batch.'
      );
    }
    if (test.status === 'draft' || test.status === 'archived') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'This test is not published.');
    }

    const nowMs = Date.now();
    const normalizedStu = student.loginId.toUpperCase();

    const existingInProgressIdx = this.stores.attempts.findIndex(
      (a) =>
        a.testId === test.id &&
        a.studentId.toUpperCase() === normalizedStu &&
        a.status === 'in_progress'
    );

    if (existingInProgressIdx !== -1) {
      const existing = this.stores.attempts[existingInProgressIdx];
      const expiresMs = new Date(existing.expiresAt).getTime();
      if (nowMs <= expiresMs) {
        return {
          test: this.buildStudentTestSummary(test, student.loginId, nowMs),
          attempt: this.toStudentSafeAttempt(test, existing, nowMs),
          questions: this.toStudentQuestionsView(test, existing, nowMs),
        };
      }
      // Expired unsubmitted in-progress attempt -> auto-evaluate deterministically
      this.finalizeExpiredAttemptInternal(test, existingInProgressIdx);
    }

    const startMs = new Date(test.startsAt).getTime();
    const endMs = new Date(test.endsAt).getTime();
    if (nowMs < startMs || nowMs > endMs || test.status === 'completed') {
      throw new AssessmentServiceError(
        'OUTSIDE_TEST_WINDOW',
        'This test is currently outside its scheduled availability window.'
      );
    }

    const priorAttempts = this.stores.attempts.filter(
      (a) => a.testId === test.id && a.studentId.toUpperCase() === normalizedStu
    );
    if (priorAttempts.length >= test.maximumAttempts) {
      throw new AssessmentServiceError(
        'ATTEMPT_LIMIT_REACHED',
        `Maximum allowed attempts (${test.maximumAttempts}) reached for this test.`
      );
    }

    const seq = this.stores.testCounters.attemptSeq;
    const id = formatAssessmentId('TATT', seq);
    this.stores.testCounters.attemptSeq = seq + 1;

    const durationMs = test.durationMinutes * 60 * 1000;
    const expiresMs = Math.min(nowMs + durationMs, endMs);

    const created: TestAttempt = {
      id,
      testId: test.id,
      studentId: normalizedStu,
      attemptNumber: priorAttempts.length + 1,
      startedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(expiresMs).toISOString(),
      answers: {},
      status: 'in_progress',
      totalMarks: test.totalMarks,
    };

    this.stores.attempts = [created, ...this.stores.attempts];
    this.stores.saveTests();

    return {
      test: this.buildStudentTestSummary(test, student.loginId, nowMs),
      attempt: this.toStudentSafeAttempt(test, created, nowMs),
      questions: this.toStudentQuestionsView(test, created, nowMs),
    };
  }

  async saveTestAttemptAnswer(
    actor: AuthPrincipal | null,
    attemptId: string,
    questionId: string,
    optionId: string
  ): Promise<StudentSafeTestAttempt> {
    const student = requireStudentActor(this.stores, actor, 'assessments:take_online_test');
    const idx = this.stores.attempts.findIndex((a) => a.id === attemptId);
    if (idx === -1) {
      throw new AssessmentServiceError('NOT_FOUND', `Test attempt "${attemptId}" not found.`);
    }
    const existing = this.stores.attempts[idx];
    if (existing.studentId.toUpperCase() !== student.loginId.toUpperCase()) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Access denied. You may only modify your own attempt.'
      );
    }
    if (existing.status !== 'in_progress') {
      throw new AssessmentServiceError(
        'ALREADY_SUBMITTED',
        'Cannot change answers after a test attempt has been submitted.'
      );
    }

    const test = this.stores.tests.find((t) => t.id === existing.testId);
    if (!test) {
      throw new AssessmentServiceError('NOT_FOUND', 'Parent test not found.');
    }

    const nowMs = Date.now();
    if (nowMs > new Date(existing.expiresAt).getTime()) {
      throw new AssessmentServiceError(
        'OUTSIDE_TEST_WINDOW',
        'Test attempt timer has expired. Please submit your attempt.'
      );
    }

    const question = test.questions.find((q) => q.id === questionId);
    if (!question) {
      throw new AssessmentServiceError('INVALID_REFERENCE', 'Question does not belong to this test.');
    }
    const validOption = question.options.some((o) => o.id === optionId);
    if (!validOption) {
      throw new AssessmentServiceError('INVALID_REFERENCE', 'Selected option does not exist.');
    }

    const updated: TestAttempt = {
      ...existing,
      answers: {
        ...existing.answers,
        [questionId]: optionId,
      },
    };
    this.stores.attempts[idx] = updated;
    this.stores.saveTests();
    return this.toStudentSafeAttempt(test, updated, nowMs);
  }

  async submitAndEvaluateTestAttempt(actor: AuthPrincipal | null, attemptId: string) {
    const student = requireStudentActor(this.stores, actor, 'assessments:take_online_test');
    const idx = this.stores.attempts.findIndex((a) => a.id === attemptId);
    if (idx === -1) {
      throw new AssessmentServiceError('NOT_FOUND', `Test attempt "${attemptId}" not found.`);
    }
    const existing = this.stores.attempts[idx];
    if (existing.studentId.toUpperCase() !== student.loginId.toUpperCase()) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Access denied. You may only submit your own attempt.'
      );
    }
    if (existing.status !== 'in_progress') {
      throw new AssessmentServiceError(
        'ALREADY_SUBMITTED',
        'This test attempt has already been submitted and evaluated.'
      );
    }

    const test = this.stores.tests.find((t) => t.id === existing.testId);
    if (!test) {
      throw new AssessmentServiceError('NOT_FOUND', 'Parent test not found.');
    }

    const evalResult = evaluateObjectiveQuestions(test.questions, existing.answers);
    const now = new Date().toISOString();
    const nowMs = new Date(now).getTime();

    const releaseImmediate =
      test.resultReleaseMode === 'auto_after_submission' ||
      Boolean(test.manualResultsReleased) ||
      (test.resultReleaseMode === 'scheduled_after_end' &&
        nowMs >= new Date(test.scheduledReleaseAt ?? test.endsAt).getTime());

    const evaluated: TestAttempt = {
      ...existing,
      status: 'evaluated',
      submittedAt: now,
      evaluatedAt: now,
      marksObtained: evalResult.marksObtained,
      totalMarks: evalResult.totalMarks,
      percentage: evalResult.percentage,
      resultReleasedAt: releaseImmediate ? now : undefined,
    };

    this.stores.attempts[idx] = evaluated;
    if (releaseImmediate) {
      this.notifyTestResultReleased(test, evaluated);
      this.stores.saveHomework();
    }
    this.stores.saveTests();

    return {
      attempt: this.toStudentSafeAttempt(test, evaluated, nowMs),
      questions: this.toStudentQuestionsView(test, evaluated, nowMs),
    };
  }

  async getStudentAttemptReviewDetail(actor: AuthPrincipal | null, attemptId: string) {
    const student = requireStudentActor(this.stores, actor, 'assessments:take_online_test');
    const attempt = this.stores.attempts.find((a) => a.id === attemptId);
    if (!attempt) {
      throw new AssessmentServiceError('NOT_FOUND', `Test attempt "${attemptId}" not found.`);
    }
    if (attempt.studentId.toUpperCase() !== student.loginId.toUpperCase()) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }
    const test = this.stores.tests.find((t) => t.id === attempt.testId);
    if (!test) {
      throw new AssessmentServiceError('NOT_FOUND', 'Parent test not found.');
    }

    const nowMs = Date.now();
    return {
      test: this.buildStudentTestSummary(test, student.loginId, nowMs),
      attempt: this.toStudentSafeAttempt(test, attempt, nowMs),
      questions: this.toStudentQuestionsView(test, attempt, nowMs),
    };
  }
}

export const localTestService = new LocalDevTestService();
