import {
  hasPermission,
  type AssessmentNotification,
  type AssessmentNotificationType,
  type AuthPrincipal,
  type PermissionAction,
  type StudentEnrolment,
  type TeacherEligibleStudent,
} from '../../types';
import { AssessmentServiceError } from '../contracts/assessmentService';
import { formatAssessmentId, LocalAssessmentStores } from './localAssessmentStores';

export function requireActiveActor(
  stores: LocalAssessmentStores,
  actor: AuthPrincipal | null
): AuthPrincipal {
  if (!actor) {
    throw new AssessmentServiceError('UNAUTHORIZED', 'Authentication is required.');
  }
  if (actor.status !== 'active') {
    throw new AssessmentServiceError('UNAUTHORIZED', 'Active account status is required.');
  }
  if (actor.role !== 'admin') {
    const acc = stores.academicStore.accountStore.findAccountById(actor.loginId);
    if (!acc || acc.status !== 'active') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Account is deactivated or not found.');
    }
  }
  return actor;
}

export function requireAdminActor(
  stores: LocalAssessmentStores,
  actor: AuthPrincipal | null
): AuthPrincipal {
  const active = requireActiveActor(stores, actor);
  if (active.role !== 'admin' || !hasPermission(active.role, 'academics:manage_structure')) {
    throw new AssessmentServiceError(
      'UNAUTHORIZED',
      'Access denied. Admin authorization is required.'
    );
  }
  return active;
}

export function requireTeacherActor(
  stores: LocalAssessmentStores,
  actor: AuthPrincipal | null,
  permission: PermissionAction = 'homework:read_assigned'
): AuthPrincipal {
  const active = requireActiveActor(stores, actor);
  if (active.role !== 'teacher' || !hasPermission(active.role, permission)) {
    throw new AssessmentServiceError(
      'UNAUTHORIZED',
      'Access denied. Only an authorized active Teacher may perform this action.'
    );
  }
  return active;
}

export function requireStudentActor(
  stores: LocalAssessmentStores,
  actor: AuthPrincipal | null,
  permission: PermissionAction = 'homework:read_assigned'
): AuthPrincipal {
  const active = requireActiveActor(stores, actor);
  if (active.role !== 'student' || !hasPermission(active.role, permission)) {
    throw new AssessmentServiceError(
      'UNAUTHORIZED',
      'Access denied. Only an authorized active Student account may perform this action.'
    );
  }
  return active;
}

export function getStudentActiveEnrolment(
  stores: LocalAssessmentStores,
  studentLoginId: string
): StudentEnrolment | null {
  const normalized = studentLoginId.trim().toUpperCase();
  return (
    stores.academicStore.enrolments.find(
      (e) => e.status === 'active' && e.studentAccountId.toUpperCase() === normalized
    ) ?? null
  );
}

export function getBatchActiveStudents(
  stores: LocalAssessmentStores,
  classId: string,
  batchId: string
): TeacherEligibleStudent[] {
  const accountStore = stores.academicStore.accountStore;
  const activeEnrolments = stores.academicStore.enrolments.filter(
    (e) => e.status === 'active' && e.classId === classId && e.batchId === batchId
  );

  const roster: TeacherEligibleStudent[] = [];
  for (const enr of activeEnrolments) {
    const stuAcc = accountStore.findAccountById(enr.studentAccountId);
    if (stuAcc && stuAcc.role === 'student' && stuAcc.status === 'active') {
      roster.push({
        studentId: stuAcc.accountId,
        studentName: stuAcc.name,
        enrolmentId: enr.enrolmentId,
      });
    }
  }
  return roster.sort((a, b) => a.studentId.localeCompare(b.studentId));
}

