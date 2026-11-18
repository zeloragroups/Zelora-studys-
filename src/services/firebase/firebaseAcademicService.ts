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
import { OperationType } from '../../lib/firebase/firestore';
import { AcademicServiceError, type IAcademicManagementService } from '../contracts/academicService';
import type {
  AcademicOverviewStats,
  AcademicStatus,
  AccountRecord,
  AnnouncementAudience,
  AnnouncementRecord,
  AuthPrincipal,
  BatchRecord,
  ClassRecord,
  DayOfWeek,
  StudentEnrolment,
  StudentWorkspaceData,
  SubjectRecord,
  TeacherAssignment,
  TeacherWorkspaceData,
  TimetableEntry,
  TimetableEntryStatus,
} from '../../types';
import { validateRequiredText, validateTimeRange } from '../../utils/validation';
import {
  generateSafeDocId,
  getActiveAdminUids,
  requireFirestoreDb,
  requireVerifiedActor,
  stripUndefinedFields,
  withFirestoreErrorHandling,
} from './helpers';

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export class FirebaseAcademicService implements IAcademicManagementService {
  private ensureAdmin(actor: AuthPrincipal | null): AuthPrincipal {
    try {
      return requireVerifiedActor(actor, ['admin']);
    } catch (error) {
      throw new AcademicServiceError(
        'UNAUTHORIZED',
        error instanceof Error ? error.message : 'Admin authorization required.'
      );
    }
  }

  private ensureAnySignedIn(actor: AuthPrincipal | null): AuthPrincipal {
    try {
      return requireVerifiedActor(actor, ['admin', 'teacher', 'student']);
    } catch (error) {
      throw new AcademicServiceError(
        'UNAUTHORIZED',
        error instanceof Error ? error.message : 'Authentication required.'
      );
    }
  }

  private async getTeacherUidMap(
    db: ReturnType<typeof requireFirestoreDb>
  ): Promise<Map<string, string>> {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
    const map = new Map<string, string>();
    for (const d of snap.docs) {
      const data = d.data();
      if (typeof data.accountId === 'string') {
        map.set(data.accountId.toUpperCase(), d.id);
      }
    }
    return map;
  }

  private async getStudentUidMap(
    db: ReturnType<typeof requireFirestoreDb>
  ): Promise<Map<string, { uid: string; name: string; status: string }>> {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
    const map = new Map<string, { uid: string; name: string; status: string }>();
    for (const d of snap.docs) {
      const data = d.data();
      if (typeof data.accountId === 'string') {
        map.set(data.accountId.toUpperCase(), {
          uid: d.id,
          name: String(data.name || ''),
          status: String(data.status || 'active'),
        });
      }
    }
    return map;
  }

  private async syncBatchEnrolmentTeacherUids(
    db: ReturnType<typeof requireFirestoreDb>,
    batchId: string
  ): Promise<void> {
    const [asgSnap, enrSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'teacherAssignments'),
          where('batchId', '==', batchId),
          where('status', '==', 'active')
        )
      ),
      getDocs(query(collection(db, 'enrolments'), where('batchId', '==', batchId))),
    ]);
    const teacherUids = Array.from(
      new Set(
        asgSnap.docs
          .map((d) => String(d.data().teacherUid || ''))
          .filter(Boolean)
      )
    ).slice(0, 25);

    if (enrSnap.empty) return;
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    for (const d of enrSnap.docs) {
      batch.update(d.ref, { teacherUids, updatedAt: nowIso });
    }
    await batch.commit();
  }

  async getAcademicOverview(actor: AuthPrincipal | null): Promise<AcademicOverviewStats> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'academicsOverview', async () => {
      const [cls, bat, sub, enr, asg, tt, ann] = await Promise.all([
        getDocs(collection(db, 'classes')),
        getDocs(collection(db, 'batches')),
        getDocs(collection(db, 'subjects')),
        getDocs(collection(db, 'enrolments')),
        getDocs(collection(db, 'teacherAssignments')),
        getDocs(collection(db, 'timetableEntries')),
        getDocs(collection(db, 'announcements')),
      ]);
      const classes = cls.docs.map((d) => d.data() as ClassRecord);
      const batches = bat.docs.map((d) => d.data() as BatchRecord);
      const enrolments = enr.docs.map((d) => d.data() as StudentEnrolment);
      const assignments = asg.docs.map((d) => d.data() as TeacherAssignment);
      const timetable = tt.docs.map((d) => d.data() as TimetableEntry);
      const announcements = ann.docs.map((d) => d.data() as AnnouncementRecord);

      return {
        totalClasses: classes.length,
        activeClasses: classes.filter((c) => c.status === 'active').length,
        totalBatches: batches.length,
        activeBatches: batches.filter((b) => b.status === 'active').length,
        totalSubjects: sub.size,
        enrolledStudents: enrolments.filter((e) => e.status === 'active').length,
        activeAssignments: assignments.filter((a) => a.status === 'active').length,
        activeTimetableSessions: timetable.filter((t) => t.status === 'active').length,
        publishedAnnouncements: announcements.filter((a) => a.publicationStatus === 'published')
          .length,
      };
    });
  }

  // =========================================================================
  // Classes
  // =========================================================================
  async listClasses(actor: AuthPrincipal | null, searchQuery?: string): Promise<ClassRecord[]> {
    this.ensureAnySignedIn(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'classes', async () => {
      const snap = await getDocs(collection(db, 'classes'));
      let list = snap.docs.map((d) => d.data() as ClassRecord);
      const q = searchQuery?.trim().toLowerCase();
      if (q) {
        list = list.filter(
          (c) => c.name.toLowerCase().includes(q) || c.classId.toLowerCase().includes(q)
        );
      }
      return list.sort((a, b) => a.classId.localeCompare(b.classId));
    });
  }

  async createClass(
    actor: AuthPrincipal | null,
    input: { name: string; description?: string; status?: AcademicStatus }
  ): Promise<ClassRecord> {
    this.ensureAdmin(actor);
    const check = validateRequiredText(input.name, 'Class name', 2);
    if (!check.valid) throw new AcademicServiceError('VALIDATION_ERROR', check.error!, 'name');

    const db = requireFirestoreDb();
    const existing = await this.listClasses(actor);
    const nameLower = input.name.trim().toLowerCase();
    if (existing.some((c) => c.name.trim().toLowerCase() === nameLower)) {
      throw new AcademicServiceError('DUPLICATE_RECORD', 'A class with this name already exists.');
    }

    const classId = generateSafeDocId('CLS');
    const nowIso = new Date().toISOString();
    const record: ClassRecord = {
      id: classId,
      classId,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      status: input.status ?? 'active',
      createdAt: nowIso,
    };

    await withFirestoreErrorHandling(OperationType.CREATE, `classes/${classId}`, async () => {
      await setDoc(doc(db, 'classes', classId), stripUndefinedFields({ ...record }));
    });
    return record;
  }

  async updateClass(
    actor: AuthPrincipal | null,
    classId: string,
    updates: { name: string; description?: string }
  ): Promise<ClassRecord> {
    this.ensureAdmin(actor);
    const check = validateRequiredText(updates.name, 'Class name', 2);
    if (!check.valid) throw new AcademicServiceError('VALIDATION_ERROR', check.error!, 'name');

    const db = requireFirestoreDb();
    const ref = doc(db, 'classes', classId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AcademicServiceError('NOT_FOUND', `Class "${classId}" not found.`);
    }
    const existing = snap.data() as ClassRecord;
    const all = await this.listClasses(actor);
    if (
      all.some(
        (c) =>
          c.classId !== classId &&
          c.name.trim().toLowerCase() === updates.name.trim().toLowerCase()
      )
    ) {
      throw new AcademicServiceError('DUPLICATE_RECORD', 'Another class already uses this name.');
    }

    const updated: ClassRecord = {
      ...existing,
      name: updates.name.trim(),
      description: updates.description?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    await withFirestoreErrorHandling(OperationType.UPDATE, `classes/${classId}`, async () => {
      await setDoc(ref, stripUndefinedFields({ ...updated }));
    });
    return updated;
  }

  async setClassStatus(
    actor: AuthPrincipal | null,
    classId: string,
    status: AcademicStatus
  ): Promise<ClassRecord> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'classes', classId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AcademicServiceError('NOT_FOUND', `Class "${classId}" not found.`);
    const updated: ClassRecord = {
      ...(snap.data() as ClassRecord),
      status,
      updatedAt: new Date().toISOString(),
    };
    await withFirestoreErrorHandling(OperationType.UPDATE, `classes/${classId}`, async () => {
      await setDoc(ref, stripUndefinedFields({ ...updated }));
    });
    return updated;
  }

  async deleteClass(actor: AuthPrincipal | null, classId: string): Promise<void> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const [batches, enrolments] = await Promise.all([
      getDocs(query(collection(db, 'batches'), where('classId', '==', classId))),
      getDocs(query(collection(db, 'enrolments'), where('classId', '==', classId))),
    ]);
    if (!batches.empty || !enrolments.empty) {
      throw new AcademicServiceError(
        'DELETE_BLOCKED',
        'Cannot delete class with linked batches or enrolments. Deactivate it instead.'
      );
    }
    await withFirestoreErrorHandling(OperationType.DELETE, `classes/${classId}`, async () => {
      await deleteDoc(doc(db, 'classes', classId));
    });
  }

  // =========================================================================
  // Batches
  // =========================================================================
  async listBatches(
    actor: AuthPrincipal | null,
    filter?: { classId?: string; searchQuery?: string }
  ): Promise<BatchRecord[]> {
    this.ensureAnySignedIn(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'batches', async () => {
      const snap = await getDocs(collection(db, 'batches'));
      let list = snap.docs.map((d) => d.data() as BatchRecord);
      if (filter?.classId) {
        list = list.filter((b) => b.classId === filter.classId);
      }
      const q = filter?.searchQuery?.trim().toLowerCase();
      if (q) {
        list = list.filter(
          (b) => b.name.toLowerCase().includes(q) || b.batchId.toLowerCase().includes(q)
        );
      }
      return list.sort((a, b) => a.batchId.localeCompare(b.batchId));
    });
  }

  async createBatch(
    actor: AuthPrincipal | null,
    input: { name: string; classId: string; description?: string; status?: AcademicStatus }
  ): Promise<BatchRecord> {
    this.ensureAdmin(actor);
    const check = validateRequiredText(input.name, 'Batch name', 2);
    if (!check.valid) throw new AcademicServiceError('VALIDATION_ERROR', check.error!, 'name');

    const db = requireFirestoreDb();
    const clsSnap = await getDoc(doc(db, 'classes', input.classId));
    if (!clsSnap.exists()) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Selected class does not exist.');
    }
    if (clsSnap.data().status !== 'active') {
      throw new AcademicServiceError('INACTIVE_REFERENCE', 'Cannot add batch to an inactive class.');
    }

    const existing = await this.listBatches(actor, { classId: input.classId });
    if (existing.some((b) => b.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
      throw new AcademicServiceError(
        'DUPLICATE_RECORD',
        'A batch with this name already exists in this class.'
      );
    }

    const batchId = generateSafeDocId('BAT');
    const record: BatchRecord = {
      id: batchId,
      batchId,
      name: input.name.trim(),
      classId: input.classId,
      description: input.description?.trim() || undefined,
      status: input.status ?? 'active',
      createdAt: new Date().toISOString(),
    };
    await withFirestoreErrorHandling(OperationType.CREATE, `batches/${batchId}`, async () => {
      await setDoc(doc(db, 'batches', batchId), stripUndefinedFields({ ...record }));
    });
    return record;
  }

  async updateBatch(
    actor: AuthPrincipal | null,
    batchId: string,
    updates: { name: string; classId: string; description?: string }
  ): Promise<BatchRecord> {
    this.ensureAdmin(actor);
    const check = validateRequiredText(updates.name, 'Batch name', 2);
    if (!check.valid) throw new AcademicServiceError('VALIDATION_ERROR', check.error!, 'name');

    const db = requireFirestoreDb();
    const ref = doc(db, 'batches', batchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AcademicServiceError('NOT_FOUND', `Batch "${batchId}" not found.`);
    const clsSnap = await getDoc(doc(db, 'classes', updates.classId));
    if (!clsSnap.exists()) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Selected class does not exist.');
    }

    const updated: BatchRecord = {
      ...(snap.data() as BatchRecord),
      name: updates.name.trim(),
      classId: updates.classId,
      description: updates.description?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    await withFirestoreErrorHandling(OperationType.UPDATE, `batches/${batchId}`, async () => {
      await setDoc(ref, stripUndefinedFields({ ...updated }));
    });
    return updated;
  }

  async setBatchStatus(
    actor: AuthPrincipal | null,
    batchId: string,
    status: AcademicStatus
  ): Promise<BatchRecord> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'batches', batchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AcademicServiceError('NOT_FOUND', `Batch "${batchId}" not found.`);
    const updated: BatchRecord = {
      ...(snap.data() as BatchRecord),
      status,
      updatedAt: new Date().toISOString(),
    };
    await withFirestoreErrorHandling(OperationType.UPDATE, `batches/${batchId}`, async () => {
      await setDoc(ref, stripUndefinedFields({ ...updated }));
    });
    return updated;
  }

  async deleteBatch(actor: AuthPrincipal | null, batchId: string): Promise<void> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const [enr, asg] = await Promise.all([
      getDocs(query(collection(db, 'enrolments'), where('batchId', '==', batchId))),
      getDocs(query(collection(db, 'teacherAssignments'), where('batchId', '==', batchId))),
    ]);
    if (!enr.empty || !asg.empty) {
      throw new AcademicServiceError(
        'DELETE_BLOCKED',
        'Cannot delete batch with enrolments or assignments. Deactivate it instead.'
      );
    }
    await withFirestoreErrorHandling(OperationType.DELETE, `batches/${batchId}`, async () => {
      await deleteDoc(doc(db, 'batches', batchId));
    });
  }

  // =========================================================================
  // Subjects
  // =========================================================================
  async listSubjects(
    actor: AuthPrincipal | null,
    filter?: { classId?: string; searchQuery?: string }
  ): Promise<SubjectRecord[]> {
    this.ensureAnySignedIn(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'subjects', async () => {
      const snap = await getDocs(collection(db, 'subjects'));
      let list = snap.docs.map((d) => d.data() as SubjectRecord);
      if (filter?.classId) {
        list = list.filter((s) => s.classIds.includes(filter.classId!));
      }
      const q = filter?.searchQuery?.trim().toLowerCase();
      if (q) {
        list = list.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.code ?? '').toLowerCase().includes(q) ||
            s.subjectId.toLowerCase().includes(q)
        );
      }
      return list.sort((a, b) => a.subjectId.localeCompare(b.subjectId));
    });
  }

  async createSubject(
    actor: AuthPrincipal | null,
    input: { name: string; code?: string; classIds: string[]; status?: AcademicStatus }
  ): Promise<SubjectRecord> {
    this.ensureAdmin(actor);
    const check = validateRequiredText(input.name, 'Subject name', 2);
    if (!check.valid) throw new AcademicServiceError('VALIDATION_ERROR', check.error!, 'name');

    const db = requireFirestoreDb();
    const existing = await this.listSubjects(actor);
    if (existing.some((s) => s.name.trim().toLowerCase() === input.name.trim().toLowerCase())) {
      throw new AcademicServiceError('DUPLICATE_RECORD', 'A subject with this name already exists.');
    }

    const subjectId = generateSafeDocId('SUB');
    const record: SubjectRecord = {
      id: subjectId,
      subjectId,
      name: input.name.trim(),
      code: input.code?.trim() || undefined,
      classIds: Array.from(new Set(input.classIds)),
      status: input.status ?? 'active',
      createdAt: new Date().toISOString(),
    };
    await withFirestoreErrorHandling(OperationType.CREATE, `subjects/${subjectId}`, async () => {
      await setDoc(doc(db, 'subjects', subjectId), stripUndefinedFields({ ...record }));
    });
    return record;
  }

  async updateSubject(
    actor: AuthPrincipal | null,
    subjectId: string,
    updates: { name: string; code?: string; classIds: string[] }
  ): Promise<SubjectRecord> {
    this.ensureAdmin(actor);
    const check = validateRequiredText(updates.name, 'Subject name', 2);
    if (!check.valid) throw new AcademicServiceError('VALIDATION_ERROR', check.error!, 'name');

    const db = requireFirestoreDb();
    const ref = doc(db, 'subjects', subjectId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AcademicServiceError('NOT_FOUND', `Subject "${subjectId}" not found.`);
    }

    const updated: SubjectRecord = {
      ...(snap.data() as SubjectRecord),
      name: updates.name.trim(),
      code: updates.code?.trim() || undefined,
      classIds: Array.from(new Set(updates.classIds)),
      updatedAt: new Date().toISOString(),
    };
    await withFirestoreErrorHandling(OperationType.UPDATE, `subjects/${subjectId}`, async () => {
      await setDoc(ref, stripUndefinedFields({ ...updated }));
    });
    return updated;
  }

  async setSubjectStatus(
    actor: AuthPrincipal | null,
    subjectId: string,
    status: AcademicStatus
  ): Promise<SubjectRecord> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'subjects', subjectId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AcademicServiceError('NOT_FOUND', `Subject "${subjectId}" not found.`);
    }
    const updated: SubjectRecord = {
      ...(snap.data() as SubjectRecord),
      status,
      updatedAt: new Date().toISOString(),
    };
    await withFirestoreErrorHandling(OperationType.UPDATE, `subjects/${subjectId}`, async () => {
      await setDoc(ref, stripUndefinedFields({ ...updated }));
    });
    return updated;
  }

  // =========================================================================
  // Enrolments
  // =========================================================================
  async listEnrolments(actor: AuthPrincipal | null): Promise<StudentEnrolment[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'enrolments', async () => {
      const snap = await getDocs(collection(db, 'enrolments'));
      return snap.docs
        .map((d) => d.data() as StudentEnrolment)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  async listUnenrolledStudents(actor: AuthPrincipal | null): Promise<AccountRecord[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const [usersSnap, enrSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', '==', 'student'))),
      getDocs(query(collection(db, 'enrolments'), where('status', '==', 'active'))),
    ]);
    const enrolledIds = new Set(
      enrSnap.docs.map((d) => String(d.data().studentAccountId || '').toUpperCase())
    );
    return usersSnap.docs
      .map((d) => {
        const u = d.data();
        return {
          id: d.id,
          accountId: String(u.accountId || ''),
          role: 'student' as const,
          name: String(u.name || ''),
          phone: String(u.phone || ''),
          email: typeof u.email === 'string' ? u.email : undefined,
          status: u.status === 'deactivated' ? ('deactivated' as const) : ('active' as const),
          classId: typeof u.classId === 'string' ? u.classId : undefined,
          className: typeof u.className === 'string' ? u.className : undefined,
          batchId: typeof u.batchId === 'string' ? u.batchId : undefined,
          batchName: typeof u.batchName === 'string' ? u.batchName : undefined,
          createdAt: String(u.createdAt || ''),
        };
      })
      .filter((u) => u.status === 'active' && !enrolledIds.has(u.accountId.toUpperCase()));
  }

  async enrolStudent(
    actor: AuthPrincipal | null,
    input: { studentAccountId: string; classId: string; batchId: string; enrolmentDate?: string }
  ): Promise<StudentEnrolment> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const studentMap = await this.getStudentUidMap(db);
    const studentInfo = studentMap.get(input.studentAccountId.trim().toUpperCase());
    if (!studentInfo) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Student account not found.');
    }
    if (studentInfo.status !== 'active') {
      throw new AcademicServiceError('INACTIVE_REFERENCE', 'Cannot enrol a deactivated student.');
    }

    const [clsSnap, batSnap, existingEnrSnap, asgSnap, adminUids] = await Promise.all([
      getDoc(doc(db, 'classes', input.classId)),
      getDoc(doc(db, 'batches', input.batchId)),
      getDocs(
        query(
          collection(db, 'enrolments'),
          where('studentAccountId', '==', input.studentAccountId.trim().toUpperCase()),
          where('status', '==', 'active')
        )
      ),
      getDocs(
        query(
          collection(db, 'teacherAssignments'),
          where('batchId', '==', input.batchId),
          where('status', '==', 'active')
        )
      ),
      getActiveAdminUids(db),
    ]);

    if (!clsSnap.exists() || !batSnap.exists()) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Selected class or batch does not exist.');
    }
    if (clsSnap.data().status !== 'active' || batSnap.data().status !== 'active') {
      throw new AcademicServiceError('INACTIVE_REFERENCE', 'Selected class and batch must be active.');
    }
    if (batSnap.data().classId !== input.classId) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Batch does not belong to selected class.');
    }
    if (!existingEnrSnap.empty) {
      throw new AcademicServiceError('DUPLICATE_RECORD', 'Student already has an active enrolment.');
    }

    const teacherUids = Array.from(
      new Set(asgSnap.docs.map((d) => String(d.data().teacherUid || '')).filter(Boolean))
    ).slice(0, 25);

    const enrolmentId = generateSafeDocId('ENR');
    const nowIso = new Date().toISOString();
    const record: StudentEnrolment & {
      studentUid: string;
      studentName: string;
      adminUids: string[];
      teacherUids: string[];
    } = {
      id: enrolmentId,
      enrolmentId,
      studentAccountId: input.studentAccountId.trim().toUpperCase(),
      studentUid: studentInfo.uid,
      studentName: studentInfo.name,
      classId: input.classId,
      batchId: input.batchId,
      enrolmentDate: input.enrolmentDate?.trim() || nowIso.slice(0, 10),
      status: 'active',
      adminUids,
      teacherUids,
      createdAt: nowIso,
    };

    await withFirestoreErrorHandling(OperationType.CREATE, `enrolments/${enrolmentId}`, async () => {
      await setDoc(doc(db, 'enrolments', enrolmentId), stripUndefinedFields({ ...record }));
      await updateDoc(doc(db, 'users', studentInfo.uid), {
        classId: input.classId,
        className: String(clsSnap.data().name || ''),
        batchId: input.batchId,
        batchName: String(batSnap.data().name || ''),
        updatedAt: nowIso,
      });
    });

    return record;
  }

  async updateEnrolmentClassBatch(
    actor: AuthPrincipal | null,
    enrolmentId: string,
    updates: { classId: string; batchId: string }
  ): Promise<StudentEnrolment> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'enrolments', enrolmentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AcademicServiceError('NOT_FOUND', `Enrolment "${enrolmentId}" not found.`);
    }
    const existing = snap.data() as StudentEnrolment & { studentUid: string };

    const [clsSnap, batSnap, asgSnap] = await Promise.all([
      getDoc(doc(db, 'classes', updates.classId)),
      getDoc(doc(db, 'batches', updates.batchId)),
      getDocs(
        query(
          collection(db, 'teacherAssignments'),
          where('batchId', '==', updates.batchId),
          where('status', '==', 'active')
        )
      ),
    ]);
    if (!clsSnap.exists() || !batSnap.exists() || batSnap.data().classId !== updates.classId) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Invalid class/batch combination.');
    }

    const teacherUids = Array.from(
      new Set(asgSnap.docs.map((d) => String(d.data().teacherUid || '')).filter(Boolean))
    ).slice(0, 25);
    const nowIso = new Date().toISOString();

    await updateDoc(ref, {
      classId: updates.classId,
      batchId: updates.batchId,
      teacherUids,
      updatedAt: nowIso,
    });
    if (existing.studentUid) {
      await updateDoc(doc(db, 'users', existing.studentUid), {
        classId: updates.classId,
        className: String(clsSnap.data().name || ''),
        batchId: updates.batchId,
        batchName: String(batSnap.data().name || ''),
        updatedAt: nowIso,
      }).catch(() => undefined);
    }

    return { ...existing, classId: updates.classId, batchId: updates.batchId, updatedAt: nowIso };
  }

  async setEnrolmentStatus(
    actor: AuthPrincipal | null,
    enrolmentId: string,
    status: AcademicStatus
  ): Promise<StudentEnrolment> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'enrolments', enrolmentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AcademicServiceError('NOT_FOUND', `Enrolment "${enrolmentId}" not found.`);
    }
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { status, updatedAt: nowIso });
    return { ...(snap.data() as StudentEnrolment), status, updatedAt: nowIso };
  }

  // =========================================================================
  // Teacher Assignments
  // =========================================================================
  async listTeacherAssignments(actor: AuthPrincipal | null): Promise<TeacherAssignment[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'teacherAssignments', async () => {
      const snap = await getDocs(collection(db, 'teacherAssignments'));
      return snap.docs
        .map((d) => d.data() as TeacherAssignment)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }

  async createTeacherAssignment(
    actor: AuthPrincipal | null,
    input: { teacherAccountId: string; subjectId: string; classId: string; batchId: string }
  ): Promise<TeacherAssignment> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const teacherMap = await this.getTeacherUidMap(db);
    const teacherUid = teacherMap.get(input.teacherAccountId.trim().toUpperCase());
    if (!teacherUid) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Teacher account not found.');
    }

    const [clsSnap, batSnap, subSnap, existingSnap, adminUids] = await Promise.all([
      getDoc(doc(db, 'classes', input.classId)),
      getDoc(doc(db, 'batches', input.batchId)),
      getDoc(doc(db, 'subjects', input.subjectId)),
      getDocs(
        query(
          collection(db, 'teacherAssignments'),
          where('teacherAccountId', '==', input.teacherAccountId.trim().toUpperCase()),
          where('batchId', '==', input.batchId),
          where('subjectId', '==', input.subjectId)
        )
      ),
      getActiveAdminUids(db),
    ]);

    if (!clsSnap.exists() || !batSnap.exists() || !subSnap.exists()) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Class, batch, or subject not found.');
    }
    if (
      existingSnap.docs.some(
        (d) => d.data().classId === input.classId && d.data().status === 'active'
      )
    ) {
      throw new AcademicServiceError('DUPLICATE_RECORD', 'Teacher assignment already exists.');
    }

    const assignmentId = generateSafeDocId('ASG');
    const nowIso = new Date().toISOString();
    const record: TeacherAssignment & { teacherUid: string; adminUids: string[] } = {
      id: assignmentId,
      assignmentId,
      teacherAccountId: input.teacherAccountId.trim().toUpperCase(),
      teacherUid,
      subjectId: input.subjectId,
      classId: input.classId,
      batchId: input.batchId,
      status: 'active',
      adminUids,
      createdAt: nowIso,
    };

    await withFirestoreErrorHandling(
      OperationType.CREATE,
      `teacherAssignments/${assignmentId}`,
      async () => {
        await setDoc(
          doc(db, 'teacherAssignments', assignmentId),
          stripUndefinedFields({ ...record })
        );
        await this.syncBatchEnrolmentTeacherUids(db, input.batchId);
      }
    );

    return record;
  }

  async updateTeacherAssignment(
    actor: AuthPrincipal | null,
    assignmentId: string,
    updates: { teacherAccountId: string; subjectId: string; classId: string; batchId: string }
  ): Promise<TeacherAssignment> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'teacherAssignments', assignmentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AcademicServiceError('NOT_FOUND', `Assignment "${assignmentId}" not found.`);
    }
    const prevBatchId = String(snap.data().batchId || '');
    const teacherMap = await this.getTeacherUidMap(db);
    const teacherUid = teacherMap.get(updates.teacherAccountId.trim().toUpperCase());
    if (!teacherUid) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Teacher account not found.');
    }
    const nowIso = new Date().toISOString();
    await updateDoc(ref, {
      teacherAccountId: updates.teacherAccountId.trim().toUpperCase(),
      teacherUid,
      subjectId: updates.subjectId,
      classId: updates.classId,
      batchId: updates.batchId,
      updatedAt: nowIso,
    });
    if (prevBatchId) await this.syncBatchEnrolmentTeacherUids(db, prevBatchId);
    await this.syncBatchEnrolmentTeacherUids(db, updates.batchId);

    return {
      ...(snap.data() as TeacherAssignment),
      ...updates,
      teacherAccountId: updates.teacherAccountId.trim().toUpperCase(),
      updatedAt: nowIso,
    };
  }

  async setTeacherAssignmentStatus(
    actor: AuthPrincipal | null,
    assignmentId: string,
    status: AcademicStatus
  ): Promise<TeacherAssignment> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'teacherAssignments', assignmentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AcademicServiceError('NOT_FOUND', `Assignment "${assignmentId}" not found.`);
    }
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { status, updatedAt: nowIso });
    await this.syncBatchEnrolmentTeacherUids(db, String(snap.data().batchId));
    return { ...(snap.data() as TeacherAssignment), status, updatedAt: nowIso };
  }

  // =========================================================================
  // Timetable
  // =========================================================================
  async listTimetableEntries(
    actor: AuthPrincipal | null,
    filter?: { classId?: string; batchId?: string; teacherAccountId?: string; subjectId?: string }
  ): Promise<TimetableEntry[]> {
    this.ensureAnySignedIn(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'timetableEntries', async () => {
      const snap = await getDocs(collection(db, 'timetableEntries'));
      let list = snap.docs.map((d) => d.data() as TimetableEntry);
      if (filter?.classId) list = list.filter((e) => e.classId === filter.classId);
      if (filter?.batchId) list = list.filter((e) => e.batchId === filter.batchId);
      if (filter?.teacherAccountId) {
        list = list.filter(
          (e) => e.teacherAccountId.toUpperCase() === filter.teacherAccountId!.toUpperCase()
        );
      }
      if (filter?.subjectId) list = list.filter((e) => e.subjectId === filter.subjectId);
      return list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    });
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
    this.ensureAdmin(actor);
    const rangeCheck = validateTimeRange(input.startTime, input.endTime);
    if (!rangeCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', rangeCheck.error!, 'startTime');
    }

    const db = requireFirestoreDb();
    const teacherMap = await this.getTeacherUidMap(db);
    const teacherUid = teacherMap.get(input.teacherAccountId.trim().toUpperCase());
    if (!teacherUid) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Teacher account not found.');
    }

    const existing = await this.listTimetableEntries(actor);
    const conflict = existing.find(
      (e) =>
        e.status === 'active' &&
        e.dayOfWeek === input.dayOfWeek &&
        timesOverlap(e.startTime, e.endTime, input.startTime.trim(), input.endTime.trim()) &&
        (e.batchId === input.batchId ||
          e.teacherAccountId.toUpperCase() === input.teacherAccountId.trim().toUpperCase())
    );
    if (conflict) {
      throw new AcademicServiceError(
        'TIMETABLE_CONFLICT',
        `Timetable conflict detected on ${input.dayOfWeek} between ${conflict.startTime} and ${conflict.endTime}.`
      );
    }

    const entryId = generateSafeDocId('TT');
    const record: TimetableEntry & { teacherUid: string } = {
      id: entryId,
      entryId,
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherAccountId: input.teacherAccountId.trim().toUpperCase(),
      teacherUid,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime.trim(),
      endTime: input.endTime.trim(),
      room: input.room?.trim() || undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    await withFirestoreErrorHandling(
      OperationType.CREATE,
      `timetableEntries/${entryId}`,
      async () => {
        await setDoc(doc(db, 'timetableEntries', entryId), stripUndefinedFields({ ...record }));
      }
    );
    return record;
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
    this.ensureAdmin(actor);
    const rangeCheck = validateTimeRange(updates.startTime, updates.endTime);
    if (!rangeCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', rangeCheck.error!, 'startTime');
    }

    const db = requireFirestoreDb();
    const ref = doc(db, 'timetableEntries', entryId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AcademicServiceError('NOT_FOUND', `Entry "${entryId}" not found.`);

    const teacherMap = await this.getTeacherUidMap(db);
    const teacherUid = teacherMap.get(updates.teacherAccountId.trim().toUpperCase());
    if (!teacherUid) {
      throw new AcademicServiceError('INVALID_REFERENCE', 'Teacher account not found.');
    }

    const existing = await this.listTimetableEntries(actor);
    const conflict = existing.find(
      (e) =>
        e.entryId !== entryId &&
        e.status === 'active' &&
        e.dayOfWeek === updates.dayOfWeek &&
        timesOverlap(e.startTime, e.endTime, updates.startTime.trim(), updates.endTime.trim()) &&
        (e.batchId === updates.batchId ||
          e.teacherAccountId.toUpperCase() === updates.teacherAccountId.trim().toUpperCase())
    );
    if (conflict) {
      throw new AcademicServiceError(
        'TIMETABLE_CONFLICT',
        `Timetable conflict detected on ${updates.dayOfWeek} (${conflict.startTime}–${conflict.endTime}).`
      );
    }

    const updated: TimetableEntry & { teacherUid: string } = {
      ...(snap.data() as TimetableEntry),
      ...updates,
      teacherAccountId: updates.teacherAccountId.trim().toUpperCase(),
      teacherUid,
      room: updates.room?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(ref, stripUndefinedFields({ ...updated }));
    return updated;
  }

  async setTimetableEntryStatus(
    actor: AuthPrincipal | null,
    entryId: string,
    status: TimetableEntryStatus
  ): Promise<TimetableEntry> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'timetableEntries', entryId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AcademicServiceError('NOT_FOUND', `Entry "${entryId}" not found.`);
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { status, updatedAt: nowIso });
    return { ...(snap.data() as TimetableEntry), status, updatedAt: nowIso };
  }

  // =========================================================================
  // Announcements
  // =========================================================================
  async listAdminAnnouncements(actor: AuthPrincipal | null): Promise<AnnouncementRecord[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'announcements', async () => {
      const snap = await getDocs(collection(db, 'announcements'));
      return snap.docs
        .map((d) => d.data() as AnnouncementRecord)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
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
    const admin = this.ensureAdmin(actor);
    const titleCheck = validateRequiredText(input.title, 'Announcement title', 2);
    if (!titleCheck.valid) throw new AcademicServiceError('VALIDATION_ERROR', titleCheck.error!, 'title');
    const contentCheck = validateRequiredText(input.content, 'Announcement content', 2);
    if (!contentCheck.valid) {
      throw new AcademicServiceError('VALIDATION_ERROR', contentCheck.error!, 'content');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const announcementId = generateSafeDocId('ANN');
    const nowIso = new Date().toISOString();
    const publicationStatus = input.publishImmediately ? 'published' : 'draft';
    const record: AnnouncementRecord & { adminUids: string[] } = {
      id: announcementId,
      announcementId,
      title: input.title.trim(),
      content: input.content.trim(),
      audience: input.audience,
      targetClassId: input.targetClassId || undefined,
      targetBatchId: input.targetBatchId || undefined,
      publicationStatus,
      publishedByAdminId: admin.loginId,
      adminUids,
      createdAt: nowIso,
      ...(publicationStatus === 'published' ? { publishedAt: nowIso } : {}),
    };

    await withFirestoreErrorHandling(
      OperationType.CREATE,
      `announcements/${announcementId}`,
      async () => {
        await setDoc(doc(db, 'announcements', announcementId), stripUndefinedFields({ ...record }));
      }
    );
    return record;
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
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'announcements', announcementId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AcademicServiceError('NOT_FOUND', `Announcement "${announcementId}" not found.`);
    }
    const existing = snap.data() as AnnouncementRecord;
    const nowIso = new Date().toISOString();
    const next: AnnouncementRecord = {
      ...existing,
      title: updates.title.trim(),
      content: updates.content.trim(),
      audience: updates.audience,
      targetClassId: updates.targetClassId || undefined,
      targetBatchId: updates.targetBatchId || undefined,
      updatedAt: nowIso,
    };
    await setDoc(ref, stripUndefinedFields({ ...next }));
    return next;
  }

  async publishAnnouncement(
    actor: AuthPrincipal | null,
    announcementId: string
  ): Promise<AnnouncementRecord> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'announcements', announcementId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AcademicServiceError('NOT_FOUND', 'Announcement not found.');
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { publicationStatus: 'published', publishedAt: nowIso, updatedAt: nowIso });
    return {
      ...(snap.data() as AnnouncementRecord),
      publicationStatus: 'published',
      publishedAt: nowIso,
      updatedAt: nowIso,
    };
  }

  async unpublishAnnouncement(
    actor: AuthPrincipal | null,
    announcementId: string
  ): Promise<AnnouncementRecord> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'announcements', announcementId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AcademicServiceError('NOT_FOUND', 'Announcement not found.');
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { publicationStatus: 'unpublished', updatedAt: nowIso });
    return {
      ...(snap.data() as AnnouncementRecord),
      publicationStatus: 'unpublished',
      updatedAt: nowIso,
    };
  }

  async archiveAnnouncement(
    actor: AuthPrincipal | null,
    announcementId: string
  ): Promise<AnnouncementRecord> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'announcements', announcementId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AcademicServiceError('NOT_FOUND', 'Announcement not found.');
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { publicationStatus: 'archived', updatedAt: nowIso });
    return {
      ...(snap.data() as AnnouncementRecord),
      publicationStatus: 'archived',
      updatedAt: nowIso,
    };
  }

  // =========================================================================
  // Scoped Teacher & Student Workspaces
  // =========================================================================
  async getMyTeacherWorkspace(actor: AuthPrincipal | null): Promise<TeacherWorkspaceData> {
    const teacher = requireVerifiedActor(actor, ['teacher']);
    const db = requireFirestoreDb();

    return withFirestoreErrorHandling(
      OperationType.LIST,
      'teacherWorkspace',
      async () => {
        const [asgSnap, clsSnap, batSnap, subSnap, ttSnap, annSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'teacherAssignments'),
              where('teacherUid', '==', teacher.uid),
              where('status', '==', 'active')
            )
          ),
          getDocs(collection(db, 'classes')),
          getDocs(collection(db, 'batches')),
          getDocs(collection(db, 'subjects')),
          getDocs(collection(db, 'timetableEntries')),
          getDocs(
            query(
              collection(db, 'announcements'),
              where('publicationStatus', '==', 'published')
            )
          ),
        ]);

        const classes = new Map(clsSnap.docs.map((d) => [d.id, d.data() as ClassRecord]));
        const batches = new Map(batSnap.docs.map((d) => [d.id, d.data() as BatchRecord]));
        const subjects = new Map(subSnap.docs.map((d) => [d.id, d.data() as SubjectRecord]));

        const assignments = asgSnap.docs
          .map((d) => d.data() as TeacherAssignment)
          .filter(
            (a) =>
              classes.has(a.classId) &&
              batches.has(a.batchId) &&
              subjects.has(a.subjectId)
          )
          .map((a) => ({
            assignment: a,
            classRecord: classes.get(a.classId)!,
            batchRecord: batches.get(a.batchId)!,
            subjectRecord: subjects.get(a.subjectId)!,
          }));

        const timetable = ttSnap.docs
          .map((d) => d.data() as TimetableEntry)
          .filter(
            (t) =>
              t.teacherAccountId.toUpperCase() === teacher.loginId.toUpperCase() &&
              t.status === 'active'
          )
          .map((entry) => ({
            entry,
            className: classes.get(entry.classId)?.name ?? entry.classId,
            batchName: batches.get(entry.batchId)?.name ?? entry.batchId,
            subjectName: subjects.get(entry.subjectId)?.name ?? entry.subjectId,
          }));

        const assignedClassIds = new Set(assignments.map((a) => a.assignment.classId));
        const assignedBatchIds = new Set(assignments.map((a) => a.assignment.batchId));

        const announcements = annSnap.docs
          .map((d) => d.data() as AnnouncementRecord)
          .filter(
            (ann) =>
              ann.audience === 'all' ||
              ann.audience === 'teachers' ||
              (ann.audience === 'class' && ann.targetClassId && assignedClassIds.has(ann.targetClassId)) ||
              (ann.audience === 'batch' && ann.targetBatchId && assignedBatchIds.has(ann.targetBatchId))
          )
          .sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));

        return { assignments, timetable, announcements };
      }
    );
  }

  async getMyStudentWorkspace(actor: AuthPrincipal | null): Promise<StudentWorkspaceData> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();

    return withFirestoreErrorHandling(
      OperationType.LIST,
      'studentWorkspace',
      async () => {
        const [enrSnap, clsSnap, batSnap, subSnap, ttSnap, annSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'enrolments'),
              where('studentUid', '==', student.uid),
              where('status', '==', 'active')
            )
          ),
          getDocs(collection(db, 'classes')),
          getDocs(collection(db, 'batches')),
          getDocs(collection(db, 'subjects')),
          getDocs(collection(db, 'timetableEntries')),
          getDocs(
            query(
              collection(db, 'announcements'),
              where('publicationStatus', '==', 'published')
            )
          ),
        ]);

        const enrolment = enrSnap.empty ? null : (enrSnap.docs[0].data() as StudentEnrolment);
        const classRecord = enrolment
          ? ((clsSnap.docs.find((d) => d.id === enrolment.classId)?.data() as ClassRecord) ?? null)
          : null;
        const batchRecord = enrolment
          ? ((batSnap.docs.find((d) => d.id === enrolment.batchId)?.data() as BatchRecord) ?? null)
          : null;

        const subjectMap = new Map(subSnap.docs.map((d) => [d.id, d.data() as SubjectRecord]));
        const subjects = enrolment
          ? Array.from(subjectMap.values()).filter(
              (s) => s.status === 'active' && s.classIds.includes(enrolment.classId)
            )
          : [];

        const timetable = enrolment
          ? ttSnap.docs
              .map((d) => d.data() as TimetableEntry)
              .filter(
                (t) =>
                  t.classId === enrolment.classId &&
                  t.batchId === enrolment.batchId &&
                  t.status === 'active'
              )
              .map((entry) => ({
                entry,
                subjectName: subjectMap.get(entry.subjectId)?.name ?? entry.subjectId,
                teacherName: entry.teacherAccountId,
              }))
          : [];

        const announcements = annSnap.docs
          .map((d) => d.data() as AnnouncementRecord)
          .filter(
            (ann) =>
              ann.audience === 'all' ||
              ann.audience === 'students' ||
              (enrolment && ann.audience === 'class' && ann.targetClassId === enrolment.classId) ||
              (enrolment && ann.audience === 'batch' && ann.targetBatchId === enrolment.batchId)
          )
          .sort((a, b) => (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt));

        return {
          enrolment,
          classRecord,
          batchRecord,
          subjects,
          timetable,
          announcements,
        };
      }
    );
  }
}

export const firebaseAcademicService = new FirebaseAcademicService();
