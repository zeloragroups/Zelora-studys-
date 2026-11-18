import {
  hasPermission,
  type AcademicOverviewStats,
  type AcademicStatus,
  type AccountRecord,
  type AnnouncementAudience,
  type AnnouncementRecord,
  type AuthPrincipal,
  type BatchRecord,
  type ClassRecord,
  type DayOfWeek,
  type StudentEnrolment,
  type StudentWorkspaceData,
  type SubjectRecord,
  type TeacherAssignment,
  type TeacherWorkspaceData,
  type TimetableEntry,
  type TimetableEntryStatus,
} from '../../types';
import { validateRequiredText, validateTimeRange } from '../../utils/validation';
import {
  AcademicServiceError,
  type IAcademicManagementService,
} from '../contracts/academicService';
import {
  formatAcademicId,
  LocalAcademicStore,
  sharedLocalAcademicStore,
} from './localAcademicStore';

function requireActiveActor(actor: AuthPrincipal | null): AuthPrincipal {
  if (!actor) {
    throw new AcademicServiceError('UNAUTHORIZED', 'Authentication is required.');
  }
  if (actor.status !== 'active') {
    throw new AcademicServiceError('UNAUTHORIZED', 'Active account status is required.');
  }
  return actor;
}

function requireAdminActor(actor: AuthPrincipal | null): AuthPrincipal {
  const active = requireActiveActor(actor);
  if (
    active.role !== 'admin' ||
    !hasPermission(active.role, 'academics:manage_structure')
  ) {
    throw new AcademicServiceError(
      'UNAUTHORIZED',
      'Access denied. Only an authorized Admin may manage academic records.'
    );
  }
  return active;
}

function requireTeacherActor(actor: AuthPrincipal | null): AuthPrincipal {
  const active = requireActiveActor(actor);
  if (active.role !== 'teacher') {
    throw new AcademicServiceError('UNAUTHORIZED', 'Teacher access required.');
  }
  return active;
}

function requireStudentActor(actor: AuthPrincipal | null): AuthPrincipal {
  const active = requireActiveActor(actor);
  if (active.role !== 'student') {
    throw new AcademicServiceError('UNAUTHORIZED', 'Student access required.');
  }
  return active;
}

function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA < endB && startB < endA;
}

export class LocalDevAcademicService implements IAcademicManagementService {
  private readonly store: LocalAcademicStore;

  constructor(store: LocalAcademicStore = sharedLocalAcademicStore) {
    this.store = store;
  }

  async getAcademicOverview(actor: AuthPrincipal | null): Promise<AcademicOverviewStats> {
    requireAdminActor(actor);
    return {
      totalClasses: this.store.classes.length,
      activeClasses: this.store.classes.filter((c) => c.status === 'active').length,
      totalBatches: this.store.batches.length,
      activeBatches: this.store.batches.filter((b) => b.status === 'active').length,
      totalSubjects: this.store.subjects.length,
      enrolledStudents: this.store.enrolments.filter((e) => e.status === 'active').length,
      activeAssignments: this.store.assignments.filter((a) => a.status === 'active').length,
      activeTimetableSessions: this.store.timetable.filter((t) => t.status === 'active').length,
      publishedAnnouncements: this.store.announcements.filter(
        (a) => a.publicationStatus === 'published'
      ).length,
    };
  }

  // -------------------- CLASSES --------------------

  async listClasses(actor: AuthPrincipal | null, searchQuery?: string): Promise<ClassRecord[]> {
    requireAdminActor(actor);
    const q = searchQuery?.trim().toLowerCase();
    const list = q
      ? this.store.classes.filter(
          (c) =>
            c.classId.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            (c.description ?? '').toLowerCase().includes(q)
        )
      : this.store.classes;
    return list.map((c) => ({ ...c }));
  }

  async createClass(
    actor: AuthPrincipal | null,
    input: { name: string; description?: string; status?: AcademicStatus }
  ): Promise<ClassRecord> {
    requireAdminActor(actor);
    const nameCheck = validateRequiredText(input.name, 'Class name');
    if (!nameCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    }

    const normalizedName = input.name.trim().toLowerCase();
    if (this.store.classes.some((c) => c.name.trim().toLowerCase() === normalizedName)) {
      throw new AcademicServiceError(
        'DUPLICATE_RECORD',
        `A class named "${input.name.trim()}" already exists.`,
        'name'
      );
    }

    let seq = this.store.counters.classSeq;
    let classId = formatAcademicId('CLS', seq);
    const existingIds = new Set(this.store.classes.map((c) => c.classId.toUpperCase()));
    while (existingIds.has(classId)) {
      seq += 1;
      classId = formatAcademicId('CLS', seq);
    }
    this.store.counters.classSeq = seq + 1;

    const record: ClassRecord = {
      id: `dev-cls-${seq}`,
      classId,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      status: input.status ?? 'active',
      createdAt: new Date().toISOString(),
    };

    this.store.classes = [record, ...this.store.classes];
    this.store.save();
    return { ...record };
  }

