import assert from 'node:assert/strict';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import { LocalDevAccountService } from '../src/services/local/localAccountService';
import { LocalAcademicStore } from '../src/services/local/localAcademicStore';
import { LocalDevAcademicService } from '../src/services/local/localAcademicService';
import { AcademicServiceError } from '../src/services/contracts/academicService';
import type { AuthPrincipal } from '../src/types';

async function runPhase4Tests() {
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

  const adminActor = accountStore.findAuthPrincipalByLoginId('ADM-0001')!;
  const teacherActor = accountStore.findAuthPrincipalByLoginId('TCH-0001')!;
  const studentActor = accountStore.findAuthPrincipalByLoginId('STU-0001')!;
  const inactiveStudentActor: AuthPrincipal = {
    ...studentActor,
    loginId: 'STU-0099',
    fullName: 'Inactive Student Demo',
    status: 'deactivated',
  };

  // Provision additional Phase 3 accounts for multi-teacher & unenrolled-student testing
  const teacher2 = await accountService.createTeacherAccount(adminActor, {
    name: 'Meera Iyer',
    phone: '+91 98220 44556',
    initialPassword: 'TeachPass@2026',
    status: 'active',
  });
  const teacher2Actor = accountStore.findAuthPrincipalByLoginId(teacher2.accountId)!;

  const student2 = await accountService.createStudentAccount(adminActor, {
    name: 'Kabir Verma',
    classId: 'cls-12',
    batchId: 'bat-12a',
    phone: '+91 98220 66778',
    initialPassword: 'StudPass@2026',
    status: 'active',
  });
  const student2Actor = accountStore.findAuthPrincipalByLoginId(student2.accountId)!;

  // 1. Authorization Checks: Non-admin & unauthenticated callers blocked on Admin operations
  for (const unauthorized of [
    null,
    teacherActor,
    studentActor,
    inactiveStudentActor,
  ] as Array<AuthPrincipal | null>) {
    await assert.rejects(
      () => academicService.getAcademicOverview(unauthorized),
      (err: unknown) => err instanceof AcademicServiceError && err.code === 'UNAUTHORIZED'
    );
    await assert.rejects(
      () => academicService.createClass(unauthorized, { name: 'Unauthorized Class' }),
      (err: unknown) => err instanceof AcademicServiceError && err.code === 'UNAUTHORIZED'
    );
    await assert.rejects(
      () =>
        academicService.createAnnouncement(unauthorized, {
          title: 'Blocked Notice',
          content: 'Teachers and students must never publish admin announcements.',
          audience: 'all',
          publishImmediately: true,
        }),
      (err: unknown) => err instanceof AcademicServiceError && err.code === 'UNAUTHORIZED'
    );
  }

  // Unauthenticated or wrong-role workspace calls rejected
  await assert.rejects(
    () => academicService.getMyTeacherWorkspace(null),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () => academicService.getMyTeacherWorkspace(studentActor),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'UNAUTHORIZED'
  );
  await assert.rejects(
    () => academicService.getMyStudentWorkspace(teacherActor),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'UNAUTHORIZED'
  );

  // 2. Classes CRUD, Duplicate Prevention & Safe Delete Blocking
  const class11 = await academicService.createClass(adminActor, {
    name: 'Class 11 — Commerce',
    description: 'Accounting & Business Studies',
  });
  assert.equal(class11.classId, 'CLS-0003');
  assert.equal(class11.status, 'active');

  await assert.rejects(
    () => academicService.createClass(adminActor, { name: '  ' }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'VALIDATION_ERROR'
  );
  await assert.rejects(
    () => academicService.createClass(adminActor, { name: 'class 11 — commerce' }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'DUPLICATE_RECORD'
  );

  const editedClass11 = await academicService.updateClass(adminActor, class11.classId, {
    name: 'Class 11 — Commerce Honours',
    description: 'Updated stream',
  });
  assert.equal(editedClass11.name, 'Class 11 — Commerce Honours');

  // Cannot delete class with dependent batches/enrolments
  await assert.rejects(
    () => academicService.deleteClass(adminActor, 'CLS-0001'),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'DELETE_BLOCKED'
  );

  // Unused class CAN be deleted safely
  const disposableClass = await academicService.createClass(adminActor, { name: 'Temp Class' });
  await academicService.deleteClass(adminActor, disposableClass.classId);

  // Deactivate and reactivate class
  const deactivatedClass = await academicService.setClassStatus(
    adminActor,
    class11.classId,
    'inactive'
  );
  assert.equal(deactivatedClass.status, 'inactive');

  // Cannot create batch in inactive class
  await assert.rejects(
    () =>
      academicService.createBatch(adminActor, {
        name: 'Morning Commerce',
        classId: class11.classId,
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'INACTIVE_REFERENCE'
  );

  await academicService.setClassStatus(adminActor, class11.classId, 'active');

  // 3. Batches CRUD & Referential Integrity
  const batch4 = await academicService.createBatch(adminActor, {
    name: 'Commerce Morning Batch',
    classId: class11.classId,
  });
  assert.equal(batch4.batchId, 'BAT-0004');
  assert.equal(batch4.classId, class11.classId);

  await assert.rejects(
    () =>
      academicService.createBatch(adminActor, {
        name: 'Commerce Morning Batch',
        classId: class11.classId,
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'DUPLICATE_RECORD'
  );

  await assert.rejects(
    () => academicService.deleteBatch(adminActor, 'BAT-0001'),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'DELETE_BLOCKED'
  );

  // 4. Subjects CRUD & Class Mapping
  const accountancy = await academicService.createSubject(adminActor, {
    name: 'Accountancy',
    code: 'ACC-11',
    classIds: [class11.classId],
  });
  assert.equal(accountancy.subjectId, 'SUB-0004');

  await assert.rejects(
    () =>
      academicService.createSubject(adminActor, {
        name: 'accountancy',
        classIds: [class11.classId],
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'DUPLICATE_RECORD'
  );

  // 5. Student Enrolments, Unenrolled Visibility & History Preservation
  const unenrolledBefore = await academicService.listUnenrolledStudents(adminActor);
  assert.equal(
    unenrolledBefore.some((s) => s.accountId === student2.accountId),
    true
  );

  // Unenrolled student sees enrolment === null (never fabricated class data)
  const unenrolledWorkspace = await academicService.getMyStudentWorkspace(student2Actor);
  assert.equal(unenrolledWorkspace.enrolment, null);
  assert.equal(unenrolledWorkspace.timetable.length, 0);

  // Reject inactive student enrolment
  await assert.rejects(
    () =>
      academicService.enrolStudent(adminActor, {
        studentAccountId: 'STU-0099',
        classId: 'CLS-0002',
        batchId: 'BAT-0003',
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'INACTIVE_REFERENCE'
  );

  // Reject batch not belonging to class
  await assert.rejects(
    () =>
      academicService.enrolStudent(adminActor, {
        studentAccountId: student2.accountId,
        classId: 'CLS-0002',
        batchId: 'BAT-0001',
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'VALIDATION_ERROR'
  );

  // Valid enrolment for student2
  const enrolment2 = await academicService.enrolStudent(adminActor, {
    studentAccountId: student2.accountId,
    classId: class11.classId,
    batchId: batch4.batchId,
  });
  assert.equal(enrolment2.enrolmentId, 'ENR-0002');

  // Prevent duplicate active enrolment
  await assert.rejects(
    () =>
      academicService.enrolStudent(adminActor, {
        studentAccountId: student2.accountId,
        classId: 'CLS-0002',
        batchId: 'BAT-0003',
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'DUPLICATE_RECORD'
  );

  // Update enrolment class/batch, deactivate preserving history, then reactivate
  const transferred = await academicService.updateEnrolmentClassBatch(
    adminActor,
    enrolment2.enrolmentId,
    {
      classId: 'CLS-0002',
      batchId: 'BAT-0003',
    }
  );
  assert.equal(transferred.classId, 'CLS-0002');
  assert.equal(transferred.batchId, 'BAT-0003');

  const deactivatedEnr = await academicService.setEnrolmentStatus(
    adminActor,
    enrolment2.enrolmentId,
    'inactive'
  );
  assert.equal(deactivatedEnr.status, 'inactive');

  const postDeactWorkspace = await academicService.getMyStudentWorkspace(student2Actor);
  assert.equal(postDeactWorkspace.enrolment, null);

  await academicService.setEnrolmentStatus(adminActor, enrolment2.enrolmentId, 'active');

  // 6. Teacher Assignments & Strict Teacher Scoping
  const assignment2 = await academicService.createTeacherAssignment(adminActor, {
    teacherAccountId: teacher2.accountId,
    subjectId: 'SUB-0003', // Physics -> CLS-0002
    classId: 'CLS-0002',
    batchId: 'BAT-0003',
  });
  assert.equal(assignment2.assignmentId, 'ASG-0002');

  // Reject duplicate active assignment
  await assert.rejects(
    () =>
      academicService.createTeacherAssignment(adminActor, {
        teacherAccountId: teacher2.accountId,
        subjectId: 'SUB-0003',
        classId: 'CLS-0002',
        batchId: 'BAT-0003',
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'DUPLICATE_RECORD'
  );

  // Reject subject not linked to selected class
  await assert.rejects(
    () =>
      academicService.createTeacherAssignment(adminActor, {
        teacherAccountId: teacher2.accountId,
        subjectId: 'SUB-0001', // Maths -> CLS-0001 only
        classId: 'CLS-0002',
        batchId: 'BAT-0003',
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'VALIDATION_ERROR'
  );

  // Verify TCH-0001 workspace contains only ASG-0001 and TCH-0002 workspace contains only ASG-0002
  const t1WorkspaceBefore = await academicService.getMyTeacherWorkspace(teacherActor);
  const t2WorkspaceBefore = await academicService.getMyTeacherWorkspace(teacher2Actor);
  assert.equal(t1WorkspaceBefore.assignments.length, 1);
  assert.equal(t1WorkspaceBefore.assignments[0].assignment.assignmentId, 'ASG-0001');
  assert.equal(t2WorkspaceBefore.assignments.length, 1);
  assert.equal(t2WorkspaceBefore.assignments[0].assignment.assignmentId, 'ASG-0002');

  // 7. Timetable Scheduling, Time Validation & Overlap Conflict Prevention
  // Seeded TT-0001 is Monday 16:00-17:15 for BAT-0001 & TCH-0001.
  // Invalid endTime <= startTime
  await assert.rejects(
    () =>
      academicService.createTimetableEntry(adminActor, {
        classId: 'CLS-0002',
        batchId: 'BAT-0003',
        subjectId: 'SUB-0003',
        teacherAccountId: teacher2.accountId,
        dayOfWeek: 'Monday',
        startTime: '17:00',
        endTime: '16:30',
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'VALIDATION_ERROR'
  );

  // Valid non-overlapping session for teacher2 in BAT-0003 at Monday 16:00-17:00
  const tt2 = await academicService.createTimetableEntry(adminActor, {
    classId: 'CLS-0002',
    batchId: 'BAT-0003',
    subjectId: 'SUB-0003',
    teacherAccountId: teacher2.accountId,
    dayOfWeek: 'Monday',
    startTime: '16:00',
    endTime: '17:00',
    room: 'Lab 1',
  });
  assert.equal(tt2.entryId, 'TT-0002');

  // Teacher conflict: assign TCH-0001 to BAT-0002 and try overlapping Monday 16:30-17:30
  await academicService.createTeacherAssignment(adminActor, {
    teacherAccountId: 'TCH-0001',
    subjectId: 'SUB-0001',
    classId: 'CLS-0001',
    batchId: 'BAT-0002',
  });
  await assert.rejects(
    () =>
      academicService.createTimetableEntry(adminActor, {
        classId: 'CLS-0001',
        batchId: 'BAT-0002',
        subjectId: 'SUB-0001',
        teacherAccountId: 'TCH-0001',
        dayOfWeek: 'Monday',
        startTime: '16:30',
        endTime: '17:30',
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'TIMETABLE_CONFLICT'
  );

  // Batch conflict: assign teacher2 to BAT-0001 (SUB-0002 Chemistry) and try overlapping Monday 16:30-17:30
  await academicService.createTeacherAssignment(adminActor, {
    teacherAccountId: teacher2.accountId,
    subjectId: 'SUB-0002',
    classId: 'CLS-0001',
    batchId: 'BAT-0001',
  });
  await assert.rejects(
    () =>
      academicService.createTimetableEntry(adminActor, {
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0002',
        teacherAccountId: teacher2.accountId,
        dayOfWeek: 'Monday',
        startTime: '16:30',
        endTime: '17:30',
      }),
    (err: unknown) => err instanceof AcademicServiceError && err.code === 'TIMETABLE_CONFLICT'
  );

  // Cancel TT-0002 and verify student2's timetable no longer displays it
  await academicService.setTimetableEntryStatus(adminActor, tt2.entryId, 'cancelled');
  const stu2AfterCancel = await academicService.getMyStudentWorkspace(student2Actor);
  assert.equal(stu2AfterCancel.timetable.length, 0);

  await academicService.setTimetableEntryStatus(adminActor, tt2.entryId, 'active');
  const stu2AfterRestore = await academicService.getMyStudentWorkspace(student2Actor);
  assert.equal(stu2AfterRestore.timetable.length, 1);
  assert.equal(stu2AfterRestore.timetable[0].entry.entryId, 'TT-0002');

  // Verify STU-0001 only sees BAT-0001 timetable (TT-0001), never BAT-0003 (TT-0002)
  const stu1Workspace = await academicService.getMyStudentWorkspace(studentActor);
  assert.equal(stu1Workspace.timetable.length, 1);
  assert.equal(stu1Workspace.timetable[0].entry.entryId, 'TT-0001');

  // 8. Announcements Draft/Publish/Unpublish/Archive & Audience Targeting
  const draftNotice = await academicService.createAnnouncement(adminActor, {
    title: 'Draft Staff Meeting',
    content: 'Internal faculty schedule review this Friday.',
    audience: 'teachers',
    publishImmediately: false,
  });
  assert.equal(draftNotice.publicationStatus, 'draft');

  const class12Notice = await academicService.createAnnouncement(adminActor, {
    title: 'Class 12 Physics Lab Prep',
    content: 'Bring lab journals for Monday session in Lab 1.',
    audience: 'class',
    targetClassId: 'CLS-0002',
    publishImmediately: true,
  });
  assert.equal(class12Notice.publicationStatus, 'published');

  // Draft must NOT be visible to teachers; Class 12 notice visible to teacher2 & student2 ONLY, NOT teacher1 or student1
  const t1Notices = (await academicService.getMyTeacherWorkspace(teacherActor)).announcements;
  const t2Notices = (await academicService.getMyTeacherWorkspace(teacher2Actor)).announcements;
  const s1Notices = (await academicService.getMyStudentWorkspace(studentActor)).announcements;
  const s2Notices = (await academicService.getMyStudentWorkspace(student2Actor)).announcements;

  assert.equal(t1Notices.some((a) => a.announcementId === draftNotice.announcementId), false);
  assert.equal(t1Notices.some((a) => a.announcementId === class12Notice.announcementId), false);
  assert.equal(t2Notices.some((a) => a.announcementId === class12Notice.announcementId), true);
  assert.equal(s1Notices.some((a) => a.announcementId === class12Notice.announcementId), false);
  assert.equal(s2Notices.some((a) => a.announcementId === class12Notice.announcementId), true);

  // Publish draftNotice -> teachers see it, students do NOT
  await academicService.publishAnnouncement(adminActor, draftNotice.announcementId);
  const t1AfterPub = (await academicService.getMyTeacherWorkspace(teacherActor)).announcements;
  const s1AfterPub = (await academicService.getMyStudentWorkspace(studentActor)).announcements;
  assert.equal(t1AfterPub.some((a) => a.announcementId === draftNotice.announcementId), true);
  assert.equal(s1AfterPub.some((a) => a.announcementId === draftNotice.announcementId), false);

  // Unpublish & Archive hide announcement from recipients
  await academicService.unpublishAnnouncement(adminActor, class12Notice.announcementId);
  const s2AfterUnpub = (await academicService.getMyStudentWorkspace(student2Actor)).announcements;
  assert.equal(s2AfterUnpub.some((a) => a.announcementId === class12Notice.announcementId), false);

  await academicService.archiveAnnouncement(adminActor, class12Notice.announcementId);
  const adminAllNotices = await academicService.listAdminAnnouncements(adminActor);
  assert.equal(
    adminAllNotices.find((a) => a.announcementId === class12Notice.announcementId)
      ?.publicationStatus,
    'archived'
  );

  // 9. Overview KPI Accuracy
  const overview = await academicService.getAcademicOverview(adminActor);
  assert.equal(overview.totalClasses, 3);
  assert.equal(overview.totalBatches, 4);
  assert.equal(overview.totalSubjects, 4);
  assert.equal(overview.enrolledStudents, 2);
  assert.equal(overview.activeTimetableSessions, 2);

  console.log('ALL_PHASE_4_ACADEMIC_MANAGEMENT_ASSERTIONS_PASSED');
}

runPhase4Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
