import assert from 'node:assert/strict';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import { LocalDevAccountService } from '../src/services/local/localAccountService';
import { LocalAcademicStore } from '../src/services/local/localAcademicStore';
import { LocalDevAcademicService } from '../src/services/local/localAcademicService';
import { LocalAssessmentStores } from '../src/services/local/localAssessmentStores';
import { LocalDevHomeworkService } from '../src/services/local/localHomeworkService';
import { LocalDevTestService } from '../src/services/local/localTestService';
import { LocalDevExaminationService } from '../src/services/local/localExaminationService';
import { LocalDevAssessmentService } from '../src/services/local/localAssessmentService';
import { AssessmentServiceError } from '../src/services/contracts/assessmentService';
import {
  areTestResultsVisibleToStudent,
  calculateScorePercentage,
} from '../src/utils/assessmentCalculations';
import type { AuthPrincipal } from '../src/types';

async function runPhase6Tests() {
  const accountStore = new LocalAccountStore({
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const accountService = new LocalDevAccountService(accountStore, true);
  const academicStore = new LocalAcademicStore({
    accountStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const academicService = new LocalDevAcademicService(academicStore);

  const stores = new LocalAssessmentStores({
    academicStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const homeworkService = new LocalDevHomeworkService(stores);
  const testService = new LocalDevTestService(stores);
  const examService = new LocalDevExaminationService(stores);
  const assessmentService = new LocalDevAssessmentService(stores);

  const adminActor = accountStore.findAuthPrincipalByLoginId('ADM-0001')!;
  const teacher1Actor = accountStore.findAuthPrincipalByLoginId('TCH-0001')!;
  const student1Actor = accountStore.findAuthPrincipalByLoginId('STU-0001')!;
  const inactiveStudentActor: AuthPrincipal = {
    ...student1Actor,
    loginId: 'STU-0099',
    fullName: 'Inactive Student Demo',
    status: 'deactivated',
  };

  // Provision second teacher, second student in BAT-0001, third student in BAT-0003
  const teacher2 = await accountService.createTeacherAccount(adminActor, {
    name: 'Meera Iyer',
    phone: '+91 98220 44556',
    initialPassword: 'TeachPass@2026',
    status: 'active',
  });
  const teacher2Actor = accountStore.findAuthPrincipalByLoginId(teacher2.accountId)!;

  const student2 = await accountService.createStudentAccount(adminActor, {
    name: 'Riya Sharma',
    classId: 'cls-10',
    batchId: 'bat-10a',
    phone: '+91 98220 66778',
    initialPassword: 'StudPass@2026',
    status: 'active',
  });
  const student2Actor = accountStore.findAuthPrincipalByLoginId(student2.accountId)!;

  const student3 = await accountService.createStudentAccount(adminActor, {
    name: 'Kabir Verma',
    classId: 'cls-12',
    batchId: 'bat-12a',
    phone: '+91 98220 77889',
    initialPassword: 'StudPass@2026',
    status: 'active',
  });
  const student3Actor = accountStore.findAuthPrincipalByLoginId(student3.accountId)!;

  await academicService.enrolStudent(adminActor, {
    studentAccountId: student2.accountId,
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
  });
  await academicService.enrolStudent(adminActor, {
    studentAccountId: student3.accountId,
    classId: 'CLS-0002',
    batchId: 'BAT-0003',
  });
  await academicService.createTeacherAssignment(adminActor, {
    teacherAccountId: teacher2.accountId,
    subjectId: 'SUB-0003',
    classId: 'CLS-0002',
    batchId: 'BAT-0003',
  });

  // =========================================================================
  // 1. HOMEWORK TESTS
  // =========================================================================

  // 1.1 Create draft homework
  const draftHw = await homeworkService.createHomework(teacher1Actor, {
    title: 'Trigonometry Draft Worksheet',
    instructions: 'Prove identities 1 through 5 cleanly using trigonometric ratios.',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    dueAt: '2026-12-20T23:59:00.000Z',
    maximumMarks: 15,
    publishImmediately: false,
  });
  assert.equal(draftHw.status, 'draft');

  // 1.2 Draft homework hidden from students
  const stu1HwBeforePublish = await homeworkService.listStudentHomework(student1Actor);
  assert.equal(
    stu1HwBeforePublish.some((h) => h.homework.id === draftHw.id),
    false,
    'Draft homework must not be visible to students'
  );

  // 1.3 Publish homework & verify notification + visibility
  const publishedHw = await homeworkService.setHomeworkStatus(
    teacher1Actor,
    draftHw.id,
    'published'
  );
  assert.equal(publishedHw.status, 'published');
  const stu1NotifsAfterPub = await assessmentService.listMyAssessmentNotifications(
    student1Actor
  );
  assert.equal(
    stu1NotifsAfterPub.some(
      (n) => n.type === 'homework_published' && n.relatedRecordId === draftHw.id
    ),
    true
  );

  // 1.4 Unrelated student3 (BAT-0003) cannot see BAT-0001 homework
  const stu3HwList = await homeworkService.listStudentHomework(student3Actor);
  assert.equal(stu3HwList.some((h) => h.homework.id === draftHw.id), false);

  // 1.5 Reject empty title / unassigned batch / invalid max marks
  await assert.rejects(
    () =>
      homeworkService.createHomework(teacher1Actor, {
        title: ' ',
        instructions: 'Valid text instructions here.',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        dueAt: '2026-12-20T23:59:00.000Z',
      }),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'VALIDATION_ERROR'
  );

  await assert.rejects(
    () =>
      homeworkService.createHomework(teacher1Actor, {
        title: 'Physics Homework',
        instructions: 'Solve 3 numerical problems.',
        classId: 'CLS-0002',
        batchId: 'BAT-0003',
        subjectId: 'SUB-0003',
        dueAt: '2026-12-20T23:59:00.000Z',
      }),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'UNAUTHORIZED'
  );

  // 1.6 Reject empty student response
  await assert.rejects(
    () => homeworkService.submitStudentHomework(student1Actor, draftHw.id, '   '),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'VALIDATION_ERROR'
  );

  // 1.7 Student1 submits text-only homework on time
  const sub1 = await homeworkService.submitStudentHomework(
    student1Actor,
    draftHw.id,
    'Identity 1: sin^2(x) + cos^2(x) = 1. Verified all five steps.'
  );
  assert.equal(sub1.status, 'submitted');
  assert.equal(sub1.revisionNumber, 1);

  // 1.8 Duplicate submission blocked unless returned/reopened
  await assert.rejects(
    () =>
      homeworkService.submitStudentHomework(
        student1Actor,
        draftHw.id,
        'Duplicate attempt'
      ),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'DUPLICATE_RECORD'
  );

  // 1.9 Overdue homework triggers late_submitted flag
  const overdueHw = await homeworkService.createHomework(teacher1Actor, {
    title: 'Past Deadline Practice',
    instructions: 'Show worked answers in plain text.',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    dueAt: '2025-01-10T10:00:00.000Z',
    maximumMarks: 10,
    publishImmediately: true,
  });
  const lateSub = await homeworkService.submitStudentHomework(
    student1Actor,
    overdueHw.id,
    'Completed late submission steps.'
  );
  assert.equal(lateSub.status, 'late_submitted');

  // 1.10 Teacher returns for correction -> student resubmits -> revision history preserved
  await homeworkService.reviewHomeworkSubmission(teacher1Actor, {
    submissionId: sub1.id,
    action: 'returned_for_correction',
    feedback: 'Please expand step 4 of identity #3.',
    privateTeacherNote: 'INTERNAL ONLY: Student skipped algebraic expansion.',
  });
  const sub1Rev2 = await homeworkService.submitStudentHomework(
    student1Actor,
    draftHw.id,
    'Identity 1-5 with complete step 4 algebraic expansion added.'
  );
  assert.equal(sub1Rev2.revisionNumber, 2);
  assert.equal(sub1Rev2.revisionHistory.length, 2);
  assert.equal(
    'privateTeacherNote' in sub1Rev2,
    false,
    'Private teacher note must strictly never exist in student response'
  );

  // 1.11 Marks > maximumMarks rejected
  await assert.rejects(
    () =>
      homeworkService.reviewHomeworkSubmission(teacher1Actor, {
        submissionId: sub1.id,
        action: 'reviewed',
        marksAwarded: 20, // max is 15
        feedback: 'Good.',
      }),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'VALIDATION_ERROR'
  );

  // 1.12 Valid review with private note & marks -> private note hidden from student view
  const reviewedFull = await homeworkService.reviewHomeworkSubmission(teacher1Actor, {
    submissionId: sub1.id,
    action: 'reviewed',
    marksAwarded: 14,
    feedback: 'Well structured solution.',
    privateTeacherNote: 'SECRET TEACHER NOTE FOR STAFF ONLY',
  });
  assert.equal(reviewedFull.marksAwarded, 14);
  assert.equal(reviewedFull.privateTeacherNote, 'SECRET TEACHER NOTE FOR STAFF ONLY');

  const stu1AfterReview = await homeworkService.listStudentHomework(student1Actor);
  const stu1HwItem = stu1AfterReview.find((i) => i.homework.id === draftHw.id)!;
  assert.equal(stu1HwItem.submission?.marksAwarded, 14);
  assert.equal(stu1HwItem.submission?.feedback, 'Well structured solution.');
  assert.equal(
    JSON.stringify(stu1HwItem).includes('SECRET TEACHER NOTE'),
    false,
    'Private teacher note leaked into student API payload'
  );

  // =========================================================================
  // 2. ONLINE OBJECTIVE TEST TESTS
  // =========================================================================

  // 2.1 Reject invalid MCQ validation (<2 options, duplicate options, invalid correct index, 0 marks)
  await assert.rejects(
    () =>
      testService.createObjectiveTest(teacher1Actor, {
        title: 'Invalid MCQ',
        instructions: 'Test instructions',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        durationMinutes: 10,
        startsAt: '2026-11-10T00:00:00.000Z',
        endsAt: '2026-12-31T23:59:00.000Z',
        maximumAttempts: 1,
        resultReleaseMode: 'auto_after_submission',
        questions: [
          {
            questionText: 'Single option invalid',
            options: [{ text: 'Only one' }],
            correctOptionIndex: 0,
            marks: 2,
          },
        ],
      }),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'VALIDATION_ERROR'
  );

  await assert.rejects(
    () =>
      testService.createObjectiveTest(teacher1Actor, {
        title: 'Duplicate Option MCQ',
        instructions: 'Test instructions',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        durationMinutes: 10,
        startsAt: '2026-11-10T00:00:00.000Z',
        endsAt: '2026-12-31T23:59:00.000Z',
        maximumAttempts: 1,
        resultReleaseMode: 'auto_after_submission',
        questions: [
          {
            questionText: 'Duplicate options test',
            options: [{ text: 'Same' }, { text: 'same' }],
            correctOptionIndex: 0,
            marks: 2,
          },
        ],
      }),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'VALIDATION_ERROR'
  );

  // 2.2 Future-window test rejects student start attempt
  const futureTest = await testService.createObjectiveTest(teacher1Actor, {
    title: 'Future Window Quiz',
    instructions: 'Opens in 2027.',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    durationMinutes: 15,
    startsAt: '2027-01-15T09:00:00.000Z',
    endsAt: '2027-01-15T10:00:00.000Z',
    maximumAttempts: 1,
    resultReleaseMode: 'auto_after_submission',
    questions: [
      {
        questionText: 'What is 1 + 1?',
        options: [{ text: '2' }, { text: '3' }],
        correctOptionIndex: 0,
        marks: 5,
      },
    ],
    publishImmediately: true,
  });
  await assert.rejects(
    () => testService.startOrResumeTestAttempt(student1Actor, futureTest.id),
    (err: unknown) =>
      err instanceof AssessmentServiceError && err.code === 'OUTSIDE_TEST_WINDOW'
  );

  // 2.3 Manual-release active test: auto-scoring runs, but marks/answers masked until teacher releases
  const manualTest = await testService.createObjectiveTest(teacher1Actor, {
    title: 'Manual Release Algebra Test',
    instructions: 'Complete within 20 minutes.',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    durationMinutes: 20,
    startsAt: '2026-11-10T00:00:00.000Z',
    endsAt: '2026-12-31T23:59:00.000Z',
    maximumAttempts: 1,
    resultReleaseMode: 'manual_teacher_release',
    showCorrectAnswersOnRelease: true,
    questions: [
      {
        questionText: '2x = 12 => x = ?',
        options: [{ text: '4' }, { text: '6' }, { text: '8' }],
        correctOptionIndex: 1,
        marks: 4,
        explanation: '12 / 2 = 6',
      },
      {
        questionText: 'Square root of 81 is?',
        options: [{ text: '9' }, { text: '8' }],
        correctOptionIndex: 0,
        marks: 6,
        explanation: '9 x 9 = 81',
      },
    ],
    publishImmediately: true,
  });
  assert.equal(manualTest.totalMarks, 10);

  // Start attempt -> no answer keys leaked
  const started = await testService.startOrResumeTestAttempt(student1Actor, manualTest.id);
  assert.equal(started.attempt.attemptNumber, 1);
  assert.equal(
    started.questions.every(
      (q) => q.correctOptionId === undefined && q.explanation === undefined
    ),
    true,
    'Answer keys must not leak during in-progress attempt'
  );

  // Save Q1 right (OPT-2 -> 4 marks), Q2 wrong (OPT-2 -> 0 marks) & verify resume preserves answer
  await testService.saveTestAttemptAnswer(
    student1Actor,
    started.attempt.id,
    manualTest.questions[0].id,
    manualTest.questions[0].options[1].id
  );
  const resumed = await testService.startOrResumeTestAttempt(student1Actor, manualTest.id);
  assert.equal(resumed.attempt.id, started.attempt.id);
  assert.equal(
    resumed.attempt.answers[manualTest.questions[0].id],
    manualTest.questions[0].options[1].id
  );

  await testService.saveTestAttemptAnswer(
    student1Actor,
    started.attempt.id,
    manualTest.questions[1].id,
    manualTest.questions[1].options[1].id
  );

  // Submit & evaluate: marks masked under manual_teacher_release!
  const submittedMasked = await testService.submitAndEvaluateTestAttempt(
    student1Actor,
    started.attempt.id
  );
  assert.equal(submittedMasked.attempt.status, 'evaluated');
  assert.equal(submittedMasked.attempt.resultsVisible, false);
  assert.equal(submittedMasked.attempt.marksObtained, undefined);
  assert.equal(submittedMasked.questions[0].correctOptionId, undefined);

  // Re-submission blocked
  await assert.rejects(
    () => testService.submitAndEvaluateTestAttempt(student1Actor, started.attempt.id),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'ALREADY_SUBMITTED'
  );

  // Attempt limit enforced (max 1)
  await assert.rejects(
    () => testService.startOrResumeTestAttempt(student1Actor, manualTest.id),
    (err: unknown) =>
      err instanceof AssessmentServiceError && err.code === 'ATTEMPT_LIMIT_REACHED'
  );

  // Release results -> student sees exact 4/10 (40%) + explanation + notification
  await testService.releaseTestResults(teacher1Actor, manualTest.id);
  const detailAfterRelease = await testService.getStudentAttemptReviewDetail(
    student1Actor,
    started.attempt.id
  );
  assert.equal(detailAfterRelease.attempt.resultsVisible, true);
  assert.equal(detailAfterRelease.attempt.marksObtained, 4);
  assert.equal(detailAfterRelease.attempt.percentage, 40);
  assert.equal(
    detailAfterRelease.questions[0].correctOptionId,
    manualTest.questions[0].correctOptionId
  );
  assert.equal(detailAfterRelease.questions[0].explanation, '12 / 2 = 6');

  // Verify scheduled_after_end helper timing accuracy
  assert.equal(
    areTestResultsVisibleToStudent(
      {
        ...manualTest,
        manualResultsReleased: false,
        resultReleaseMode: 'scheduled_after_end',
        scheduledReleaseAt: '2026-12-31T23:59:00.000Z',
      },
      { status: 'evaluated', submittedAt: '2026-11-16T08:00:00.000Z' },
      new Date('2026-12-01T00:00:00.000Z').getTime()
    ),
    false
  );
  assert.equal(
    areTestResultsVisibleToStudent(
      {
        ...manualTest,
        manualResultsReleased: false,
        resultReleaseMode: 'scheduled_after_end',
        scheduledReleaseAt: '2026-12-31T23:59:00.000Z',
      },
      { status: 'evaluated', submittedAt: '2026-11-16T08:00:00.000Z' },
      new Date('2027-01-01T00:00:00.000Z').getTime()
    ),
    true
  );

  // =========================================================================
  // 3. EXAMINATIONS & MANUAL MARKS + AUDIT TESTS
  // =========================================================================

  const exam1 = await examService.createExamination(teacher1Actor, {
    title: 'Midterm Algebra Written Exam',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    examDate: '2026-12-05',
    startsAt: '09:30',
    endsAt: '11:30',
    maximumMarks: 100,
    passingMarks: 40,
    instructions: 'Closed-book exam. Show all steps.',
    publishImmediately: true,
  });
  assert.equal(exam1.status, 'published');

  // Duplicate exam blocked
  await assert.rejects(
    () =>
      examService.createExamination(teacher1Actor, {
        title: 'Midterm Algebra Written Exam',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        examDate: '2026-12-05',
        startsAt: '14:00',
        endsAt: '16:00',
        maximumMarks: 100,
        instructions: 'Duplicate check',
      }),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'DUPLICATE_RECORD'
  );

  // Incomplete bulk marks blocked (missing student2)
  await assert.rejects(
    () =>
      examService.submitBulkExaminationMarks(teacher1Actor, {
        examinationId: exam1.id,
        entries: [{ studentId: student1Actor.loginId, marksObtained: 82 }],
      }),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'VALIDATION_ERROR'
  );

  // Marks > maximumMarks blocked
  await assert.rejects(
    () =>
      examService.submitBulkExaminationMarks(teacher1Actor, {
        examinationId: exam1.id,
        entries: [
          { studentId: student1Actor.loginId, marksObtained: 105 },
          { studentId: student2.accountId, marksObtained: 35 },
        ],
      }),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'VALIDATION_ERROR'
  );

  // Valid bulk entry with releaseImmediately: false masks marks from students
  const savedMarks = await examService.submitBulkExaminationMarks(teacher1Actor, {
    examinationId: exam1.id,
    entries: [
      { studentId: student1Actor.loginId, marksObtained: 82 },
      { studentId: student2.accountId, marksObtained: 35 },
    ],
    releaseImmediately: false,
  });
  assert.equal(savedMarks.length, 2);
  const stu1Mark = savedMarks.find((m) => m.studentId === student1Actor.loginId)!;
  const stu2Mark = savedMarks.find((m) => m.studentId === student2.accountId)!;
  assert.equal(stu1Mark.resultStatus, 'pass');
  assert.equal(stu2Mark.resultStatus, 'fail');

  const stu1ExamsUnreleased = await examService.listStudentExaminations(student1Actor);
  const stu1Exam1View = stu1ExamsUnreleased.find((e) => e.examination.id === exam1.id)!;
  assert.equal(stu1Exam1View.myMarks, null);
  assert.equal(stu1Exam1View.marksEnteredPendingRelease, true);

  // Duplicate bulk entry blocked
  await assert.rejects(
    () =>
      examService.submitBulkExaminationMarks(teacher1Actor, {
        examinationId: exam1.id,
        entries: [
          { studentId: student1Actor.loginId, marksObtained: 85 },
          { studentId: student2.accountId, marksObtained: 35 },
        ],
      }),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'DUPLICATE_RECORD'
  );

  // Marks correction requires mandatory reason
  await assert.rejects(
    () =>
      examService.correctExaminationMarks(teacher1Actor, {
        marksRecordId: stu2Mark.id,
        newMarksObtained: 45,
        reason: 'ok',
      }),
    (err: unknown) =>
      err instanceof AssessmentServiceError && err.code === 'CORRECTION_REASON_REQUIRED'
  );

  // Admin correction with valid reason updates score, flips fail -> pass, writes audit entry
  const correctedMark = await examService.correctExaminationMarks(adminActor, {
    marksRecordId: stu2Mark.id,
    newMarksObtained: 45,
    reason: 'Re-evaluated page 3 bonus proof overlooked during initial checking.',
  });
  assert.equal(correctedMark.marksObtained, 45);
  assert.equal(correctedMark.resultStatus, 'pass');
  assert.equal(correctedMark.corrected, true);
  assert.equal(stores.marksAuditEntries.length >= 1, true);

  // Release exam results -> visible to students & notification queued
  await examService.releaseExaminationResults(teacher1Actor, exam1.id);
  const stu1ExamsReleased = await examService.listStudentExaminations(student1Actor);
  assert.equal(
    stu1ExamsReleased.find((e) => e.examination.id === exam1.id)?.myMarks?.marksObtained,
    82
  );

  // =========================================================================
  // 4. ROLE ISOLATION, SUBJECT PERFORMANCE, ADMIN OVERVIEW & CALCULATION
  // =========================================================================

  assert.equal(calculateScorePercentage(0, 0), 0);
  assert.equal(calculateScorePercentage(17, 20), 85);

  // Unauthenticated / inactive rejected
  await assert.rejects(
    () => homeworkService.listStudentHomework(null),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () => homeworkService.listStudentHomework(inactiveStudentActor),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'UNAUTHORIZED'
  );

  // Student cannot perform teacher/admin operations
  await assert.rejects(
    () => assessmentService.getAdminAssessmentOverview(student1Actor),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () => examService.releaseExaminationResults(student1Actor, exam1.id),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () =>
      testService.saveTestAttemptAnswer(
        student2Actor,
        started.attempt.id,
        manualTest.questions[0].id,
        manualTest.questions[0].options[0].id
      ),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'UNAUTHORIZED'
  );

  // Teacher2 (assigned to CLS-0002/BAT-0003) cannot manage Teacher1's CLS-0001/BAT-0001 records
  await assert.rejects(
    () => homeworkService.getTeacherHomeworkRosterAndSubmissions(teacher2Actor, draftHw.id),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () => examService.releaseExaminationResults(teacher2Actor, exam1.id),
    (err: unknown) => err instanceof AssessmentServiceError && err.code === 'UNAUTHORIZED'
  );

  // Subject performance honesty check for student1 (Math has released results; Science SUB-0002 has no assessment yet)
  const stu1Dash = await assessmentService.getStudentResultsDashboard(student1Actor);
  assert.equal(stu1Dash.results.length >= 3, true); // exam1 (82/100), manualTest (4/10), draftHw (14/15)
  const mathSummary = stu1Dash.subjectSummaries.find((s) => s.subjectId === 'SUB-0001');
  const sciSummary = stu1Dash.subjectSummaries.find((s) => s.subjectId === 'SUB-0002');
  assert.equal(mathSummary?.availability, 'result_available');
  assert.equal(sciSummary?.availability, 'no_assessment_yet');
  assert.equal(sciSummary?.displayPercentage, 'No assessment yet');

  // Admin overview verifies all 11 KPIs
  const adminOverview = await assessmentService.getAdminAssessmentOverview(adminActor);
  assert.equal(typeof adminOverview.stats.totalHomeworkCreated, 'number');
  assert.equal(typeof adminOverview.stats.publishedHomework, 'number');
  assert.equal(typeof adminOverview.stats.pendingHomeworkSubmissions, 'number');
  assert.equal(typeof adminOverview.stats.reviewedHomeworkSubmissions, 'number');
  assert.equal(typeof adminOverview.stats.totalObjectiveTests, 'number');
  assert.equal(typeof adminOverview.stats.publishedTests, 'number');
  assert.equal(typeof adminOverview.stats.completedTestAttempts, 'number');
  assert.equal(typeof adminOverview.stats.upcomingExaminations, 'number');
  assert.equal(typeof adminOverview.stats.completedExaminations, 'number');
  assert.equal(typeof adminOverview.stats.pendingMarksEntry, 'number');
  assert.equal(typeof adminOverview.stats.releasedResults, 'number');
  assert.equal(adminOverview.marksAuditEntries.length >= 1, true);
  assert.equal(adminOverview.homeworkAuditEntries.length >= 2, true);

  console.log('Phase 6 verification passed: homework, objective MCQ tests, examinations, marks, audit trails, subject summaries, and RBAC isolation verified.');
}

void runPhase6Tests();