  async updateClass(
    actor: AuthPrincipal | null,
    classId: string,
    updates: { name: string; description?: string }
  ): Promise<ClassRecord> {
    requireAdminActor(actor);
    const nameCheck = validateRequiredText(updates.name, 'Class name');
    if (!nameCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    }

    const idx = this.store.classes.findIndex((c) => c.classId === classId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Class "${classId}" not found.`);
    }

    const normalizedName = updates.name.trim().toLowerCase();
    if (
      this.store.classes.some(
        (c) => c.classId !== classId && c.name.trim().toLowerCase() === normalizedName
      )
    ) {
      throw new AcademicServiceError(
        'DUPLICATE_RECORD',
        `Another class named "${updates.name.trim()}" already exists.`,
        'name'
      );
    }

    const updated: ClassRecord = {
      ...this.store.classes[idx],
      name: updates.name.trim(),
      description: updates.description?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    this.store.classes[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async setClassStatus(
    actor: AuthPrincipal | null,
    classId: string,
    status: AcademicStatus
  ): Promise<ClassRecord> {
    requireAdminActor(actor);
    const idx = this.store.classes.findIndex((c) => c.classId === classId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Class "${classId}" not found.`);
    }
    const updated: ClassRecord = {
      ...this.store.classes[idx],
      status,
      updatedAt: new Date().toISOString(),
    };
    this.store.classes[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async deleteClass(actor: AuthPrincipal | null, classId: string): Promise<void> {
    requireAdminActor(actor);
    const exists = this.store.classes.some((c) => c.classId === classId);
    if (!exists) {
      throw new AcademicServiceError('NOT_FOUND', `Class "${classId}" not found.`);
    }

    const hasBatches = this.store.batches.some((b) => b.classId === classId);
    const hasEnrolments = this.store.enrolments.some((e) => e.classId === classId);
    const hasSubjects = this.store.subjects.some((s) => s.classIds.includes(classId));

    if (hasBatches || hasEnrolments || hasSubjects) {
      throw new AcademicServiceError(
        'DELETE_BLOCKED',
        'Cannot delete a class that has associated batches, subjects, or student enrolments. Deactivate it instead to preserve history.'
      );
    }

    this.store.classes = this.store.classes.filter((c) => c.classId !== classId);
    this.store.save();
  }

  // -------------------- BATCHES --------------------

  async listBatches(
    actor: AuthPrincipal | null,
    filter?: { classId?: string; searchQuery?: string }
  ): Promise<BatchRecord[]> {
    requireAdminActor(actor);
    let results = this.store.batches;
    if (filter?.classId && filter.classId !== 'all') {
      results = results.filter((b) => b.classId === filter.classId);
    }
    const q = filter?.searchQuery?.trim().toLowerCase();
    if (q) {
      results = results.filter(
        (b) => b.batchId.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)
      );
    }
    return results.map((b) => ({ ...b }));
  }

  async createBatch(
    actor: AuthPrincipal | null,
    input: { name: string; classId: string; description?: string; status?: AcademicStatus }
  ): Promise<BatchRecord> {
    requireAdminActor(actor);
    const nameCheck = validateRequiredText(input.name, 'Batch name');
    if (!nameCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    }

    const targetClass = this.store.classes.find((c) => c.classId === input.classId);
    if (!targetClass) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Selected class does not exist.', 'classId');
    }
    if (targetClass.status !== 'active') {
      throw new AcademicServiceError(
        'INACTIVE_REFERENCE',
        'Cannot create a batch inside an inactive class.',
        'classId'
      );
    }

    const normalizedName = input.name.trim().toLowerCase();
    if (
      this.store.batches.some(
        (b) => b.classId === input.classId && b.name.trim().toLowerCase() === normalizedName
      )
    ) {
      throw new AcademicServiceError(
        'DUPLICATE_RECORD',
        `Batch "${input.name.trim()}" already exists in ${targetClass.name}.`,
        'name'
      );
    }

    let seq = this.store.counters.batchSeq;
    let batchId = formatAcademicId('BAT', seq);
    const existingIds = new Set(this.store.batches.map((b) => b.batchId.toUpperCase()));
    while (existingIds.has(batchId)) {
      seq += 1;
      batchId = formatAcademicId('BAT', seq);
    }
    this.store.counters.batchSeq = seq + 1;

    const record: BatchRecord = {
      id: `dev-bat-${seq}`,
      batchId,
      name: input.name.trim(),
      classId: targetClass.classId,
      description: input.description?.trim() || undefined,
      status: input.status ?? 'active',
      createdAt: new Date().toISOString(),
    };

