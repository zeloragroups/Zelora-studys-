/**
 * Security Audit — Firestore Security Rules Automated Verification Suite
 *
 * Tests all 20 adversarial attack scenarios defined in /security_spec.md
 * plus authorized Admin, Teacher (assigned), and Student (own) operations.
 *
 * Execution (requires Java 17+ and Firebase CLI Emulator):
 *   firebase emulators:exec --only firestore "npx tsx tests/firestore.rules.test.ts"
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'academy-0007';
const ADMIN_UID = 'uid-adm-0001';
const DEACTIVATED_ADMIN_UID = 'uid-adm-deactivated';
const TEACHER_A_UID = 'uid-tch-0001';
const TEACHER_B_UID = 'uid-tch-0002';
const STUDENT_A_UID = 'uid-stu-0001';
const STUDENT_B_UID = 'uid-stu-0002';
const DEACTIVATED_STUDENT_UID = 'uid-stu-deactivated';

async function seedTestBaseline(testEnv: RulesTestEnvironment): Promise<void> {
  const now = new Date().toISOString();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, 'admins', ADMIN_UID), {
      uid: ADMIN_UID,
      accountId: 'ADM-0001',
      email: '07alphabro@gmail.com',
      status: 'active',
      createdAt: now,
    });

    await setDoc(doc(db, 'admins', DEACTIVATED_ADMIN_UID), {
      uid: DEACTIVATED_ADMIN_UID,
      accountId: 'ADM-0002',
      email: '07alphabro@gmail.com',
      status: 'deactivated',
      createdAt: now,
    });

    await setDoc(doc(db, 'users', TEACHER_A_UID), {
      uid: TEACHER_A_UID,
      accountId: 'TCH-0001',
      role: 'teacher',
      name: 'Teacher Alpha',
      phone: '9800000001',
      status: 'active',
      adminUids: [ADMIN_UID],
      createdAt: now,
    });

    await setDoc(doc(db, 'users', TEACHER_B_UID), {
      uid: TEACHER_B_UID,
      accountId: 'TCH-0002',
      role: 'teacher',
      name: 'Teacher Beta',
      phone: '9800000002',
      status: 'active',
      adminUids: [ADMIN_UID],
      createdAt: now,
    });

    await setDoc(doc(db, 'users', STUDENT_A_UID), {
      uid: STUDENT_A_UID,
      accountId: 'STU-0001',
      role: 'student',
      name: 'Student Alpha',
      phone: '9800000011',
      status: 'active',
      adminUids: [ADMIN_UID],
      createdAt: now,
    });

    await setDoc(doc(db, 'users', STUDENT_B_UID), {
      uid: STUDENT_B_UID,
      accountId: 'STU-0002',
      role: 'student',
      name: 'Student Beta',
      phone: '9800000012',
      status: 'active',
      adminUids: [ADMIN_UID],
      createdAt: now,
    });

    await setDoc(doc(db, 'users', DEACTIVATED_STUDENT_UID), {
      uid: DEACTIVATED_STUDENT_UID,
      accountId: 'STU-0099',
      role: 'student',
      name: 'Deactivated Student',
      phone: '9800000099',
      status: 'deactivated',
      adminUids: [ADMIN_UID],
      createdAt: now,
    });

    await setDoc(doc(db, 'authIdMappings', 'ADM-0001'), {
      loginId: 'ADM-0001',
      uid: ADMIN_UID,
      authEmail: '07alphabro@gmail.com',
      role: 'admin',
      status: 'active',
      createdAt: now,
    });

    await setDoc(doc(db, 'classes', 'CLS-0001'), {
      id: 'CLS-0001',
      classId: 'CLS-0001',
      name: 'Class 10',
      status: 'active',
      createdAt: now,
    });

    await setDoc(doc(db, 'batches', 'BAT-0001'), {
      id: 'BAT-0001',
      batchId: 'BAT-0001',
      name: 'Batch A',
      classId: 'CLS-0001',
      status: 'active',
      createdAt: now,
    });

    await setDoc(doc(db, 'subjects', 'SUB-0001'), {
      id: 'SUB-0001',
      subjectId: 'SUB-0001',
      name: 'Mathematics',
      classIds: ['CLS-0001'],
      status: 'active',
      createdAt: now,
    });

    await setDoc(doc(db, 'enrolments', 'ENR-0001'), {
      id: 'ENR-0001',
      enrolmentId: 'ENR-0001',
      studentAccountId: 'STU-0001',
      studentUid: STUDENT_A_UID,
      studentName: 'Student Alpha',
      classId: 'CLS-0001',
      batchId: 'BAT-0001',
      enrolmentDate: '2026-11-01',
      status: 'active',
      adminUids: [ADMIN_UID],
      teacherUids: [TEACHER_A_UID],
      createdAt: now,
    });

    await setDoc(doc(db, 'homework', 'HW-0001'), {
      id: 'HW-0001',
      title: 'Algebra Practice',
      instructions: 'Solve exercises 1-10 in notebook.',
      classId: 'CLS-0001',
      batchId: 'BAT-0001',
      subjectId: 'SUB-0001',
      teacherId: 'TCH-0001',
      teacherUid: TEACHER_A_UID,
      assignedAt: now,
      dueAt: now,
      status: 'published',
      adminUids: [ADMIN_UID],
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(doc(db, 'homeworkSubmissions', 'HSUB-0001'), {
      id: 'HSUB-0001',
      homeworkId: 'HW-0001',
      studentId: 'STU-0001',
      studentUid: STUDENT_A_UID,
      teacherUid: TEACHER_A_UID,
      responseText: 'Completed exercise 1 to 10.',
      submittedAt: now,
      status: 'submitted',
      revisionNumber: 1,
      revisionHistory: [{ revisionNumber: 1, responseText: 'Completed exercise 1 to 10.', submittedAt: now }],
      adminUids: [ADMIN_UID],
    });

    await setDoc(doc(db, 'homeworkSubmissions', 'HSUB-0001', 'private', 'teacherNote'), {
      submissionId: 'HSUB-0001',
      teacherUid: TEACHER_A_UID,
      privateTeacherNote: 'Needs extra practice on quadratics.',
      updatedAt: now,
    });

    await setDoc(doc(db, 'objectiveTests', 'TST-0001'), {
      id: 'TST-0001',
      title: 'Unit Quiz 1',
      instructions: 'Answer all MCQs.',
      classId: 'CLS-0001',
      batchId: 'BAT-0001',
      subjectId: 'SUB-0001',
      teacherId: 'TCH-0001',
      teacherUid: TEACHER_A_UID,
      durationMinutes: 30,
      totalMarks: 20,
      startsAt: now,
      endsAt: now,
      maximumAttempts: 1,
      resultReleaseMode: 'manual_teacher_release',
      showCorrectAnswersOnRelease: true,
      manualResultsReleased: false,
      status: 'active',
      questions: [{ id: 'Q1', prompt: '2+2?', options: [{ id: 'A', text: '4' }], marks: 5 }],
      adminUids: [ADMIN_UID],
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(doc(db, 'objectiveTests', 'TST-0001', 'private', 'answerKey'), {
      testId: 'TST-0001',
      teacherUid: TEACHER_A_UID,
      answers: [{ questionId: 'Q1', correctOptionId: 'A' }],
      updatedAt: now,
    });

    await setDoc(doc(db, 'testAttempts', 'ATT-TST-0001'), {
      id: 'ATT-TST-0001',
      testId: 'TST-0001',
      studentId: 'STU-0001',
      studentUid: STUDENT_A_UID,
      teacherUid: TEACHER_A_UID,
      attemptNumber: 1,
      startedAt: now,
      expiresAt: now,
      status: 'in_progress',
      answers: {},
      totalMarks: 20,
      adminUids: [ADMIN_UID],
    });

    await setDoc(doc(db, 'examinations', 'EXM-0001'), {
      id: 'EXM-0001',
      title: 'Midterm Exam',
      classId: 'CLS-0001',
      batchId: 'BAT-0001',
      subjectId: 'SUB-0001',
      teacherId: 'TCH-0001',
      teacherUid: TEACHER_A_UID,
      examDate: '2026-10-15',
      startsAt: now,
      endsAt: now,
      maximumMarks: 100,
      instructions: 'Closed book.',
      status: 'completed',
      resultsReleased: false,
      adminUids: [ADMIN_UID],
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(doc(db, 'examinationMarks', 'EMRK-0001'), {
      id: 'EMRK-0001',
      examinationId: 'EXM-0001',
      studentId: 'STU-0001',
      studentUid: STUDENT_A_UID,
      teacherUid: TEACHER_A_UID,
      marksObtained: 88,
      maximumMarks: 100,
      percentage: 88,
      resultStatus: 'pass',
      resultsReleased: false,
      enteredBy: 'TCH-0001',
      enteredAt: now,
      updatedAt: now,
      adminUids: [ADMIN_UID],
    });

    await setDoc(doc(db, 'studentFeeAccounts', 'FEE-0001'), {
      id: 'FEE-0001',
      studentId: 'STU-0001',
      studentUid: STUDENT_A_UID,
      feeConfigurationId: 'FCFG-0001',
      feePeriod: '2026-11',
      periodLabel: 'Nov 2026',
      frequency: 'monthly',
      amountDuePaise: 250000,
      verifiedAmountPaidPaise: 0,
      remainingBalancePaise: 250000,
      dueAt: now,
      status: 'unpaid',
      adminUids: [ADMIN_UID],
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(doc(db, 'studentFeeAccounts', 'FEE-0002'), {
      id: 'FEE-0002',
      studentId: 'STU-0002',
      studentUid: STUDENT_B_UID,
      feeConfigurationId: 'FCFG-0001',
      feePeriod: '2026-11',
      periodLabel: 'Nov 2026',
      frequency: 'monthly',
      amountDuePaise: 250000,
      verifiedAmountPaidPaise: 0,
      remainingBalancePaise: 250000,
      dueAt: now,
      status: 'unpaid',
      adminUids: [ADMIN_UID],
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(doc(db, 'paymentClaims', 'PCLM-0001'), {
      id: 'PCLM-0001',
      paymentReference: 'PREF-0001',
      studentId: 'STU-0001',
      studentUid: STUDENT_A_UID,
      feeAccountId: 'FEE-0001',
      feePeriod: '2026-11',
      amountPaise: 250000,
      transactionReference: 'UTR000111222',
      paymentDate: '2026-11-18',
      status: 'verification_pending',
      duplicateTransactionFlag: false,
      submittedAt: now,
      adminUids: [ADMIN_UID],
    });

    await setDoc(doc(db, 'teacherSalaryPeriods', 'SPER-0002'), {
      id: 'SPER-0002',
      teacherId: 'TCH-0002',
      teacherUid: TEACHER_B_UID,
      teacherName: 'Teacher Beta',
      salaryConfigurationId: 'SCFG-0002',
      period: '2026-11',
      periodLabel: 'Nov 2026',
      salaryModel: 'fixed_monthly',
      ratePaise: 3000000,
      eligibleSessionIds: [],
      eligibleSessionsSummary: 'Monthly',
      requiresAdminReview: false,
      payableAmountPaise: 3000000,
      paidAmountPaise: 0,
      remainingAmountPaise: 3000000,
      status: 'pending',
      adminUids: [ADMIN_UID],
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(doc(db, 'financialAudit', 'FAUD-0001'), {
      id: 'FAUD-0001',
      actorId: 'ADM-0001',
      action: 'fee_config_created',
      adminUids: [ADMIN_UID],
      createdAt: now,
    });
  });
}

async function runRulesSecurityTests(): Promise<void> {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
    },
  });

  try {
    await seedTestBaseline(testEnv);
    const now = new Date().toISOString();

    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const adminDb = testEnv
      .authenticatedContext(ADMIN_UID, {
        email: '07alphabro@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const deactivatedAdminDb = testEnv
      .authenticatedContext(DEACTIVATED_ADMIN_UID, {
        email: '07alphabro@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const unverifiedAdminDb = testEnv
      .authenticatedContext(ADMIN_UID, {
        email: '07alphabro@gmail.com',
        email_verified: false,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const unauthorizedGoogleDb = testEnv
      .authenticatedContext('uid-other-google', {
        email: 'other.user@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const teacherADb = testEnv
      .authenticatedContext(TEACHER_A_UID, {
        email: 'tch-0001@auth.academy-0007.internal',
        email_verified: false,
      })
      .firestore();
    const teacherBDb = testEnv
      .authenticatedContext(TEACHER_B_UID, {
        email: 'tch-0002@auth.academy-0007.internal',
        email_verified: false,
      })
      .firestore();
    const studentADb = testEnv
      .authenticatedContext(STUDENT_A_UID, {
        email: 'stu-0001@auth.academy-0007.internal',
        email_verified: false,
      })
      .firestore();
    const deactivatedStudentDb = testEnv
      .authenticatedContext(DEACTIVATED_STUDENT_UID, {
        email: 'stu-0099@auth.academy-0007.internal',
        email_verified: false,
      })
      .firestore();
    const unlinkedAuthDb = testEnv
      .authenticatedContext('uid-unlinked-auth', {
        email: 'stranger@example.com',
        email_verified: false,
      })
      .firestore();

    // Scenario 1: Unauthenticated user reads private Student data
    await assertFails(getDocs(collection(unauthDb, 'users')));
    await assertFails(getDoc(doc(unauthDb, 'studentFeeAccounts', 'FEE-0001')));

    // Scenario 2: Unauthenticated user reads Teacher data
    await assertFails(getDoc(doc(unauthDb, 'teacherSalaryPeriods', 'SPER-0002')));
    await assertFails(getDoc(doc(unauthDb, 'users', TEACHER_A_UID)));

    // Scenario 3: Unauthorized Google account accesses Admin
    await assertFails(getDoc(doc(unauthorizedGoogleDb, 'authIdMappings', 'ADM-0001')));
    await assertFails(
      setDoc(doc(unauthorizedGoogleDb, 'admins', 'uid-other-google'), {
        uid: 'uid-other-google',
        accountId: 'ADM-9999',
        email: 'other.user@gmail.com',
        status: 'active',
        createdAt: now,
      })
    );

    // Scenario 4: Student accesses another Student's record
    await assertFails(getDoc(doc(studentADb, 'studentFeeAccounts', 'FEE-0002')));
    await assertFails(getDoc(doc(studentADb, 'users', STUDENT_B_UID)));

    // Scenario 5: Teacher accesses unassigned class/enrolments or unowned homework
    await assertFails(getDocs(query(collection(teacherADb, 'enrolments'), where('batchId', '==', 'BAT-0001'))));
    await assertFails(updateDoc(doc(teacherBDb, 'homework', 'HW-0001'), { title: 'Tampered' }));

    // Scenario 6: Teacher accesses another Teacher's private records
    await assertFails(getDoc(doc(teacherADb, 'teacherSalaryPeriods', 'SPER-0002')));
    await assertFails(getDoc(doc(teacherBDb, 'homeworkSubmissions', 'HSUB-0001', 'private', 'teacherNote')));

    // Scenario 7: Student changes their own role
    await assertFails(
      updateDoc(doc(studentADb, 'users', STUDENT_A_UID), {
        role: 'admin',
        adminUids: [STUDENT_A_UID],
      })
    );

    // Scenario 8: Teacher changes their own role
    await assertFails(
      updateDoc(doc(teacherADb, 'users', TEACHER_A_UID), {
        role: 'admin',
        adminUids: [TEACHER_A_UID],
      })
    );

    // Scenario 9: Student modifies their fee balance
    await assertFails(
      updateDoc(doc(studentADb, 'studentFeeAccounts', 'FEE-0001'), {
        remainingBalancePaise: 0,
        verifiedAmountPaidPaise: 250000,
      })
    );

    // Scenario 10: Student verifies their own payment
    await assertFails(
      setDoc(doc(studentADb, 'paymentClaims', 'PCLM-9999'), {
        id: 'PCLM-9999',
        paymentReference: 'PREF-9999',
        studentId: 'STU-0001',
        studentUid: STUDENT_A_UID,
        feeAccountId: 'FEE-0001',
        feePeriod: '2026-11',
        amountPaise: 250000,
        transactionReference: 'UTR99999999',
        paymentDate: '2026-11-18',
        status: 'verified',
        verifiedBy: STUDENT_A_UID,
        duplicateTransactionFlag: false,
        submittedAt: now,
        adminUids: [ADMIN_UID],
      })
    );
    await assertFails(updateDoc(doc(studentADb, 'paymentClaims', 'PCLM-0001'), { status: 'verified' }));

    // Scenario 11: Teacher approves a payment claim
    await assertFails(updateDoc(doc(teacherADb, 'paymentClaims', 'PCLM-0001'), { status: 'verified' }));

    // Scenario 12 & 13: Unauthorized user changes Admin settings or UPI settings
    await assertFails(
      setDoc(doc(teacherADb, 'applicationSettings', 'APP-SETTINGS-001'), {
        id: 'APP-SETTINGS-001',
      })
    );
    await assertFails(
      setDoc(doc(studentADb, 'upiConfigurations', 'UPI-ROGUE'), {
        id: 'UPI-ROGUE',
        upiId: 'attacker@upi',
        payeeName: 'Attacker',
        status: 'active',
        updatedBy: 'STU-0001',
        updatedAt: now,
        adminUids: [ADMIN_UID],
      })
    );

    // Scenario 14: Student reads examination answer keys & unreleased marks
    await assertFails(getDoc(doc(studentADb, 'objectiveTests', 'TST-0001', 'private', 'answerKey')));
    await assertFails(
      getDocs(
        query(collection(studentADb, 'examinationMarks'), where('studentUid', '==', STUDENT_A_UID))
      )
    );

    // Scenario 15: Student reads private teacher notes
    await assertFails(
      getDoc(doc(studentADb, 'homeworkSubmissions', 'HSUB-0001', 'private', 'teacherNote'))
    );

    // Scenario 16: Unauthorized user changes or forges audit records
    await assertFails(updateDoc(doc(adminDb, 'financialAudit', 'FAUD-0001'), { action: 'tampered' }));
    await assertFails(deleteDoc(doc(adminDb, 'financialAudit', 'FAUD-0001')));
    await assertFails(
      setDoc(doc(studentADb, 'paymentVerificationAudit', 'PAUD-FORGED'), {
        id: 'PAUD-FORGED',
        paymentClaimId: 'PCLM-0001',
        actorId: 'STU-0001',
        action: 'payment_verified',
        timestamp: now,
        adminUids: [ADMIN_UID],
      })
    );

    // Scenario 17: Unauthorized user modifies account mappings
    await assertFails(
      setDoc(doc(teacherADb, 'authIdMappings', 'ADM-0001'), {
        loginId: 'ADM-0001',
        uid: TEACHER_A_UID,
        authEmail: 'tch-0001@auth.academy-0007.internal',
        role: 'admin',
        status: 'active',
        createdAt: now,
      })
    );

    // Scenario 18: Deactivated account (both Student and Deactivated Admin Gmail) accesses protected data
    await assertFails(getDocs(query(collection(deactivatedStudentDb, 'classes'), where('status', '==', 'active'))));
    await assertFails(getDocs(collection(deactivatedAdminDb, 'users')));
    await assertFails(getDoc(doc(deactivatedAdminDb, 'authIdMappings', 'ADM-0001')));

    // Scenario 19: Unlinked auth user & arbitrary notification spoofing
    await assertFails(getDocs(collection(unlinkedAuthDb, 'classes')));
    await assertFails(getDoc(doc(unlinkedAuthDb, 'studentFeeAccounts', 'FEE-0001')));
    await assertFails(
      setDoc(doc(unverifiedAdminDb, 'classes', 'CLS-9999'), {
        id: 'CLS-9999',
        classId: 'CLS-9999',
        name: 'Spoofed Class',
        status: 'active',
        createdAt: now,
      })
    );
    await assertFails(
      setDoc(doc(studentADb, 'notifications', 'NOTIF-SPOOF'), {
        id: 'NOTIF-SPOOF',
        recipientId: 'STU-0002',
        recipientUid: STUDENT_B_UID,
        recipientRole: 'student',
        category: 'fees_receipts',
        type: 'overdue_fee',
        relatedRecordId: 'FEE-0002',
        dedupeKey: 'spoof:1',
        title: 'Fake Notification',
        message: 'Unauthorized message',
        adminUids: [ADMIN_UID],
        createdAt: now,
      })
    );

    // Scenario 20: Malicious or unexpected input (shadow fields, test score forgery, oversized ID, malicious URL)
    const oversizedId = 'X'.repeat(140);
    await assertFails(
      setDoc(doc(adminDb, 'classes', oversizedId), {
        id: oversizedId,
        classId: oversizedId,
        name: 'Oversized ID Class',
        status: 'active',
        createdAt: now,
      })
    );
    await assertFails(
      setDoc(doc(studentADb, 'homeworkSubmissions', 'HSUB-9999'), {
        id: 'HSUB-9999',
        homeworkId: 'HW-0001',
        studentId: 'STU-0001',
        studentUid: STUDENT_A_UID,
        teacherUid: TEACHER_A_UID,
        responseText: 'My completed homework response.',
        submittedAt: now,
        status: 'reviewed',
        marksAwarded: 100,
        revisionNumber: 1,
        revisionHistory: [{ revisionNumber: 1, responseText: 'x', submittedAt: now }],
        adminUids: [ADMIN_UID],
      })
    );
    await assertFails(
      updateDoc(doc(studentADb, 'testAttempts', 'ATT-TST-0001'), {
        answers: { Q1: 'A' },
        submittedAt: now,
        status: 'evaluated',
        marksObtained: 20,
        percentage: 100,
        evaluatedAt: now,
      })
    );
    await assertFails(
      setDoc(doc(adminDb, 'upiConfigurations', 'UPI-BAD'), {
        id: 'UPI-BAD',
        upiId: 'javascript:alert(1)',
        payeeName: 'Bad Config',
        status: 'active',
        updatedBy: 'ADM-0001',
        updatedAt: now,
        adminUids: [ADMIN_UID],
      })
    );

    // Positive controls: legitimate Admin, Spark Teacher, and Spark Student workflows succeed
    await assertSucceeds(getDoc(doc(studentADb, 'users', STUDENT_A_UID)));
    await assertSucceeds(getDoc(doc(teacherADb, 'users', TEACHER_A_UID)));
    await assertSucceeds(getDocs(query(collection(studentADb, 'classes'), where('status', '==', 'active'))));
    await assertSucceeds(getDocs(query(collection(teacherADb, 'enrolments'), where('teacherUids', 'array-contains', TEACHER_A_UID))));
    await assertSucceeds(getDoc(doc(studentADb, 'studentFeeAccounts', 'FEE-0001')));
    await assertSucceeds(getDoc(doc(teacherADb, 'objectiveTests', 'TST-0001', 'private', 'answerKey')));

    // Atomic Teacher attendance session creation + record + audit
    const attBatch = writeBatch(teacherADb);
    attBatch.set(doc(teacherADb, 'attendanceSessions', 'ATT-VALID-1'), {
      id: 'ATT-VALID-1',
      sessionDate: '2026-11-19',
      classId: 'CLS-0001',
      batchId: 'BAT-0001',
      subjectId: 'SUB-0001',
      teacherId: 'TCH-0001',
      teacherUid: TEACHER_A_UID,
      sessionType: 'regular',
      status: 'submitted',
      submittedAt: now,
      adminUids: [ADMIN_UID],
      createdAt: now,
      updatedAt: now,
    });
    attBatch.set(doc(teacherADb, 'attendanceRecords', 'ATT-VALID-1-STU-0001'), {
      id: 'ATT-VALID-1-STU-0001',
      attendanceSessionId: 'ATT-VALID-1',
      studentId: 'STU-0001',
      studentUid: STUDENT_A_UID,
      teacherUid: TEACHER_A_UID,
      status: 'present',
      markedBy: 'TCH-0001',
      markedAt: now,
      adminUids: [ADMIN_UID],
    });
    attBatch.set(doc(teacherADb, 'attendanceAudit', 'AAUD-VALID-1'), {
      id: 'AAUD-VALID-1',
      attendanceSessionId: 'ATT-VALID-1',
      action: 'session_submitted',
      actorId: 'TCH-0001',
      actorRole: 'teacher',
      teacherUid: TEACHER_A_UID,
      timestamp: now,
      adminUids: [ADMIN_UID],
      createdAt: now,
    });
    await assertSucceeds(attBatch.commit());

    // Legitimate Student payment claim + audit
    await assertSucceeds(
      setDoc(doc(studentADb, 'paymentClaims', 'PCLM-VALID'), {
        id: 'PCLM-VALID',
        paymentReference: 'PREF-VALID-01',
        studentId: 'STU-0001',
        studentUid: STUDENT_A_UID,
        feeAccountId: 'FEE-0001',
        feePeriod: '2026-11',
        amountPaise: 250000,
        transactionReference: 'UTR123456789',
        paymentDate: '2026-11-18',
        status: 'verification_pending',
        duplicateTransactionFlag: false,
        submittedAt: now,
        adminUids: [ADMIN_UID],
      })
    );
    await assertSucceeds(
      setDoc(doc(adminDb, 'classes', 'CLS-VALID'), {
        id: 'CLS-VALID',
        classId: 'CLS-VALID',
        name: 'Class 11',
        status: 'active',
        createdAt: now,
      })
    );

    console.log('Security Audit Firestore Rules Suite: ALL 20 ATTACK SCENARIOS & POSITIVE CONTROLS PASSED');
  } finally {
    await testEnv.cleanup();
  }
}

runRulesSecurityTests().catch((err) => {
  console.error('Firestore rules security verification failed:', err);
  process.exit(1);
});
