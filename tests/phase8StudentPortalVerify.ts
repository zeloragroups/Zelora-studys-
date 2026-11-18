import assert from 'node:assert/strict';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import { LocalDevAccountService } from '../src/services/local/localAccountService';
import { LocalAcademicStore } from '../src/services/local/localAcademicStore';
import { LocalDevAcademicService } from '../src/services/local/localAcademicService';
import { LocalAttendanceStore } from '../src/services/local/localAttendanceStore';
import { LocalDevAttendanceService } from '../src/services/local/localAttendanceService';
import { LocalAssessmentStores } from '../src/services/local/localAssessmentStores';
import { LocalDevHomeworkService } from '../src/services/local/localHomeworkService';
import { LocalDevTestService } from '../src/services/local/localTestService';
import { LocalDevExaminationService } from '../src/services/local/localExaminationService';
import { LocalDevAssessmentService } from '../src/services/local/localAssessmentService';
import { LocalFinanceStore } from '../src/services/local/localFinanceStore';
import { LocalDevFeeService } from '../src/services/local/localDevFeeService';
import { LocalDevPaymentService } from '../src/services/local/localDevPaymentService';
import { LocalDevReceiptService } from '../src/services/local/localDevReceiptService';
import { LocalDevStudentPortalService } from '../src/services/local/localStudentPortalService';
import { StudentPortalError } from '../src/services/contracts/studentPortalService';
import { FinanceServiceError } from '../src/services/contracts/financeService';
import { AttendanceServiceError } from '../src/services/contracts/attendanceService';
import { AssessmentServiceError } from '../src/services/contracts/assessmentService';
import type { AuthPrincipal } from '../src/types';

async function expectPortalUnauthorized(
  fn: () => Promise<unknown>,
  context: string
) {
  let caught: unknown = null;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof StudentPortalError,
    `${context}: expected StudentPortalError, got ${String(caught)}`
  );
  assert.equal(caught.code, 'UNAUTHORIZED', `${context}: expected UNAUTHORIZED`);
}