    this.store.batches = [record, ...this.store.batches];
    this.store.save();
    return { ...record };
  }

  async updateBatch(
    actor: AuthPrincipal | null,
    batchId: string,
    updates: { name: string; classId: string; description?: string }
  ): Promise<BatchRecord> {
    requireAdminActor(actor);
    const nameCheck = validateRequiredText(updates.name, 'Batch name');
    if (!nameCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    }

    const idx = this.store.batches.findIndex((b) => b.batchId === batchId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Batch "${batchId}" not found.`);
    }

    const targetClass = this.store.classes.find((c) => c.classId === updates.classId);
    if (!targetClass) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Selected class does not exist.', 'classId');
    }

    const normalizedName = updates.name.trim().toLowerCase();
    if (
      this.store.batches.some(
        (b) =>
          b.batchId !== batchId &&
          b.classId === updates.classId &&
          b.name.trim().toLowerCase() === normalizedName
      )
    ) {
      throw new AcademicServiceError(
        'DUPLICATE_RECORD',
        `Another batch named "${updates.name.trim()}" exists in ${targetClass.name}.`,
        'name'
      );
    }

    const updated: BatchRecord = {
      ...this.store.batches[idx],
      name: updates.name.trim(),
      classId: targetClass.classId,
      description: updates.description?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    this.store.batches[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async setBatchStatus(
    actor: AuthPrincipal | null,
    batchId: string,
    status: AcademicStatus
  ): Promise<BatchRecord> {
    requireAdminActor(actor);
    const idx = this.store.batches.findIndex((b) => b.batchId === batchId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Batch "${batchId}" not found.`);
    }
    const updated: BatchRecord = {
      ...this.store.batches[idx],
      status,
      updatedAt: new Date().toISOString(),
    };
    this.store.batches[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async deleteBatch(actor: AuthPrincipal | null, batchId: string): Promise<void> {
    requireAdminActor(actor);
    const exists = this.store.batches.some((b) => b.batchId === batchId);
    if (!exists) {
      throw new AcademicServiceError('NOT_FOUND', `Batch "${batchId}" not found.`);
    }

    const hasActiveEnrolments = this.store.enrolments.some(
      (e) => e.batchId === batchId && e.status === 'active'
    );
    const hasTimetable = this.store.timetable.some((t) => t.batchId === batchId);

    if (hasActiveEnrolments || hasTimetable) {
      throw new AcademicServiceError(
        'DELETE_BLOCKED',
        'Cannot delete a batch with active enrolments or timetable records. Deactivate it instead.'
      );
    }

    this.store.batches = this.store.batches.filter((b) => b.batchId !== batchId);
    this.store.save();
  }

  // -------------------- SUBJECTS --------------------

  async listSubjects(
    actor: AuthPrincipal | null,
    filter?: { classId?: string; searchQuery?: string }
  ): Promise<SubjectRecord[]> {
    requireAdminActor(actor);
    let results = this.store.subjects;
    if (filter?.classId && filter.classId !== 'all') {
      results = results.filter((s) => s.classIds.includes(filter.classId!));
    }
    const q = filter?.searchQuery?.trim().toLowerCase();
    if (q) {
      results = results.filter(
        (s) =>
          s.subjectId.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          (s.code ?? '').toLowerCase().includes(q)
      );
    }
    return results.map((s) => ({ ...s, classIds: [...s.classIds] }));
  }

  async createSubject(
    actor: AuthPrincipal | null,
    input: { name: string; code?: string; classIds: string[]; status?: AcademicStatus }
  ): Promise<SubjectRecord> {
    requireAdminActor(actor);
    const nameCheck = validateRequiredText(input.name, 'Subject name');
    if (!nameCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    }

    const uniqueClassIds = Array.from(new Set(input.classIds));
    if (uniqueClassIds.length === 0) {
      throw new AcademicServiceError(
        'VALIDATION_ERROR',
        'Associate the subject with at least one valid class.',
        'classIds'
      );
    }

    for (const cid of uniqueClassIds) {
      if (!this.store.classes.some((c) => c.classId === cid)) {
        throw new AcademicServiceError('INVALID_REFERENCE', `Class "${cid}" does not exist.`, 'classIds');
      }
    }

    const normalizedName = input.name.trim().toLowerCase();
    const duplicateInSameClass = this.store.subjects.some(
      (s) =>
        s.name.trim().toLowerCase() === normalizedName &&
        s.classIds.some((cid) => uniqueClassIds.includes(cid))
    );
    if (duplicateInSameClass) {
      throw new AcademicServiceError(
        'DUPLICATE_RECORD',
        `Subject "${input.name.trim()}" is already registered for one or more selected classes.`,
        'name'
      );
    }

    let seq = this.store.counters.subjectSeq;
    let subjectId = formatAcademicId('SUB', seq);
    const existingIds = new Set(this.store.subjects.map((s) => s.subjectId.toUpperCase()));
    while (existingIds.has(subjectId)) {
      seq += 1;
      subjectId = formatAcademicId('SUB', seq);
    }
    this.store.counters.subjectSeq = seq + 1;

    const record: SubjectRecord = {
      id: `dev-sub-${seq}`,
      subjectId,
      name: input.name.trim(),
      code: input.code?.trim().toUpperCase() || undefined,
      classIds: uniqueClassIds,
      status: input.status ?? 'active',
      createdAt: new Date().toISOString(),
    };

    this.store.subjects = [record, ...this.store.subjects];
    this.store.save();
    return { ...record, classIds: [...record.classIds] };
  }

  async updateSubject(
    actor: AuthPrincipal | null,
    subjectId: string,
    updates: { name: string; code?: string; classIds: string[] }
  ): Promise<SubjectRecord> {
    requireAdminActor(actor);
    const nameCheck = validateRequiredText(updates.name, 'Subject name');
    if (!nameCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', nameCheck.error!, 'name');
    }

    const idx = this.store.subjects.findIndex((s) => s.subjectId === subjectId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Subject "${subjectId}" not found.`);
    }

    const uniqueClassIds = Array.from(new Set(updates.classIds));
    if (uniqueClassIds.length === 0) {
      throw new AcademicServiceError(
        'VALIDATION_ERROR',
        'Associate the subject with at least one valid class.',
        'classIds'
      );
    }

    for (const cid of uniqueClassIds) {
      if (!this.store.classes.some((c) => c.classId === cid)) {
        throw new AcademicServiceError('INVALID_REFERENCE', `Class "${cid}" does not exist.`, 'classIds');
      }
    }

    const normalizedName = updates.name.trim().toLowerCase();
    const duplicate = this.store.subjects.some(
      (s) =>
        s.subjectId !== subjectId &&
        s.name.trim().toLowerCase() === normalizedName &&
        s.classIds.some((cid) => uniqueClassIds.includes(cid))
    );
    if (duplicate) {
      throw new AcademicServiceError(
        'DUPLICATE_RECORD',
        `Another subject "${updates.name.trim()}" already exists for a selected class.`,
        'name'
      );
    }

    const updated: SubjectRecord = {
      ...this.store.subjects[idx],
      name: updates.name.trim(),
      code: updates.code?.trim().toUpperCase() || undefined,
      classIds: uniqueClassIds,
      updatedAt: new Date().toISOString(),
    };
    this.store.subjects[idx] = updated;
    this.store.save();
    return { ...updated, classIds: [...updated.classIds] };
  }

  async setSubjectStatus(
    actor: AuthPrincipal | null,
    subjectId: string,
    status: AcademicStatus
  ): Promise<SubjectRecord> {
    requireAdminActor(actor);
    const idx = this.store.subjects.findIndex((s) => s.subjectId === subjectId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Subject "${subjectId}" not found.`);
    }
    const updated: SubjectRecord = {
      ...this.store.subjects[idx],
      status,
      updatedAt: new Date().toISOString(),
    };
    this.store.subjects[idx] = updated;
    this.store.save();
    return { ...updated, classIds: [...updated.classIds] };
  }

  // -------------------- STUDENT ENROLMENTS --------------------

  async listEnrolments(actor: AuthPrincipal | null): Promise<StudentEnrolment[]> {
    requireAdminActor(actor);
    return this.store.enrolments.map((e) => ({ ...e }));
  }

  async listUnenrolledStudents(actor: AuthPrincipal | null): Promise<AccountRecord[]> {
    requireAdminActor(actor);
    const activelyEnrolledIds = new Set(
      this.store.enrolments
        .filter((e) => e.status === 'active')
        .map((e) => e.studentAccountId.toUpperCase())
    );

    return this.store.accountStore
      .getAllAccounts()
      .filter(
        (acc) =>
          acc.role === 'student' &&
          !activelyEnrolledIds.has(acc.accountId.toUpperCase())
      );
  }

  private validateClassAndBatchForEnrolment(classId: string, batchId: string) {
    const targetClass = this.store.classes.find((c) => c.classId === classId);
    if (!targetClass) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Selected class does not exist.', 'classId');
    }
    if (targetClass.status !== 'active') {
      throw new AcademicServiceError('INACTIVE_REFERENCE', 'Cannot enrol into an inactive class.', 'classId');
    }
    const targetBatch = this.store.batches.find((b) => b.batchId === batchId);
    if (!targetBatch) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Selected batch does not exist.', 'batchId');
    }
    if (targetBatch.status !== 'active') {
      throw new AcademicServiceError('INACTIVE_REFERENCE', 'Cannot enrol into an inactive batch.', 'batchId');
    }
    if (targetBatch.classId !== targetClass.classId) {
      throw new AcademicServiceError(
        'VALIDATION_ERROR',
        `Batch "${targetBatch.name}" does not belong to class "${targetClass.name}".`,
        'batchId'
      );
    }
    return { targetClass, targetBatch };
  }

  async enrolStudent(
    actor: AuthPrincipal | null,
    input: { studentAccountId: string; classId: string; batchId: string; enrolmentDate?: string }
  ): Promise<StudentEnrolment> {
    requireAdminActor(actor);
    const student = this.store.accountStore.findAccountById(input.studentAccountId);
    if (!student || student.role !== 'student') {
      throw new AcademicServiceError(
        'INVALID_REFERENCE',
        `Student account "${input.studentAccountId}" was not found.`,
        'studentAccountId'
      );
    }
    if (student.status !== 'active') {
      throw new AcademicServiceError(
        'INACTIVE_REFERENCE',
        `Student account "${student.accountId}" is deactivated. Reactivate the account before enrolling.`,
        'studentAccountId'
      );
    }

    this.validateClassAndBatchForEnrolment(input.classId, input.batchId);

    const alreadyActive = this.store.enrolments.some(
      (e) =>
        e.studentAccountId.toUpperCase() === student.accountId.toUpperCase() &&
        e.status === 'active'
    );
    if (alreadyActive) {
      throw new AcademicServiceError(
        'DUPLICATE_RECORD',
        `Student "${student.accountId}" already has an active enrolment. Update or deactivate their existing enrolment instead.`,
        'studentAccountId'
      );
    }

    const seq = this.store.counters.enrolmentSeq;
    const enrolmentId = formatAcademicId('ENR', seq);
    this.store.counters.enrolmentSeq = seq + 1;

    const record: StudentEnrolment = {
      id: `dev-enr-${seq}`,
      enrolmentId,
      studentAccountId: student.accountId,
      classId: input.classId,
      batchId: input.batchId,
      enrolmentDate: input.enrolmentDate || new Date().toISOString().slice(0, 10),
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.store.enrolments = [record, ...this.store.enrolments];
    this.store.save();
    return { ...record };
  }

  async updateEnrolmentClassBatch(
    actor: AuthPrincipal | null,
    enrolmentId: string,
    updates: { classId: string; batchId: string }
  ): Promise<StudentEnrolment> {
    requireAdminActor(actor);
    const idx = this.store.enrolments.findIndex((e) => e.enrolmentId === enrolmentId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Enrolment "${enrolmentId}" not found.`);
    }

    this.validateClassAndBatchForEnrolment(updates.classId, updates.batchId);

    const updated: StudentEnrolment = {
      ...this.store.enrolments[idx],
      classId: updates.classId,
      batchId: updates.batchId,
      updatedAt: new Date().toISOString(),
    };
    this.store.enrolments[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async setEnrolmentStatus(
    actor: AuthPrincipal | null,
    enrolmentId: string,
    status: AcademicStatus
  ): Promise<StudentEnrolment> {
    requireAdminActor(actor);
    const idx = this.store.enrolments.findIndex((e) => e.enrolmentId === enrolmentId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Enrolment "${enrolmentId}" not found.`);
    }
    const existing = this.store.enrolments[idx];
    if (status === 'active') {
      const hasOtherActive = this.store.enrolments.some(
        (e) =>
          e.enrolmentId !== enrolmentId &&
          e.studentAccountId.toUpperCase() === existing.studentAccountId.toUpperCase() &&
          e.status === 'active'
      );
      if (hasOtherActive) {
        throw new AcademicServiceError(
          'DUPLICATE_RECORD',
          `Student "${existing.studentAccountId}" already has another active enrolment.`
        );
      }
      this.validateClassAndBatchForEnrolment(existing.classId, existing.batchId);
    }

    const updated: StudentEnrolment = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.store.enrolments[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  // -------------------- TEACHER ASSIGNMENTS --------------------

  private validateAssignmentPayload(input: {
    teacherAccountId: string;
    subjectId: string;
    classId: string;
    batchId: string;
    ignoreAssignmentId?: string;
  }) {
    const teacher = this.store.accountStore.findAccountById(input.teacherAccountId);
    if (!teacher || teacher.role !== 'teacher') {
      throw new AcademicServiceError(
        'INVALID_REFERENCE',
        `Teacher account "${input.teacherAccountId}" does not exist.`,
        'teacherAccountId'
      );
    }
    if (teacher.status !== 'active') {
      throw new AcademicServiceError(
        'INACTIVE_REFERENCE',
        `Teacher account "${teacher.accountId}" is deactivated.`,
        'teacherAccountId'
      );
    }

    const targetClass = this.store.classes.find((c) => c.classId === input.classId);
    if (!targetClass || targetClass.status !== 'active') {
      throw new AcademicServiceError(
        targetClass ? 'INACTIVE_REFERENCE' : 'INVALID_REFERENCE',
        targetClass ? 'Selected class is inactive.' : 'Selected class does not exist.',
        'classId'
      );
    }

    const targetBatch = this.store.batches.find((b) => b.batchId === input.batchId);
    if (!targetBatch || targetBatch.status !== 'active') {
      throw new AcademicServiceError(
        targetBatch ? 'INACTIVE_REFERENCE' : 'INVALID_REFERENCE',
        targetBatch ? 'Selected batch is inactive.' : 'Selected batch does not exist.',
        'batchId'
      );
    }
    if (targetBatch.classId !== targetClass.classId) {
      throw new AcademicServiceError(
        'VALIDATION_ERROR',
        `Batch "${targetBatch.name}" does not belong to "${targetClass.name}".`,
        'batchId'
      );
    }

    const targetSubject = this.store.subjects.find((s) => s.subjectId === input.subjectId);
    if (!targetSubject || targetSubject.status !== 'active') {
      throw new AcademicServiceError(
        targetSubject ? 'INACTIVE_REFERENCE' : 'INVALID_REFERENCE',
        targetSubject ? 'Selected subject is inactive.' : 'Selected subject does not exist.',
        'subjectId'
      );
    }
    if (!targetSubject.classIds.includes(targetClass.classId)) {
      throw new AcademicServiceError(
        'VALIDATION_ERROR',
        `Subject "${targetSubject.name}" is not associated with "${targetClass.name}".`,
        'subjectId'
      );
    }

    const duplicate = this.store.assignments.some(
      (a) =>
        a.assignmentId !== input.ignoreAssignmentId &&
        a.status === 'active' &&
        a.teacherAccountId.toUpperCase() === teacher.accountId.toUpperCase() &&
        a.subjectId === targetSubject.subjectId &&
        a.batchId === targetBatch.batchId
    );
    if (duplicate) {
      throw new AcademicServiceError(
        'DUPLICATE_RECORD',
        `${teacher.name} is already actively assigned to ${targetSubject.name} for ${targetBatch.name}.`
      );
    }

    return teacher;
  }

  async listTeacherAssignments(actor: AuthPrincipal | null): Promise<TeacherAssignment[]> {
    requireAdminActor(actor);
    return this.store.assignments.map((a) => ({ ...a }));
  }

  async createTeacherAssignment(
    actor: AuthPrincipal | null,
    input: { teacherAccountId: string; subjectId: string; classId: string; batchId: string }
  ): Promise<TeacherAssignment> {
    requireAdminActor(actor);
    const teacher = this.validateAssignmentPayload(input);

    const seq = this.store.counters.assignmentSeq;
    const assignmentId = formatAcademicId('ASG', seq);
    this.store.counters.assignmentSeq = seq + 1;

    const record: TeacherAssignment = {
      id: `dev-asg-${seq}`,
      assignmentId,
      teacherAccountId: teacher.accountId,
      subjectId: input.subjectId,
      classId: input.classId,
      batchId: input.batchId,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.store.assignments = [record, ...this.store.assignments];
    this.store.save();
    return { ...record };
  }

  async updateTeacherAssignment(
    actor: AuthPrincipal | null,
    assignmentId: string,
    updates: { teacherAccountId: string; subjectId: string; classId: string; batchId: string }
  ): Promise<TeacherAssignment> {
    requireAdminActor(actor);
    const idx = this.store.assignments.findIndex((a) => a.assignmentId === assignmentId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Assignment "${assignmentId}" not found.`);
    }

    const teacher = this.validateAssignmentPayload({
      ...updates,
      ignoreAssignmentId: assignmentId,
    });

    const updated: TeacherAssignment = {
      ...this.store.assignments[idx],
      teacherAccountId: teacher.accountId,
      subjectId: updates.subjectId,
      classId: updates.classId,
      batchId: updates.batchId,
      updatedAt: new Date().toISOString(),
    };
    this.store.assignments[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async setTeacherAssignmentStatus(
    actor: AuthPrincipal | null,
    assignmentId: string,
    status: AcademicStatus
  ): Promise<TeacherAssignment> {
    requireAdminActor(actor);
    const idx = this.store.assignments.findIndex((a) => a.assignmentId === assignmentId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Assignment "${assignmentId}" not found.`);
    }
    const existing = this.store.assignments[idx];
    if (status === 'active') {
      this.validateAssignmentPayload({
        teacherAccountId: existing.teacherAccountId,
        subjectId: existing.subjectId,
        classId: existing.classId,
        batchId: existing.batchId,
        ignoreAssignmentId: assignmentId,
      });
    }
    const updated: TeacherAssignment = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.store.assignments[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  // -------------------- TIMETABLE --------------------

  private validateTimetableInput(input: {
    classId: string;
    batchId: string;
    subjectId: string;
    teacherAccountId: string;
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    ignoreEntryId?: string;
  }) {
    const timeCheck = validateTimeRange(input.startTime, input.endTime);
    if (!timeCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', timeCheck.error!, 'endTime');
    }

    const batch = this.store.batches.find((b) => b.batchId === input.batchId);
    if (!batch || batch.classId !== input.classId) {
      throw new AcademicServiceError(
        'VALIDATION_ERROR',
        'Selected batch must belong to the selected class.',
        'batchId'
      );
    }

    const hasValidAssignment = this.store.assignments.some(
      (a) =>
        a.status === 'active' &&
        a.teacherAccountId.toUpperCase() === input.teacherAccountId.trim().toUpperCase() &&
        a.subjectId === input.subjectId &&
        a.classId === input.classId &&
        a.batchId === input.batchId
    );
    if (!hasValidAssignment) {
      throw new AcademicServiceError(
        'INVALID_REFERENCE',
        'Teacher must have an active assignment for this class, batch, and subject before scheduling.'
      );
    }

    const activeSameDay = this.store.timetable.filter(
      (t) =>
        t.status === 'active' &&
        t.entryId !== input.ignoreEntryId &&
        t.dayOfWeek === input.dayOfWeek
    );

    const batchOverlap = activeSameDay.find(
      (t) =>
        t.batchId === input.batchId &&
        timesOverlap(input.startTime, input.endTime, t.startTime, t.endTime)
    );
    if (batchOverlap) {
      throw new AcademicServiceError(
        'TIMETABLE_CONFLICT',
        `Batch conflict on ${input.dayOfWeek}: overlaps with ${batchOverlap.entryId} (${batchOverlap.startTime}–${batchOverlap.endTime}).`
      );
    }

    const teacherOverlap = activeSameDay.find(
      (t) =>
        t.teacherAccountId.toUpperCase() === input.teacherAccountId.trim().toUpperCase() &&
        timesOverlap(input.startTime, input.endTime, t.startTime, t.endTime)
    );
    if (teacherOverlap) {
      throw new AcademicServiceError(
        'TIMETABLE_CONFLICT',
        `Teacher schedule conflict on ${input.dayOfWeek}: teacher is already scheduled in ${teacherOverlap.entryId} (${teacherOverlap.startTime}–${teacherOverlap.endTime}).`
      );
    }
  }

  async listTimetableEntries(
    actor: AuthPrincipal | null,
    filter?: { classId?: string; batchId?: string; teacherAccountId?: string; subjectId?: string }
  ): Promise<TimetableEntry[]> {
    requireAdminActor(actor);
    let results = this.store.timetable;
    if (filter?.classId && filter.classId !== 'all') {
      results = results.filter((t) => t.classId === filter.classId);
    }
    if (filter?.batchId && filter.batchId !== 'all') {
      results = results.filter((t) => t.batchId === filter.batchId);
    }
    if (filter?.teacherAccountId && filter.teacherAccountId !== 'all') {
      results = results.filter(
        (t) => t.teacherAccountId.toUpperCase() === filter.teacherAccountId!.toUpperCase()
      );
    }
    if (filter?.subjectId && filter.subjectId !== 'all') {
      results = results.filter((t) => t.subjectId === filter.subjectId);
    }
    return results.map((t) => ({ ...t }));
  }

  async createTimetableEntry(
    actor: AuthPrincipal | null,
    input: {
      classId: string;
      batchId: string;
      subjectId: string;
      teacherAccountId: string;
      dayOfWeek: DayOfWeek;
      startTime: string;
      endTime: string;
      room?: string;
    }
  ): Promise<TimetableEntry> {
    requireAdminActor(actor);
    this.validateTimetableInput(input);

    const seq = this.store.counters.timetableSeq;
    const entryId = formatAcademicId('TT', seq);
    this.store.counters.timetableSeq = seq + 1;

    const record: TimetableEntry = {
      id: `dev-tt-${seq}`,
      entryId,
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherAccountId: input.teacherAccountId.trim().toUpperCase(),
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime.trim(),
      endTime: input.endTime.trim(),
      room: input.room?.trim() || undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.store.timetable = [record, ...this.store.timetable];
    this.store.save();
    return { ...record };
  }

  async updateTimetableEntry(
    actor: AuthPrincipal | null,
    entryId: string,
    updates: {
      classId: string;
      batchId: string;
      subjectId: string;
      teacherAccountId: string;
      dayOfWeek: DayOfWeek;
      startTime: string;
      endTime: string;
      room?: string;
    }
  ): Promise<TimetableEntry> {
    requireAdminActor(actor);
    const idx = this.store.timetable.findIndex((t) => t.entryId === entryId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Timetable entry "${entryId}" not found.`);
    }

    this.validateTimetableInput({ ...updates, ignoreEntryId: entryId });

    const updated: TimetableEntry = {
      ...this.store.timetable[idx],
      classId: updates.classId,
      batchId: updates.batchId,
      subjectId: updates.subjectId,
      teacherAccountId: updates.teacherAccountId.trim().toUpperCase(),
      dayOfWeek: updates.dayOfWeek,
      startTime: updates.startTime.trim(),
      endTime: updates.endTime.trim(),
      room: updates.room?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    this.store.timetable[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async setTimetableEntryStatus(
    actor: AuthPrincipal | null,
    entryId: string,
    status: TimetableEntryStatus
  ): Promise<TimetableEntry> {
    requireAdminActor(actor);
    const idx = this.store.timetable.findIndex((t) => t.entryId === entryId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Timetable entry "${entryId}" not found.`);
    }
    const existing = this.store.timetable[idx];
    if (status === 'active') {
      this.validateTimetableInput({
        classId: existing.classId,
        batchId: existing.batchId,
        subjectId: existing.subjectId,
        teacherAccountId: existing.teacherAccountId,
        dayOfWeek: existing.dayOfWeek,
        startTime: existing.startTime,
        endTime: existing.endTime,
        ignoreEntryId: existing.entryId,
      });
    }

    const updated: TimetableEntry = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.store.timetable[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  // -------------------- ANNOUNCEMENTS --------------------

  private validateAnnouncementTargets(
    audience: AnnouncementAudience,
    targetClassId?: string,
    targetBatchId?: string
  ) {
    if (audience === 'class') {
      if (!targetClassId || !this.store.classes.some((c) => c.classId === targetClassId)) {
        throw new AcademicServiceError('INVALID_REFERENCE', 'Select a valid target class.', 'targetClassId');
      }
    }
    if (audience === 'batch') {
      if (!targetBatchId || !this.store.batches.some((b) => b.batchId === targetBatchId)) {
        throw new AcademicServiceError('INVALID_REFERENCE', 'Select a valid target batch.', 'targetBatchId');
      }
    }
  }

  async listAdminAnnouncements(actor: AuthPrincipal | null): Promise<AnnouncementRecord[]> {
    requireAdminActor(actor);
    return this.store.announcements.map((a) => ({ ...a }));
  }

  async createAnnouncement(
    actor: AuthPrincipal | null,
    input: {
      title: string;
      content: string;
      audience: AnnouncementAudience;
      targetClassId?: string;
      targetBatchId?: string;
      publishImmediately?: boolean;
    }
  ): Promise<AnnouncementRecord> {
    const admin = requireAdminActor(actor);
    const titleCheck = validateRequiredText(input.title, 'Announcement title', 3);
    if (!titleCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', titleCheck.error!, 'title');
    }
    const contentCheck = validateRequiredText(input.content, 'Announcement message', 5);
    if (!contentCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', contentCheck.error!, 'content');
    }
    this.validateAnnouncementTargets(input.audience, input.targetClassId, input.targetBatchId);

    const seq = this.store.counters.announcementSeq;
    const announcementId = formatAcademicId('ANN', seq);
    this.store.counters.announcementSeq = seq + 1;
    const now = new Date().toISOString();

    const record: AnnouncementRecord = {
      id: `dev-ann-${seq}`,
      announcementId,
      title: input.title.trim(),
      content: input.content.trim(),
      audience: input.audience,
      targetClassId: input.audience === 'class' ? input.targetClassId : undefined,
      targetBatchId: input.audience === 'batch' ? input.targetBatchId : undefined,
      publicationStatus: input.publishImmediately ? 'published' : 'draft',
      publishedByAdminId: admin.loginId,
      createdAt: now,
      publishedAt: input.publishImmediately ? now : undefined,
    };

    this.store.announcements = [record, ...this.store.announcements];
    this.store.save();
    return { ...record };
  }

  async updateAnnouncement(
    actor: AuthPrincipal | null,
    announcementId: string,
    updates: {
      title: string;
      content: string;
      audience: AnnouncementAudience;
      targetClassId?: string;
      targetBatchId?: string;
    }
  ): Promise<AnnouncementRecord> {
    requireAdminActor(actor);
    const idx = this.store.announcements.findIndex((a) => a.announcementId === announcementId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Announcement "${announcementId}" not found.`);
    }

    const titleCheck = validateRequiredText(updates.title, 'Announcement title', 3);
    if (!titleCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', titleCheck.error!, 'title');
    }
    const contentCheck = validateRequiredText(updates.content, 'Announcement message', 5);
    if (!contentCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', contentCheck.error!, 'content');
    }
    this.validateAnnouncementTargets(updates.audience, updates.targetClassId, updates.targetBatchId);

    const updated: AnnouncementRecord = {
      ...this.store.announcements[idx],
      title: updates.title.trim(),
      content: updates.content.trim(),
      audience: updates.audience,
      targetClassId: updates.audience === 'class' ? updates.targetClassId : undefined,
      targetBatchId: updates.audience === 'batch' ? updates.targetBatchId : undefined,
      updatedAt: new Date().toISOString(),
    };
    this.store.announcements[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async publishAnnouncement(
    actor: AuthPrincipal | null,
    announcementId: string
  ): Promise<AnnouncementRecord> {
    requireAdminActor(actor);
    const idx = this.store.announcements.findIndex((a) => a.announcementId === announcementId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Announcement "${announcementId}" not found.`);
    }
    const now = new Date().toISOString();
    const updated: AnnouncementRecord = {
      ...this.store.announcements[idx],
      publicationStatus: 'published',
      publishedAt: now,
      updatedAt: now,
    };
    this.store.announcements[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async unpublishAnnouncement(
    actor: AuthPrincipal | null,
    announcementId: string
  ): Promise<AnnouncementRecord> {
    requireAdminActor(actor);
    const idx = this.store.announcements.findIndex((a) => a.announcementId === announcementId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Announcement "${announcementId}" not found.`);
    }
    const updated: AnnouncementRecord = {
      ...this.store.announcements[idx],
      publicationStatus: 'unpublished',
      updatedAt: new Date().toISOString(),
    };
    this.store.announcements[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  async archiveAnnouncement(
    actor: AuthPrincipal | null,
    announcementId: string
  ): Promise<AnnouncementRecord> {
    requireAdminActor(actor);
    const idx = this.store.announcements.findIndex((a) => a.announcementId === announcementId);
    if (idx === -1) {
      throw new AcademicServiceError('NOT_FOUND', `Announcement "${announcementId}" not found.`);
    }
    const updated: AnnouncementRecord = {
      ...this.store.announcements[idx],
      publicationStatus: 'archived',
      updatedAt: new Date().toISOString(),
    };
    this.store.announcements[idx] = updated;
    this.store.save();
    return { ...updated };
  }

  // -------------------- SCOPED TEACHER & STUDENT WORKSPACES --------------------

  async getMyTeacherWorkspace(actor: AuthPrincipal | null): Promise<TeacherWorkspaceData> {
    const teacher = requireTeacherActor(actor);

    const activeAssignments = this.store.assignments.filter(
      (a) =>
        a.status === 'active' &&
        a.teacherAccountId.toUpperCase() === teacher.loginId.toUpperCase()
    );

    const assignments = activeAssignments
      .map((assignment) => {
        const classRecord = this.store.classes.find((c) => c.classId === assignment.classId);
        const batchRecord = this.store.batches.find((b) => b.batchId === assignment.batchId);
        const subjectRecord = this.store.subjects.find(
          (s) => s.subjectId === assignment.subjectId
        );
        if (!classRecord || !batchRecord || !subjectRecord) {
          return null;
        }
        return { assignment: { ...assignment }, classRecord, batchRecord, subjectRecord };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const assignedClassIds = new Set(assignments.map((a) => a.classRecord.classId));
    const assignedBatchIds = new Set(assignments.map((a) => a.batchRecord.batchId));

    const timetable = this.store.timetable
      .filter(
        (t) =>
          t.status === 'active' &&
          t.teacherAccountId.toUpperCase() === teacher.loginId.toUpperCase()
      )
      .map((entry) => ({
        entry: { ...entry },
        className:
          this.store.classes.find((c) => c.classId === entry.classId)?.name ?? entry.classId,
        batchName:
          this.store.batches.find((b) => b.batchId === entry.batchId)?.name ?? entry.batchId,
        subjectName:
          this.store.subjects.find((s) => s.subjectId === entry.subjectId)?.name ??
          entry.subjectId,
      }));

    const announcements = this.store.announcements
      .filter((ann) => {
        if (ann.publicationStatus !== 'published') return false;
        if (ann.audience === 'all' || ann.audience === 'teachers') return true;
        if (ann.audience === 'class' && ann.targetClassId) {
          return assignedClassIds.has(ann.targetClassId);
        }
        if (ann.audience === 'batch' && ann.targetBatchId) {
          return assignedBatchIds.has(ann.targetBatchId);
        }
        return false;
      })
      .map((a) => ({ ...a }));

    return { assignments, timetable, announcements };
  }

  async getMyStudentWorkspace(actor: AuthPrincipal | null): Promise<StudentWorkspaceData> {
    const student = requireStudentActor(actor);

    const enrolment =
      this.store.enrolments.find(
        (e) =>
          e.status === 'active' &&
          e.studentAccountId.toUpperCase() === student.loginId.toUpperCase()
      ) ?? null;

    if (!enrolment) {
      const generalAnnouncements = this.store.announcements
        .filter(
          (ann) =>
            ann.publicationStatus === 'published' &&
            (ann.audience === 'all' || ann.audience === 'students')
        )
        .map((a) => ({ ...a }));

      return {
        enrolment: null,
        classRecord: null,
        batchRecord: null,
        subjects: [],
        timetable: [],
        announcements: generalAnnouncements,
      };
    }

    const classRecord =
      this.store.classes.find((c) => c.classId === enrolment.classId) ?? null;
    const batchRecord =
      this.store.batches.find((b) => b.batchId === enrolment.batchId) ?? null;

    const subjects = this.store.subjects
      .filter((s) => s.status === 'active' && s.classIds.includes(enrolment.classId))
      .map((s) => ({ ...s, classIds: [...s.classIds] }));

    const timetable = this.store.timetable
      .filter((t) => t.status === 'active' && t.batchId === enrolment.batchId)
      .map((entry) => ({
        entry: { ...entry },
        subjectName:
          this.store.subjects.find((s) => s.subjectId === entry.subjectId)?.name ??
          entry.subjectId,
        teacherName:
          this.store.accountStore.findAccountById(entry.teacherAccountId)?.name ??
          entry.teacherAccountId,
      }));

    const announcements = this.store.announcements
      .filter((ann) => {
        if (ann.publicationStatus !== 'published') return false;
        if (ann.audience === 'all' || ann.audience === 'students') return true;
        if (ann.audience === 'class' && ann.targetClassId === enrolment.classId) {
          return true;
        }
        if (ann.audience === 'batch' && ann.targetBatchId === enrolment.batchId) {
          return true;
        }
        return false;
      })
      .map((a) => ({ ...a }));

    return {
      enrolment: { ...enrolment },
      classRecord: classRecord ? { ...classRecord } : null,
      batchRecord: batchRecord ? { ...batchRecord } : null,
      subjects,
      timetable,
      announcements,
    };
  }
}

export const localAcademicService = new LocalDevAcademicService();