export function validateTeacherAcademicAssignment(
  stores: LocalAssessmentStores,
  teacherLoginId: string,
  params: { classId: string; batchId: string; subjectId: string }
) {
  const targetClass = stores.academicStore.classes.find((c) => c.classId === params.classId);
  if (!targetClass) {
    throw new AssessmentServiceError('INVALID_REFERENCE', 'Selected class does not exist.', 'classId');
  }
  if (targetClass.status !== 'active') {
    throw new AssessmentServiceError('INACTIVE_REFERENCE', 'Selected class is inactive.', 'classId');
  }

  const targetBatch = stores.academicStore.batches.find((b) => b.batchId === params.batchId);
  if (!targetBatch) {
    throw new AssessmentServiceError('INVALID_REFERENCE', 'Selected batch does not exist.', 'batchId');
  }
  if (targetBatch.status !== 'active') {
    throw new AssessmentServiceError('INACTIVE_REFERENCE', 'Selected batch is inactive.', 'batchId');
  }
  if (targetBatch.classId !== targetClass.classId) {
    throw new AssessmentServiceError(
      'VALIDATION_ERROR',
      `Batch "${targetBatch.name}" does not belong to "${targetClass.name}".`,
      'batchId'
    );
  }

  const targetSubject = stores.academicStore.subjects.find(
    (s) => s.subjectId === params.subjectId
  );
  if (!targetSubject) {
    throw new AssessmentServiceError(
      'INVALID_REFERENCE',
      'Selected subject does not exist.',
      'subjectId'
    );
  }
  if (targetSubject.status !== 'active') {
    throw new AssessmentServiceError(
      'INACTIVE_REFERENCE',
      'Selected subject is inactive.',
      'subjectId'
    );
  }
  if (!targetSubject.classIds.includes(targetClass.classId)) {
    throw new AssessmentServiceError(
      'VALIDATION_ERROR',
      `Subject "${targetSubject.name}" is not mapped to "${targetClass.name}".`,
      'subjectId'
    );
  }

  const normalizedTeacher = teacherLoginId.trim().toUpperCase();
  const hasAssignment = stores.academicStore.assignments.some(
    (a) =>
      a.status === 'active' &&
      a.teacherAccountId.toUpperCase() === normalizedTeacher &&
      a.classId === params.classId &&
      a.batchId === params.batchId &&
      a.subjectId === params.subjectId
  );

  if (!hasAssignment) {
    throw new AssessmentServiceError(
      'UNAUTHORIZED',
      'You do not have an active assignment for this class, batch, and subject.'
    );
  }

  return { targetClass, targetBatch, targetSubject };
}

export function parseIsoDateTime(
  value: string,
  field: string,
  label: string
): { iso: string; ms: number } {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    throw new AssessmentServiceError('VALIDATION_ERROR', `${label} is required.`, field);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AssessmentServiceError(
      'VALIDATION_ERROR',
      `${label} must be a valid date and time.`,
      field
    );
  }
  return { iso: parsed.toISOString(), ms: parsed.getTime() };
}

export function lookupAcademicNames(
  stores: LocalAssessmentStores,
  ids: { classId: string; batchId: string; subjectId: string; teacherId: string }
) {
  const cls = stores.academicStore.classes.find((c) => c.classId === ids.classId);
  const bat = stores.academicStore.batches.find((b) => b.batchId === ids.batchId);
  const sub = stores.academicStore.subjects.find((s) => s.subjectId === ids.subjectId);
  const tch = stores.academicStore.accountStore.findAccountById(ids.teacherId);
  return {
    className: cls?.name ?? ids.classId,
    batchName: bat?.name ?? ids.batchId,
    subjectName: sub?.name ?? ids.subjectId,
    teacherName: tch?.name ?? ids.teacherId,
  };
}

export function enqueueAssessmentNotification(
  stores: LocalAssessmentStores,
  input: {
    recipientStudentId: string;
    type: AssessmentNotificationType;
    relatedRecordId: string;
    title: string;
    message: string;
    dedupeKey: string;
  }
): AssessmentNotification | null {
  const exists = stores.notifications.some((n) => n.dedupeKey === input.dedupeKey);
  if (exists) {
    return null;
  }
  const seq = stores.homeworkCounters.notificationSeq;
  const id = formatAssessmentId('ANF', seq);
  stores.homeworkCounters.notificationSeq = seq + 1;

  const notification: AssessmentNotification = {
    id,
    recipientStudentId: input.recipientStudentId.toUpperCase(),
    type: input.type,
    relatedRecordId: input.relatedRecordId,
    title: input.title,
    message: input.message,
    createdAt: new Date().toISOString(),
    dedupeKey: input.dedupeKey,
  };

  stores.notifications = [notification, ...stores.notifications];
  return notification;
}