async function runPhase8Tests() {
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

  const attendanceStore = new LocalAttendanceStore({
    academicStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const attendanceService = new LocalDevAttendanceService(attendanceStore);

  const assessmentStores = new LocalAssessmentStores({
    academicStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const homeworkService = new LocalDevHomeworkService(assessmentStores);
  const testService = new LocalDevTestService(assessmentStores);
  const examService = new LocalDevExaminationService(assessmentStores);
  const assessmentService = new LocalDevAssessmentService(assessmentStores);

  const financeStore = new LocalFinanceStore({
    academicStore,
    attendanceStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const feeService = new LocalDevFeeService(financeStore);
  const paymentService = new LocalDevPaymentService(financeStore);
  const receiptService = new LocalDevReceiptService(financeStore);

  const studentPortalService = new LocalDevStudentPortalService({
    accountStore,
    academicStore,
    academicService,
    attendanceService,
    homeworkService,
    testService,
    examinationService: examService,
    assessmentService,
    feeService,
    skipPersistence: true,
  });

  const adminActor = accountStore.findAuthPrincipalByLoginId('ADM-0001')!;
  const teacher1Actor = accountStore.findAuthPrincipalByLoginId('TCH-0001')!;
  const student1Actor = accountStore.findAuthPrincipalByLoginId('STU-0001')!;

  // Provision additional students for batch isolation, unenrolled & inactive-enrolment tests
  const student2 = await accountService.createStudentAccount(adminActor, {
    name: 'Diya Nair',
    classId: 'cls-10',
    batchId: 'bat-10a',
    phone: '+91 98220 71111',
    initialPassword: 'StudPass@2026',
    status: 'active',
  });
  const student2Actor = accountStore.findAuthPrincipalByLoginId(student2.accountId)!;
  await academicService.enrolStudent(adminActor, {
    studentAccountId: student2.accountId,
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
  });

  const student3 = await accountService.createStudentAccount(adminActor, {
    name: 'Kabir Verma',
    classId: 'cls-12',
    batchId: 'bat-12a',
    phone: '+91 98220 72222',
    initialPassword: 'StudPass@2026',
    status: 'active',
  });
  const student3Actor = accountStore.findAuthPrincipalByLoginId(student3.accountId)!;
  await academicService.enrolStudent(adminActor, {
    studentAccountId: student3.accountId,
    classId: 'CLS-0002',
    batchId: 'BAT-0003',
  });

  const unenrolledStudent = await accountService.createStudentAccount(adminActor, {
    name: 'Tanya Rao',
    classId: 'cls-10',
    batchId: 'bat-10a',
    phone: '+91 98220 73333',
    initialPassword: 'StudPass@2026',
    status: 'active',
  });
  const unenrolledActor = accountStore.findAuthPrincipalByLoginId(
    unenrolledStudent.accountId
  )!;

  const inactiveEnrolStudent = await accountService.createStudentAccount(adminActor, {
    name: 'Nikhil Joshi',
    classId: 'cls-10',
    batchId: 'bat-10a',
    phone: '+91 98220 74444',
    initialPassword: 'StudPass@2026',
    status: 'active',
  });
  const inactiveEnrolActor = accountStore.findAuthPrincipalByLoginId(
    inactiveEnrolStudent.accountId
  )!;
  const tempEnrol = await academicService.enrolStudent(adminActor, {
    studentAccountId: inactiveEnrolStudent.accountId,
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
  });
  await academicService.setEnrolmentStatus(
    adminActor,
    tempEnrol.enrolmentId,
    'inactive'
  );

  const deactivatedActor: AuthPrincipal = {
    ...student1Actor,
    status: 'deactivated',
  };

  // =========================================================================
  // 1. MODULE M — AUTHENTICATION & ACCESS CONTROL ON STUDENT PORTAL SERVICE
  // =========================================================================
  await expectPortalUnauthorized(
    () => studentPortalService.getMyStudentProfile(null),
    'Unauthenticated profile read'
  );
  await expectPortalUnauthorized(
    () => studentPortalService.getMyStudentDashboard(adminActor),
    'Admin blocked from student dashboard service'
  );
  await expectPortalUnauthorized(
    () => studentPortalService.getMyStudentDashboard(teacher1Actor),
    'Teacher blocked from student dashboard service'
  );
  await expectPortalUnauthorized(
    () => studentPortalService.getMyStudentNotificationsAndAnnouncements(deactivatedActor),
    'Deactivated student blocked from notifications'
  );

  // =========================================================================
  // 2. MODULE B & STATUS — PROFILE SECURITY & UNENROLLED/INACTIVE EMPTY STATES
  // =========================================================================
  const stu1Profile = await studentPortalService.getMyStudentProfile(student1Actor);
  assert.equal(stu1Profile.studentId, 'STU-0001');
  assert.equal(stu1Profile.classId, 'CLS-0001');
  assert.equal(stu1Profile.batchId, 'BAT-0001');
  assert.equal(stu1Profile.enrolmentStatus, 'active');
  assert.equal(stu1Profile.sharedWithParent, true);
  assert.ok(stu1Profile.immutableNotice.length > 20);
  const profileJson = JSON.stringify(stu1Profile).toLowerCase();
  assert.equal(profileJson.includes('password'), false, 'No password fields in profile');
  assert.equal(profileJson.includes('hash'), false, 'No hash fields in profile');

  const unenrolledDash = await studentPortalService.getMyStudentDashboard(unenrolledActor);
  assert.equal(unenrolledDash.profile.enrolmentStatus, 'not_enrolled');
  assert.equal(unenrolledDash.attendanceSummary.percentage, null);
  assert.equal(unenrolledDash.upcomingHomework.length, 0);
  assert.equal(unenrolledDash.upcomingOrAvailableTests.length, 0);
  assert.equal(unenrolledDash.upcomingExaminations.length, 0);
  assert.equal(unenrolledDash.recentReleasedResults.length, 0);

  const inactiveEnrolProfile = await studentPortalService.getMyStudentProfile(
    inactiveEnrolActor
  );
  assert.equal(inactiveEnrolProfile.enrolmentStatus, 'inactive');
  assert.equal(inactiveEnrolProfile.classId, undefined);
  assert.equal(inactiveEnrolProfile.batchId, undefined);

  // Zero-denominator attendance on newly enrolled student3
  const stu3InitialDash = await studentPortalService.getMyStudentDashboard(student3Actor);
  assert.equal(stu3InitialDash.attendanceSummary.percentage, null);
  assert.equal(stu3InitialDash.attendanceSummary.displayPercentage, 'Not available');

  // =========================================================================
  // 3. MODULE A, D, E, F — HOMEWORK, TESTS, EXAMS, RESULTS & MONTH/YEAR FILTERING
  // =========================================================================
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentYear = todayIso.slice(0, 4);
  const currentMonth = todayIso.slice(0, 7);

  // Create draft homework (must not appear) & due-today homework & overdue homework
  const draftHw = await homeworkService.createHomework(teacher1Actor, {
    title: 'Hidden Draft Geometry Sheet',
    instructions: 'Internal draft instructions only.',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    dueAt: `${todayIso}T23:59:00.000Z`,
    maximumMarks: 10,
    publishImmediately: false,
  });

  const dueTodayHw = await homeworkService.createHomework(teacher1Actor, {
    title: 'Phase 8 Due Today Quadratics',
    instructions: 'Solve equations 1 to 5 in plain text step by step.',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    dueAt: `${todayIso}T23:59:00.000Z`,
    maximumMarks: 20,
    publishImmediately: true,
  });

  const overdueHw = await homeworkService.createHomework(teacher1Actor, {
    title: 'Phase 8 Overdue Practice',
    instructions: 'Complete factorisation practice questions cleanly.',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    dueAt: '2025-02-01T18:00:00.000Z',
    maximumMarks: 10,
    publishImmediately: true,
  });

  const dashBeforeSubmit = await studentPortalService.getMyStudentDashboard(student1Actor);
  assert.equal(
    dashBeforeSubmit.upcomingHomework.some((h) => h.homework.id === draftHw.id),
    false,
    'Draft homework must stay hidden from student dashboard'
  );
  assert.ok(dashBeforeSubmit.dueTodayHomeworkCount >= 1);
  assert.ok(dashBeforeSubmit.overdueHomeworkCount >= 1);

  // Cross-batch student3 cannot see BAT-0001 homework
  const stu3Hw = await homeworkService.listStudentHomework(student3Actor);
  assert.equal(stu3Hw.some((h) => h.homework.id === dueTodayHw.id), false);

  // Text-only submission -> teacher returns for revision with private note -> resubmission
  const sub1 = await homeworkService.submitStudentHomework(
    student1Actor,
    dueTodayHw.id,
    'Solution step 1: x^2 - 5x + 6 = 0 gives (x-2)(x-3)=0.'
  );
  await homeworkService.reviewHomeworkSubmission(teacher1Actor, {
    submissionId: sub1.id,
    action: 'returned_for_correction',
    feedback: 'Please also state roots explicitly.',
    privateTeacherNote: 'TOP SECRET STAFF NOTE NEVER FOR STUDENT',
  });
  const sub2 = await homeworkService.submitStudentHomework(
    student1Actor,
    dueTodayHw.id,
    'Solution step 1 & roots: x = 2 or x = 3.'
  );
  assert.equal(sub2.revisionNumber, 2);
  assert.equal(sub2.revisionHistory.length, 2);

  await homeworkService.reviewHomeworkSubmission(teacher1Actor, {
    submissionId: sub1.id,
    action: 'reviewed',
    marksAwarded: 18,
    feedback: 'Clear and complete.',
    privateTeacherNote: 'INTERNAL SCORE MEMO',
  });
  const stu1HwCheck = await homeworkService.listStudentHomework(student1Actor);
  assert.equal(
    JSON.stringify(stu1HwCheck).includes('INTERNAL SCORE MEMO'),
    false,
    'Private teacher note must never leak to student homework payload'
  );

  // Manual-release online test: hides answer keys before/after submission until released
  const manualTest = await testService.createObjectiveTest(teacher1Actor, {
    title: 'Phase 8 Manual Release MCQ',
    instructions: 'Attempt carefully. Do not refresh.',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    durationMinutes: 15,
    startsAt: '2026-10-01T00:00:00.000Z',
    endsAt: '2027-12-31T23:59:00.000Z',
    maximumAttempts: 1,
    resultReleaseMode: 'manual_teacher_release',
    showCorrectAnswersOnRelease: true,
    questions: [
      {
        questionText: 'What is 7 x 6?',
        options: [{ text: '42' }, { text: '48' }],
        correctOptionIndex: 0,
        marks: 10,
        explanation: '7 multiplied by 6 equals 42.',
      },
    ],
    publishImmediately: true,
  });

  const startedAttempt = await testService.startOrResumeTestAttempt(
    student1Actor,
    manualTest.id
  );
  assert.equal(startedAttempt.questions[0].correctOptionId, undefined);
  await testService.saveTestAttemptAnswer(
    student1Actor,
    startedAttempt.attempt.id,
    manualTest.questions[0].id,
    manualTest.questions[0].options[0].id
  );
  const subTest = await testService.submitAndEvaluateTestAttempt(
    student1Actor,
    startedAttempt.attempt.id
  );
  assert.equal(subTest.attempt.resultsVisible, false);
  assert.equal(subTest.attempt.marksObtained, undefined);

  // Examination marks masked until release
  const exam1 = await examService.createExamination(teacher1Actor, {
    title: 'Phase 8 Term Exam',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    examDate: todayIso,
    startsAt: '10:00',
    endsAt: '12:00',
    maximumMarks: 50,
    passingMarks: 20,
    instructions: 'Show full working.',
    publishImmediately: true,
  });
  await examService.submitBulkExaminationMarks(teacher1Actor, {
    examinationId: exam1.id,
    entries: [
      { studentId: 'STU-0001', marksObtained: 44 },
      { studentId: student2.accountId, marksObtained: 38 },
      { studentId: student3.accountId, marksObtained: 0 }, // wait: student3 is BAT-0003!
    ].filter((e) => e.studentId !== student3.accountId),
    releaseImmediately: false,
  });

  const resBeforeRelease = await assessmentService.getStudentResultsDashboard(
    student1Actor
  );
  assert.equal(
    resBeforeRelease.results.some((r) => r.relatedId === exam1.id),
    false,
    'Unreleased exam marks must not appear in results'
  );
  assert.ok(resBeforeRelease.unreleasedPendingCount >= 2);

  // Release test & exam -> visible with latestResultDisplay and Month/Year filter
  await testService.releaseTestResults(teacher1Actor, manualTest.id);
  await examService.releaseExaminationResults(teacher1Actor, exam1.id);

  const resFiltered = await assessmentService.getStudentResultsDashboard(
    student1Actor,
    { year: currentYear, month: currentMonth }
  );
  assert.ok(
    resFiltered.results.some((r) => r.relatedId === exam1.id && r.marksObtained === 44)
  );
  assert.ok(
    resFiltered.results.some((r) => r.relatedId === manualTest.id && r.marksObtained === 10)
  );
  const sub1Perf = resFiltered.subjectSummaries.find((s) => s.subjectId === 'SUB-0001')!;
  assert.equal(sub1Perf.availability, 'result_available');
  assert.ok(sub1Perf.latestResultDisplay && sub1Perf.latestResultTitle);

  const resWrongYear = await assessmentService.getStudentResultsDashboard(
    student1Actor,
    { year: '2099' }
  );
  assert.equal(resWrongYear.results.length, 0);

  // =========================================================================
  // 4. MODULE C, G, H, I — ATTENDANCE, ANNOUNCEMENTS, UNIFIED NOTIFICATIONS & ISOLATION
  // =========================================================================
  // Submit absence for student1 on a fresh date so Attendance notification is emitted
  await attendanceService.submitAttendanceSession(teacher1Actor, {
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    sessionDate: '2026-11-18',
    sessionType: 'regular',
    marks: [
      { studentId: 'STU-0001', status: 'absent' },
      { studentId: student2.accountId, status: 'present' },
    ],
  });

  // Announcements: batch-targeted BAT-0001 visible to STU-0001, hidden from student3 (BAT-0003); draft hidden from all
  const bat1Notice = await academicService.createAnnouncement(adminActor, {
    title: 'Batch 10A Extra Doubt Class',
    content: 'Doubt solving session starts at 4 PM on Saturday.',
    audience: 'batch',
    targetBatchId: 'BAT-0001',
    publishImmediately: true,
  });
  const draftNotice = await academicService.createAnnouncement(adminActor, {
    title: 'Draft Admin Notice',
    content: 'Unpublished notice text.',
    audience: 'students',
    publishImmediately: false,
  });

  const stu1NotifBundle =
    await studentPortalService.getMyStudentNotificationsAndAnnouncements(student1Actor);
  const stu3NotifBundle =
    await studentPortalService.getMyStudentNotificationsAndAnnouncements(student3Actor);

  // Announcement audience + draft verification
  assert.ok(
    stu1NotifBundle.announcements.some(
      (a) => a.announcement.announcementId === bat1Notice.announcementId
    )
  );
  assert.equal(
    stu3NotifBundle.announcements.some(
      (a) => a.announcement.announcementId === bat1Notice.announcementId
    ),
    false,
    'Batch 10A announcement must not leak to Batch 12A student'
  );
  assert.equal(
    stu1NotifBundle.announcements.some(
      (a) => a.announcement.announcementId === draftNotice.announcementId
    ),
    false
  );

  // Announcement viewed state
  const unreadAnnBefore = stu1NotifBundle.unreadAnnouncementsCount;
  assert.ok(unreadAnnBefore >= 1);
  await studentPortalService.markStudentAnnouncementViewed(
    student1Actor,
    bat1Notice.announcementId
  );
  const afterOneView =
    await studentPortalService.getMyStudentNotificationsAndAnnouncements(student1Actor);
  assert.equal(afterOneView.unreadAnnouncementsCount, unreadAnnBefore - 1);

  await studentPortalService.markAllStudentAnnouncementsViewed(student1Actor);
  const afterAllView =
    await studentPortalService.getMyStudentNotificationsAndAnnouncements(student1Actor);
  assert.equal(afterAllView.unreadAnnouncementsCount, 0);

  // Unified Notifications: attendance + homework_tests + exams_results + fees_receipts, deduplicated
  const categoriesPresent = new Set(stu1NotifBundle.notifications.map((n) => n.category));
  assert.ok(categoriesPresent.has('attendance'), 'Attendance alerts integrated');
  assert.ok(categoriesPresent.has('homework_tests'), 'Homework/test alerts integrated');
  assert.ok(categoriesPresent.has('exams_results'), 'Exam/result alerts integrated');

  const dedupeKeys = stu1NotifBundle.notifications.map((n) => n.dedupeKey);
  assert.equal(
    new Set(dedupeKeys).size,
    dedupeKeys.length,
    'Unified notifications must have zero duplicate dedupeKeys'
  );

  // Student3 cannot view or mark STU-0001's attendance notification
  const stu1AttNotif = stu1NotifBundle.notifications.find(
    (n) => n.category === 'attendance' && !n.isRead
  )!;
  assert.ok(stu1AttNotif);
  await assert.rejects(
    () => studentPortalService.markStudentNotificationRead(student3Actor, stu1AttNotif.id),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () =>
      studentPortalService.markStudentAnnouncementViewed(
        student3Actor,
        bat1Notice.announcementId
      ),
    (err: unknown) => err instanceof StudentPortalError && err.code === 'NOT_FOUND'
  );

  // Category-specific markAllRead marks attendance only, preserving assessment/fee unread
  await studentPortalService.markAllStudentNotificationsRead(student1Actor, 'attendance');
  const afterAttRead =
    await studentPortalService.getMyStudentNotificationsAndAnnouncements(student1Actor);
  assert.equal(afterAttRead.unreadByCategory.attendance, 0);
  assert.ok(
    afterAttRead.unreadTotal > 0,
    'Category mark-all-read must preserve unread notifications in other categories'
  );

  // Mark all notifications read across all sources
  await studentPortalService.markAllStudentNotificationsRead(student1Actor, 'all');
  const afterAllNotifRead =
    await studentPortalService.getMyStudentNotificationsAndAnnouncements(student1Actor);
  assert.equal(afterAllNotifRead.unreadTotal, 0);

  // =========================================================================
  // 5. MODULE J — FINANCIAL REGRESSION & RECEIPT VERIFICATION IN DASHBOARD
  // =========================================================================
  const stu1FeeBefore = await feeService.getStudentFeeDashboard(student1Actor);
  const unpaidStu1Acc = stu1FeeBefore.accounts.find(
    (a) => a.account.remainingBalancePaise > 0
  )!;
  assert.ok(unpaidStu1Acc, 'STU-0001 seeded with an unpaid fee account');
  const initialRemaining = unpaidStu1Acc.account.remainingBalancePaise;

  // UPI preparation never alters remaining balance
  const prep = await paymentService.prepareUpiPayment(student1Actor, {
    feeAccountId: unpaidStu1Acc.account.id,
    amountRupees: 1000,
    idempotencyKey: 'PHASE8-STU1-1000',
  });
  const afterPrep = await feeService.getStudentFeeDashboard(student1Actor);
  assert.equal(
    afterPrep.accounts.find((a) => a.account.id === unpaidStu1Acc.account.id)!.account
      .remainingBalancePaise,
    initialRemaining
  );

  // Submit partial claim -> balance stays unchanged until Admin verifies
  const claim = await paymentService.submitPaymentClaim(student1Actor, {
    feeAccountId: unpaidStu1Acc.account.id,
    preparedPaymentId: prep.id,
    paymentReference: prep.paymentReference,
    amountRupees: 1000,
    transactionReference: 'UTR888811112222',
    paymentDate: todayIso,
  });
  const afterClaim = await feeService.getStudentFeeDashboard(student1Actor);
  assert.equal(
    afterClaim.accounts.find((a) => a.account.id === unpaidStu1Acc.account.id)!.account
      .verifiedAmountPaidPaise,
    unpaidStu1Acc.account.verifiedAmountPaidPaise
  );

  // Student3 cannot access STU-0001's prepared UPI or receipts
  await assert.rejects(
    () =>
      paymentService.submitPaymentClaim(student3Actor, {
        feeAccountId: unpaidStu1Acc.account.id,
        amountRupees: 500,
        transactionReference: 'UTR999900001111',
        paymentDate: todayIso,
      }),
    (err: unknown) => err instanceof FinanceServiceError && err.code === 'UNAUTHORIZED'
  );

  // Admin verifies claim -> receipt issued -> dashboard feeSummary reflects updated balance & activity
  const verified = await paymentService.verifyPaymentClaim(adminActor, {
    claimId: claim.claim.id,
    confirmIndependentCheck: true,
    verificationNote: 'Phase 8 regression verification',
  });
  assert.equal(verified.receipt.status, 'issued');

  const stu1ReceiptCheck = await receiptService.getReceiptById(
    student1Actor,
    verified.receipt.id
  );
  assert.equal(stu1ReceiptCheck.receiptNumber, verified.receipt.receiptNumber);

  await assert.rejects(
    () => receiptService.getReceiptById(student3Actor, verified.receipt.id),
    (err: unknown) => err instanceof FinanceServiceError && err.code === 'UNAUTHORIZED'
  );

  const finalDashboard = await studentPortalService.getMyStudentDashboard(student1Actor);
  assert.equal(
    finalDashboard.feeSummary.totalRemainingBalancePaise,
    afterClaim.totalRemainingBalancePaise - 100000
  );
  const activityKeys = finalDashboard.recentActivity.map((a) => a.dedupeKey);
  assert.equal(
    new Set(activityKeys).size,
    activityKeys.length,
    'Dashboard recentActivity must never contain duplicate entries'
  );
  assert.ok(
    finalDashboard.recentActivity.some(
      (a) => a.category === 'fee' && a.title.includes(verified.receipt.receiptNumber)
    )
  );

  console.log('Phase 8 Student Web App & Workspace Integration verification PASSED.');
}

runPhase8Tests().catch((err) => {
  console.error('Phase 8 verification FAILED:', err);
  process.exit(1);
});
