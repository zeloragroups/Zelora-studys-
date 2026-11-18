import assert from 'node:assert/strict';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import { LocalDevAccountService } from '../src/services/local/localAccountService';
import { LocalAcademicStore } from '../src/services/local/localAcademicStore';
import { LocalDevAcademicService } from '../src/services/local/localAcademicService';
import { LocalAttendanceStore } from '../src/services/local/localAttendanceStore';
import { LocalDevAttendanceService } from '../src/services/local/localAttendanceService';
import { AttendanceServiceError } from '../src/services/contracts/attendanceService';
import { calculateAttendanceSummary } from '../src/utils/attendanceCalculations';
import type { AuthPrincipal } from '../src/types';

async function runPhase5Tests() {
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

  const adminActor = accountStore.findAuthPrincipalByLoginId('ADM-0001')!;
  const teacher1Actor = accountStore.findAuthPrincipalByLoginId('TCH-0001')!;
  const student1Actor = accountStore.findAuthPrincipalByLoginId('STU-0001')!;
  const inactiveStudentActor: AuthPrincipal = {
    ...student1Actor,
    loginId: 'STU-0099',
    fullName: 'Inactive Student Demo',
    status: 'deactivated',
  };

  // Provision additional accounts & enrolments for thorough isolation, multi-student, and exam tests
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

  // Enrol student2 into BAT-0001 (same batch as STU-0001), student3 into BAT-0003 (unrelated batch)
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

  // Assign teacher2 to Class 12 / BAT-0003 / Physics (SUB-0003)
  await academicService.createTeacherAssignment(adminActor, {
    teacherAccountId: teacher2.accountId,
    subjectId: 'SUB-0003',
    classId: 'CLS-0002',
    batchId: 'BAT-0003',
  });
  const cancelledSlot = await academicService.createTimetableEntry(adminActor, {
    classId: 'CLS-0002',
    batchId: 'BAT-0003',
    subjectId: 'SUB-0003',
    teacherAccountId: teacher2.accountId,
    dayOfWeek: 'Tuesday',
    startTime: '17:00',
    endTime: '18:00',
  });
  await academicService.setTimetableEntryStatus(adminActor, cancelledSlot.entryId, 'cancelled');

  // =========================================================================
  // 1. SHARED PERCENTAGE CALCULATION TESTS
  // =========================================================================
  const emptyCalc = calculateAttendanceSummary([]);
  assert.equal(emptyCalc.percentage, null);
  assert.equal(emptyCalc.displayPercentage, 'Not available');
  assert.equal(emptyCalc.eligibleDenominator, 0);

  const onlyExcusedCalc = calculateAttendanceSummary(['excused', 'excused']);
  assert.equal(onlyExcusedCalc.percentage, null);
  assert.equal(onlyExcusedCalc.displayPercentage, 'Not available');
  assert.equal(onlyExcusedCalc.excusedCount, 2);

  // Formula: (Present + Late) / (Present + Absent + Late) * 100, Excused excluded
  // 1 Present + 1 Late + 1 Absent + 1 Excused => (2 / 3) * 100 = 66.7%
  const mixedCalc = calculateAttendanceSummary(['present', 'late', 'absent', 'excused']);
  assert.equal(mixedCalc.presentCount, 1);
  assert.equal(mixedCalc.lateCount, 1);
  assert.equal(mixedCalc.absentCount, 1);
  assert.equal(mixedCalc.excusedCount, 1);
  assert.equal(mixedCalc.attendedCount, 2);
  assert.equal(mixedCalc.eligibleDenominator, 3);
  assert.equal(mixedCalc.percentage, 66.7);
  assert.equal(mixedCalc.displayPercentage, '66.7%');

  // =========================================================================
  // 2. ACCESS CONTROL & UNAUTHENTICATED REJECTION
  // =========================================================================
  for (const blocked of [null, inactiveStudentActor] as Array<AuthPrincipal | null>) {
    await assert.rejects(
      () => attendanceService.getTeacherAttendanceOptions(blocked),
      (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
    );
    await assert.rejects(
      () => attendanceService.getMyStudentAttendance(blocked),
      (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
    );
    await assert.rejects(
      () => attendanceService.getAdminAttendanceOverview(blocked),
      (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
    );
  }

  // Student & Teacher rejected on Admin monitoring; Student rejected on Teacher workflows
  await assert.rejects(
    () => attendanceService.getAdminAttendanceOverview(teacher1Actor),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () => attendanceService.getAdminAttendanceOverview(student1Actor),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () => attendanceService.getTeacherAttendanceOptions(student1Actor),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () => attendanceService.getAttendanceSessionDetail(student1Actor, 'ATT-0001'),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );

  // =========================================================================
  // 3. TEACHER ROSTER SCOPING & ATTENDANCE CREATION VALIDATION
  // =========================================================================
  // TCH-0001 loads BAT-0001 -> contains STU-0001 and student2 ONLY (never STU-0099 inactive, never student3 in BAT-0003)
  const bat1Roster = await attendanceService.loadEligibleStudentsForBatch(teacher1Actor, {
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
  });
  assert.equal(bat1Roster.length, 2);
  assert.deepEqual(
    bat1Roster.map((s) => s.studentId),
    ['STU-0001', student2.accountId]
  );
  assert.equal(bat1Roster.some((s) => s.studentId === 'STU-0099'), false);
  assert.equal(bat1Roster.some((s) => s.studentId === student3.accountId), false);

  // TCH-0001 rejected when trying to load an unassigned class/batch (CLS-0002 / BAT-0003)
  await assert.rejects(
    () =>
      attendanceService.loadEligibleStudentsForBatch(teacher1Actor, {
        classId: 'CLS-0002',
        batchId: 'BAT-0003',
        subjectId: 'SUB-0003',
      }),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );

  // Reject batch not belonging to class (validation triggers cleanly before assignment)
  await assert.rejects(
    () =>
      attendanceService.loadEligibleStudentsForBatch(teacher1Actor, {
        classId: 'CLS-0001',
        batchId: 'BAT-0003',
        subjectId: 'SUB-0001',
      }),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'VALIDATION_ERROR'
  );

  // Cancelled timetable slot cannot be used to submit attendance
  await assert.rejects(
    () =>
      attendanceService.submitAttendanceSession(teacher2Actor, {
        sessionDate: '2026-11-17',
        classId: 'CLS-0002',
        batchId: 'BAT-0003',
        subjectId: 'SUB-0003',
        sessionType: 'regular',
        timetableEntryId: cancelledSlot.entryId,
        marks: [{ studentId: student3.accountId, status: 'present' }],
      }),
    (err: unknown) =>
      err instanceof AttendanceServiceError && err.code === 'CANCELLED_TIMETABLE_SESSION'
  );

  // Examination attendance without examTitle rejected
  await assert.rejects(
    () =>
      attendanceService.submitAttendanceSession(teacher1Actor, {
        sessionDate: '2026-11-18',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        sessionType: 'examination',
        examTitle: '  ',
        marks: [
          { studentId: 'STU-0001', status: 'present' },
          { studentId: student2.accountId, status: 'late' },
        ],
      }),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'VALIDATION_ERROR'
  );

  // Invalid date rejected
  await assert.rejects(
    () =>
      attendanceService.submitAttendanceSession(teacher1Actor, {
        sessionDate: '2026-02-31',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        sessionType: 'regular',
        marks: [
          { studentId: 'STU-0001', status: 'present' },
          { studentId: student2.accountId, status: 'present' },
        ],
      }),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'VALIDATION_ERROR'
  );

  // =========================================================================
  // 4. MARKING VALIDATION: INCOMPLETE, INVALID STATUS, DRAFT ISOLATION
  // =========================================================================
  // Incomplete marks rejected (do not silently mark student2 absent!)
  await assert.rejects(
    () =>
      attendanceService.submitAttendanceSession(teacher1Actor, {
        sessionDate: '2026-11-18',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        sessionType: 'regular',
        marks: [{ studentId: 'STU-0001', status: 'present' }],
      }),
    (err: unknown) =>
      err instanceof AttendanceServiceError && err.code === 'INCOMPLETE_ATTENDANCE'
  );

  // Invalid status string rejected
  await assert.rejects(
    () =>
      attendanceService.submitAttendanceSession(teacher1Actor, {
        sessionDate: '2026-11-18',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        sessionType: 'regular',
        marks: [
          { studentId: 'STU-0001', status: 'present' },
          { studentId: student2.accountId, status: 'truant' },
        ],
      }),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'VALIDATION_ERROR'
  );

  // Draft attendance with Absent mark MUST NOT generate any AbsenceNotification
  const notifCountBeforeDraft = attendanceStore.notifications.length;
  const draftSession = await attendanceService.saveDraftAttendanceSession(teacher1Actor, {
    sessionDate: '2026-11-18',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    sessionType: 'regular',
    timetableEntryId: 'TT-0001',
    marks: [{ studentId: 'STU-0001', status: 'absent', remarks: 'Draft pending check' }],
  });
  assert.equal(draftSession.session.status, 'draft');
  assert.equal(attendanceStore.notifications.length, notifCountBeforeDraft);

  // Submit the draft completing both students: STU-0001 = late, student2 = absent
  const submittedRegular = await attendanceService.submitAttendanceSession(teacher1Actor, {
    draftSessionId: draftSession.session.id,
    sessionDate: '2026-11-18',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    sessionType: 'regular',
    timetableEntryId: 'TT-0001',
    marks: [
      { studentId: 'STU-0001', status: 'late', remarks: 'Arrived 10m late' },
      { studentId: student2.accountId, status: 'absent', remarks: 'Unplanned absence' },
    ],
  });
  assert.equal(submittedRegular.session.status, 'submitted');
  assert.equal(submittedRegular.summary.lateCount, 1);
  assert.equal(submittedRegular.summary.absentCount, 1);

  // Duplicate submission for same date/batch/subject/regular/slot blocked
  await assert.rejects(
    () =>
      attendanceService.submitAttendanceSession(teacher1Actor, {
        sessionDate: '2026-11-18',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        sessionType: 'regular',
        timetableEntryId: 'TT-0001',
        marks: [
          { studentId: 'STU-0001', status: 'present' },
          { studentId: student2.accountId, status: 'present' },
        ],
      }),
    (err: unknown) =>
      err instanceof AttendanceServiceError && err.code === 'DUPLICATE_SUBMISSION'
  );

  // =========================================================================
  // 5. EXAMINATION ATTENDANCE & PRESENT/LATE/EXCUSED NOTIFICATION ISOLATION
  // =========================================================================
  // Submit Examination session on same date for CLS-0001/BAT-0001: STU-0001 = excused, student2 = present
  const submittedExam = await attendanceService.submitAttendanceSession(teacher1Actor, {
    sessionDate: '2026-11-18',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
    subjectId: 'SUB-0001',
    sessionType: 'examination',
    examTitle: 'Midterm Algebra Assessment',
    marks: [
      { studentId: 'STU-0001', status: 'excused', remarks: 'Medical note approved' },
      { studentId: student2.accountId, status: 'present' },
    ],
  });
  assert.equal(submittedExam.session.sessionType, 'examination');
  assert.equal(submittedExam.session.examTitle, 'Midterm Algebra Assessment');

  // Verify NO new absence notifications were generated for Late, Excused, or Present; ONLY 1 for student2's absent mark in submittedRegular
  assert.equal(attendanceStore.notifications.length, notifCountBeforeDraft + 1);
  const stu2Notif = attendanceStore.notifications.find(
    (n) => n.studentId === student2.accountId
  )!;
  assert.ok(stu2Notif);
  assert.equal(stu2Notif.absenceDate, '2026-11-18');
  assert.equal(stu2Notif.className, 'Class 10 — Foundation');
  assert.equal(stu2Notif.batchName, 'Morning Batch A');
  assert.equal(stu2Notif.subjectName, 'Mathematics');
  assert.equal(stu2Notif.attendanceType, 'regular');
  assert.equal(stu2Notif.readByStudent, false);
  assert.equal(stu2Notif.readByAdmin, false);

  // =========================================================================
  // 6. CROSS-ROLE CALCULATION CONSISTENCY & STUDENT PERSONAL ISOLATION
  // =========================================================================
  // STU-0001 history so far:
  // - ATT-0001: present
  // - ATT-0002: absent
  // - submittedRegular: late
  // - submittedExam: excused (excluded from denominator!)
  // Summary for STU-0001 => attended = 2 (1 present + 1 late), denominator = 3 => 66.7%
  const stu1Dash = await attendanceService.getMyStudentAttendance(student1Actor);
  assert.equal(stu1Dash.summary.presentCount, 1);
  assert.equal(stu1Dash.summary.lateCount, 1);
  assert.equal(stu1Dash.summary.absentCount, 1);
  assert.equal(stu1Dash.summary.excusedCount, 1);
  assert.equal(stu1Dash.summary.eligibleDenominator, 3);
  assert.equal(stu1Dash.summary.displayPercentage, '66.7%');

  // Exam filter returns only examination record, while summary reflects overall personal rate
  const stu1ExamFiltered = await attendanceService.getMyStudentAttendance(student1Actor, {
    sessionType: 'examination',
  });
  assert.equal(stu1ExamFiltered.history.length, 1);
  assert.equal(stu1ExamFiltered.history[0].session.examTitle, 'Midterm Algebra Assessment');

  // Student3 has zero attendance records => zero-denominator handled cleanly as 'Not available'
  const stu3Dash = await attendanceService.getMyStudentAttendance(student3Actor);
  assert.equal(stu3Dash.summary.percentage, null);
  assert.equal(stu3Dash.summary.displayPercentage, 'Not available');
  assert.equal(stu3Dash.notifications.length, 0);

  // Student2 sees ONLY her own records and notification (1 absent, 1 present => 50%)
  const stu2Dash = await attendanceService.getMyStudentAttendance(student2Actor);
  assert.equal(stu2Dash.history.length, 2);
  assert.equal(stu2Dash.summary.displayPercentage, '50%');
  assert.equal(stu2Dash.notifications.length, 1);
  assert.equal(stu2Dash.unreadNotificationCount, 1);

  // Cross-student & teacher notification read protection
  await assert.rejects(
    () => attendanceService.markNotificationAsRead(student1Actor, stu2Notif.id),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () => attendanceService.markNotificationAsRead(teacher1Actor, stu2Notif.id),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );

  // Student2 marks notification read -> unread count becomes 0 for Student2, remains unread for Admin
  await attendanceService.markNotificationAsRead(student2Actor, stu2Notif.id);
  const stu2AfterRead = await attendanceService.getMyStudentAttendance(student2Actor);
  assert.equal(stu2AfterRead.unreadNotificationCount, 0);
  const adminOverviewBeforeCor = await attendanceService.getAdminAttendanceOverview(adminActor);
  assert.equal(adminOverviewBeforeCor.unreadNotificationCount, 2); // ANOT-0001 + stu2Notif

  // Teacher isolation: teacher2 cannot view or overwrite teacher1's session
  await assert.rejects(
    () => attendanceService.getAttendanceSessionDetail(teacher2Actor, submittedRegular.session.id),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );

  // =========================================================================
  // 7. CORRECTIONS, AUDIT LOG & NOTIFICATION SYNC
  // =========================================================================
  const stu2RegularRecord = submittedRegular.records.find(
    (r) => r.record.studentId === student2.accountId
  )!.record;

  // Teacher & Student cannot perform Admin corrections
  await assert.rejects(
    () =>
      attendanceService.correctAttendanceRecord(teacher1Actor, {
        sessionId: submittedRegular.session.id,
        recordId: stu2RegularRecord.id,
        newStatus: 'present',
        reason: 'Teacher trying to bypass admin workflow',
      }),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () =>
      attendanceService.correctAttendanceRecord(student2Actor, {
        sessionId: submittedRegular.session.id,
        recordId: stu2RegularRecord.id,
        newStatus: 'present',
        reason: 'Student trying to change own mark',
      }),
    (err: unknown) => err instanceof AttendanceServiceError && err.code === 'UNAUTHORIZED'
  );

  // Admin correction without valid reason rejected
  await assert.rejects(
    () =>
      attendanceService.correctAttendanceRecord(adminActor, {
        sessionId: submittedRegular.session.id,
        recordId: stu2RegularRecord.id,
        newStatus: 'present',
        reason: 'fix',
      }),
    (err: unknown) =>
      err instanceof AttendanceServiceError && err.code === 'CORRECTION_REASON_REQUIRED'
  );

  // Admin corrects student2 Absent -> Present with mandatory reason
  const correctedRes = await attendanceService.correctAttendanceRecord(adminActor, {
    sessionId: submittedRegular.session.id,
    recordId: stu2RegularRecord.id,
    newStatus: 'present',
    reason: 'Parent confirmed student attended backup morning slot',
  });
  assert.equal(correctedRes.updatedRecord.status, 'present');
  assert.equal(correctedRes.updatedRecord.corrected, true);
  assert.equal(correctedRes.sessionDetail.session.status, 'corrected');

  // Verify audit entry preserves previousValue -> newValue, actorId, timestamp, and reason
  const auditEntries = await attendanceService.listAttendanceAuditHistory(
    adminActor,
    submittedRegular.session.id
  );
  const correctionAudit = auditEntries.find(
    (a) => a.action === 'record_corrected' && a.attendanceRecordId === stu2RegularRecord.id
  );
  assert.ok(correctionAudit);
  assert.equal(correctionAudit.previousValue, 'absent');
  assert.equal(correctionAudit.newValue, 'present');
  assert.equal(correctionAudit.actorId, 'ADM-0001');
  assert.equal(
    correctionAudit.reason,
    'Parent confirmed student attended backup morning slot'
  );
  assert.ok(correctionAudit.timestamp);

  // Verify Student2 percentage updated from 50% to 100% AND absence notification updated with correction note & unread reset
  const stu2AfterCorrection = await attendanceService.getMyStudentAttendance(student2Actor);
  assert.equal(stu2AfterCorrection.summary.displayPercentage, '100%');
  assert.equal(stu2AfterCorrection.unreadNotificationCount, 1);
  assert.equal(
    stu2AfterCorrection.notifications[0].resolutionStatus,
    'corrected_not_absent'
  );
  assert.match(stu2AfterCorrection.notifications[0].correctionNote ?? '', /Corrected from Absent to Present/);

  // Admin markAllNotificationsAsRead sets unread count to 0
  await attendanceService.markAllNotificationsAsRead(adminActor);
  const adminOverviewAfter = await attendanceService.getAdminAttendanceOverview(adminActor);
  assert.equal(adminOverviewAfter.unreadNotificationCount, 0);

  // Cross-check Admin overall summary matches all submitted records across system
  // Seeded: ATT-0001 (1P), ATT-0002 (1A); submittedRegular corrected (1L, 1P); submittedExam (1E, 1P)
  // Totals across submitted sessions: Present=3, Absent=1, Late=1, Excused=1 => (3+1)/(3+1+1)=4/5=80%
  assert.equal(adminOverviewAfter.overallSummary.presentCount, 3);
  assert.equal(adminOverviewAfter.overallSummary.absentCount, 1);
  assert.equal(adminOverviewAfter.overallSummary.lateCount, 1);
  assert.equal(adminOverviewAfter.overallSummary.excusedCount, 1);
  assert.equal(adminOverviewAfter.overallSummary.eligibleDenominator, 5);
  assert.equal(adminOverviewAfter.overallSummary.displayPercentage, '80%');

  // Verify Admin filter by studentIdSearch and sessionType works cleanly
  const examSessions = await attendanceService.listAdminAttendanceSessions(adminActor, {
    sessionType: 'examination',
    studentIdSearch: student2.accountId,
  });
  assert.equal(examSessions.length, 1);
  assert.equal(examSessions[0].session.id, submittedExam.session.id);

  console.log('ALL_PHASE_5_ATTENDANCE_AND_NOTIFICATION_ASSERTIONS_PASSED');
}

runPhase5Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
