import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType } from '../../lib/firebase/firestore';
import {
  AssessmentServiceError,
  type AdminAssessmentFilter,
  type BulkMarksEntryInput,
  type CorrectMarksInput,
  type CreateExaminationInput,
  type CreateHomeworkInput,
  type CreateObjectiveTestInput,
  type IAssessmentOverviewService,
  type IExaminationMarksService,
  type IExaminationService,
  type IHomeworkService,
  type IHomeworkSubmissionService,
  type IObjectiveTestService,
  type ITestAttemptService,
  type ITestEvaluationService,
  type ReviewHomeworkSubmissionInput,
  type StudentResultFilter,
  type TeacherScopeResources,
  type UpdateExaminationInput,
  type UpdateHomeworkInput,
  type UpdateObjectiveTestInput,
} from '../contracts/assessmentService';
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
  HomeworkComputedIndicator,
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
  StudentUnifiedResultItem,
  SubjectPerformanceSummary,
  SubjectRecord,
  TeacherAssignment,
  TeacherEligibleStudent,
  TeacherHomeworkSummaryItem,
  TeacherObjectiveTestSummary,
  TeacherResultsWorkspaceData,
  TeacherSubmissionViewItem,
  TestAttempt,
} from '../../types';
import {
  generateSafeDocId,
  getActiveAdminUids,
  requireFirestoreDb,
  requireVerifiedActor,
  stripUndefinedFields,
  withFirestoreErrorHandling,
} from './helpers';

function computeHomeworkIndicator(hw: HomeworkRecord, nowMs = Date.now()): HomeworkComputedIndicator {
  if (hw.status === 'draft') return 'draft';
  if (hw.status === 'archived') return 'archived';
  if (hw.status === 'closed') return 'closed';
  const dueMs = Date.parse(hw.dueAt);
  if (!Number.isNaN(dueMs)) {
    if (nowMs > dueMs) return 'overdue';
    if (dueMs - nowMs <= 24 * 60 * 60 * 1000) return 'closing_soon';
  }
  return 'published';
}

function computeEffectiveTestStatus(test: ObjectiveTest, nowMs = Date.now()): ObjectiveTestStatus {
  if (test.status === 'draft' || test.status === 'archived') return test.status;
  const startMs = Date.parse(test.startsAt);
  const endMs = Date.parse(test.endsAt);
  if (!Number.isNaN(endMs) && nowMs > endMs) return 'completed';
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && nowMs >= startMs && nowMs <= endMs) {
    return 'active';
  }
  return test.status;
}

function isTestResultsReleased(test: ObjectiveTest, nowMs = Date.now()): boolean {
  if (test.manualResultsReleased) return true;
  if (test.resultReleaseMode === 'auto_after_submission') return true;
  if (test.resultReleaseMode === 'scheduled_after_end') {
    const releaseAt = Date.parse(test.scheduledReleaseAt || test.endsAt);
    return !Number.isNaN(releaseAt) && nowMs >= releaseAt;
  }
  return false;
}

function stripSafeSubmission(s: HomeworkSubmission): StudentSafeHomeworkSubmission {
  const { privateTeacherNote: _hidden, ...safe } = s;
  return safe;
}

function toSafeAttempt(
  attempt: TestAttempt,
  resultsVisible: boolean
): StudentSafeTestAttempt {
  return {
    id: attempt.id,
    testId: attempt.testId,
    studentId: attempt.studentId,
    attemptNumber: attempt.attemptNumber,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    submittedAt: attempt.submittedAt,
    answers: attempt.answers,
    status: attempt.status,
    totalMarks: attempt.totalMarks,
    resultsVisible,
    ...(resultsVisible
      ? {
          marksObtained: attempt.marksObtained,
          percentage: attempt.percentage,
          evaluatedAt: attempt.evaluatedAt,
          resultReleasedAt: attempt.resultReleasedAt,
        }
      : {}),
  };
}

export class FirebaseHomeworkService implements IHomeworkService {
  private ensureTeacherOrAdmin(actor: AuthPrincipal | null): AuthPrincipal {
    try {
      return requireVerifiedActor(actor, ['teacher', 'admin']);
    } catch (error) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        error instanceof Error ? error.message : 'Teacher authorization required.'
      );
    }
  }

  async getTeacherScopeResources(actor: AuthPrincipal | null): Promise<TeacherScopeResources> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'teacherScope', async () => {
      const [asgSnap, clsSnap, batSnap, subSnap] = await Promise.all([
        teacher.role === 'admin'
          ? getDocs(query(collection(db, 'teacherAssignments'), where('status', '==', 'active')))
          : getDocs(
              query(
                collection(db, 'teacherAssignments'),
                where('teacherUid', '==', teacher.uid),
                where('status', '==', 'active')
              )
            ),
        getDocs(query(collection(db, 'classes'), where('status', 'in', ['active', 'inactive']))),
        getDocs(query(collection(db, 'batches'), where('status', 'in', ['active', 'inactive']))),
        getDocs(query(collection(db, 'subjects'), where('status', 'in', ['active', 'inactive']))),
      ]);
      const assignments = asgSnap.docs.map((d) => d.data() as TeacherAssignment);
      const clsIds = new Set(assignments.map((a) => a.classId));
      const batIds = new Set(assignments.map((a) => a.batchId));
      const subIds = new Set(assignments.map((a) => a.subjectId));

      return {
        classes: clsSnap.docs
          .map((d) => d.data() as ClassRecord)
          .filter((c) => c.status === 'active' && (teacher.role === 'admin' || clsIds.has(c.classId))),
        batches: batSnap.docs
          .map((d) => d.data() as BatchRecord)
          .filter((b) => b.status === 'active' && (teacher.role === 'admin' || batIds.has(b.batchId))),
        subjects: subSnap.docs
          .map((d) => d.data() as SubjectRecord)
          .filter((s) => s.status === 'active' && (teacher.role === 'admin' || subIds.has(s.subjectId))),
        assignments,
      };
    });
  }

  async listTeacherHomework(
    actor: AuthPrincipal | null,
    filter?: { search?: string; status?: 'all' | HomeworkStatus; classId?: string; subjectId?: string }
  ): Promise<TeacherHomeworkSummaryItem[]> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'homework', async () => {
      const [hwSnap, clsSnap, batSnap, subSnap, enrSnap, submsSnap] = await Promise.all([
        teacher.role === 'admin'
          ? getDocs(collection(db, 'homework'))
          : getDocs(query(collection(db, 'homework'), where('teacherUid', '==', teacher.uid))),
        getDocs(query(collection(db, 'classes'), where('status', 'in', ['active', 'inactive']))),
        getDocs(query(collection(db, 'batches'), where('status', 'in', ['active', 'inactive']))),
        getDocs(query(collection(db, 'subjects'), where('status', 'in', ['active', 'inactive']))),
        teacher.role === 'admin'
          ? getDocs(query(collection(db, 'enrolments'), where('status', '==', 'active')))
          : getDocs(
              query(collection(db, 'enrolments'), where('teacherUids', 'array-contains', teacher.uid))
            ),
        teacher.role === 'admin'
          ? getDocs(collection(db, 'homeworkSubmissions'))
          : getDocs(
              query(collection(db, 'homeworkSubmissions'), where('teacherUid', '==', teacher.uid))
            ),
      ]);

      const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name as string]));
      const batMap = new Map(batSnap.docs.map((d) => [d.id, d.data().name as string]));
      const subMap = new Map(subSnap.docs.map((d) => [d.id, d.data().name as string]));
      const enrolments = enrSnap.docs.map((d) => d.data()).filter((e) => e.status === 'active');
      const submissions = submsSnap.docs.map((d) => d.data() as HomeworkSubmission);

      let items = hwSnap.docs.map((d) => {
        const hw = d.data() as HomeworkRecord;
        const batchEnrolled = enrolments.filter(
          (e) => e.classId === hw.classId && e.batchId === hw.batchId
        ).length;
        const hwSubs = submissions.filter((s) => s.homeworkId === hw.id);
        const reviewedCount = hwSubs.filter((s) => s.status === 'reviewed').length;
        return {
          homework: hw,
          className: clsMap.get(hw.classId) ?? hw.classId,
          batchName: batMap.get(hw.batchId) ?? hw.batchId,
          subjectName: subMap.get(hw.subjectId) ?? hw.subjectId,
          indicator: computeHomeworkIndicator(hw),
          totalAssignedStudents: batchEnrolled,
          submittedCount: hwSubs.length,
          reviewedCount,
          pendingCount: Math.max(0, batchEnrolled - hwSubs.length),
        };
      });

      if (filter?.status && filter.status !== 'all') {
        items = items.filter((i) => i.homework.status === filter.status);
      }
      if (filter?.classId && filter.classId !== 'all') {
        items = items.filter((i) => i.homework.classId === filter.classId);
      }
      if (filter?.subjectId && filter.subjectId !== 'all') {
        items = items.filter((i) => i.homework.subjectId === filter.subjectId);
      }
      const q = filter?.search?.trim().toLowerCase();
      if (q) {
        items = items.filter(
          (i) =>
            i.homework.title.toLowerCase().includes(q) ||
            i.subjectName.toLowerCase().includes(q)
        );
      }
      return items.sort((a, b) => b.homework.createdAt.localeCompare(a.homework.createdAt));
    });
  }

  async createHomework(actor: AuthPrincipal | null, input: CreateHomeworkInput): Promise<HomeworkRecord> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    if (!input.title.trim() || !input.instructions.trim()) {
      throw new AssessmentServiceError('VALIDATION_ERROR', 'Title and instructions are required.');
    }
    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const id = generateSafeDocId('HW');
    const nowIso = new Date().toISOString();
    const status: HomeworkStatus = input.publishImmediately ? 'published' : 'draft';

    const record: HomeworkRecord & { teacherUid: string; adminUids: string[] } = {
      id,
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: teacher.loginId,
      teacherUid: teacher.uid,
      assignedAt: nowIso,
      dueAt: input.dueAt,
      maximumMarks: input.maximumMarks,
      status,
      createdAt: nowIso,
      updatedAt: nowIso,
      adminUids,
    };

    await withFirestoreErrorHandling(OperationType.CREATE, `homework/${id}`, async () => {
      await setDoc(doc(db, 'homework', id), stripUndefinedFields({ ...record }));
      if (status === 'published') {
        await this.notifyBatchStudents(db, record, adminUids, teacher.role);
      }
    });
    return record;
  }

  private async notifyBatchStudents(
    db: ReturnType<typeof requireFirestoreDb>,
    hw: HomeworkRecord & { teacherUid?: string },
    adminUids: string[],
    actorRole: AuthPrincipal['role']
  ): Promise<void> {
    const enrSnap = await getDocs(
      actorRole === 'admin'
        ? query(
            collection(db, 'enrolments'),
            where('batchId', '==', hw.batchId),
            where('status', '==', 'active')
          )
        : query(
            collection(db, 'enrolments'),
            where('teacherUids', 'array-contains', hw.teacherUid || '')
          )
    );
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    for (const d of enrSnap.docs) {
      const e = d.data();
      if (e.status !== 'active' || e.batchId !== hw.batchId || e.classId !== hw.classId || !e.studentUid) {
        continue;
      }
      const nid = `ANF-${hw.id}-${e.studentAccountId}`;
      batch.set(doc(db, 'notifications', nid), {
        id: nid,
        recipientId: String(e.studentAccountId),
        recipientUid: String(e.studentUid),
        recipientRole: 'student',
        category: 'assessment',
        type: 'homework_published',
        relatedRecordId: hw.id,
        dedupeKey: `homework_published:${hw.id}:${e.studentAccountId}`,
        title: `New Homework: ${hw.title}`,
        message: `Due by ${hw.dueAt.slice(0, 16).replace('T', ' ')}.`,
        adminUids,
        createdAt: nowIso,
      });
    }
    await batch.commit();
  }

  async updateHomework(
    actor: AuthPrincipal | null,
    homeworkId: string,
    input: UpdateHomeworkInput
  ): Promise<HomeworkRecord> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'homework', homeworkId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Homework not found.');
    const existing = snap.data() as HomeworkRecord & { teacherUid: string };
    if (teacher.role === 'teacher' && existing.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'You may edit only your own homework.');
    }
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { updatedAt: nowIso };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.instructions !== undefined) patch.instructions = input.instructions.trim();
    if (input.dueAt !== undefined) patch.dueAt = input.dueAt;
    if (input.maximumMarks !== undefined && input.maximumMarks !== null) {
      patch.maximumMarks = input.maximumMarks;
    }
    await updateDoc(ref, patch);
    return { ...existing, ...patch } as HomeworkRecord;
  }

  async setHomeworkStatus(
    actor: AuthPrincipal | null,
    homeworkId: string,
    status: HomeworkStatus
  ): Promise<HomeworkRecord> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    const db = requireFirestoreDb();
    const ref = doc(db, 'homework', homeworkId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Homework not found.');
    const existing = snap.data() as HomeworkRecord & { teacherUid: string };
    if (teacher.role === 'teacher' && existing.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'You may update only your own homework.');
    }
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { status, updatedAt: nowIso });
    if (status === 'published' && existing.status !== 'published') {
      const adminUids = await getActiveAdminUids(db);
      await this.notifyBatchStudents(db, { ...existing, status }, adminUids, teacher.role);
    }
    return { ...existing, status, updatedAt: nowIso };
  }

  async getTeacherHomeworkRosterAndSubmissions(
    actor: AuthPrincipal | null,
    homeworkId: string
  ): Promise<{
    homework: HomeworkRecord;
    assignedStudents: TeacherEligibleStudent[];
    submissions: TeacherSubmissionViewItem[];
    pendingStudents: TeacherEligibleStudent[];
    auditEntries: HomeworkReviewAudit[];
  }> {
    const teacher = this.ensureTeacherOrAdmin(actor);
    const db = requireFirestoreDb();
    const hwSnap = await getDoc(doc(db, 'homework', homeworkId));
    if (!hwSnap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Homework not found.');
    const homework = hwSnap.data() as HomeworkRecord & { teacherUid: string };
    if (teacher.role === 'teacher' && homework.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const [enrSnap, subSnap, audSnap] = await Promise.all([
      getDocs(
        teacher.role === 'admin'
          ? query(
              collection(db, 'enrolments'),
              where('batchId', '==', homework.batchId),
              where('status', '==', 'active')
            )
          : query(collection(db, 'enrolments'), where('teacherUids', 'array-contains', teacher.uid))
      ),
      getDocs(
        teacher.role === 'admin'
          ? query(collection(db, 'homeworkSubmissions'), where('homeworkId', '==', homeworkId))
          : query(collection(db, 'homeworkSubmissions'), where('teacherUid', '==', teacher.uid))
      ),
      getDocs(
        teacher.role === 'admin'
          ? query(collection(db, 'homeworkAudit'), where('homeworkId', '==', homeworkId))
          : query(collection(db, 'homeworkAudit'), where('teacherUid', '==', teacher.uid))
      ).catch(() => null),
    ]);

    const assignedStudents: TeacherEligibleStudent[] = enrSnap.docs
      .map((d) => d.data())
      .filter(
        (e) =>
          e.status === 'active' &&
          e.batchId === homework.batchId &&
          e.classId === homework.classId
      )
      .map((e) => ({
        studentId: String(e.studentAccountId),
        studentName: String(e.studentName || e.studentAccountId),
        enrolmentId: String(e.enrolmentId || e.id),
      }));

    const nameMap = new Map(assignedStudents.map((s) => [s.studentId, s.studentName]));
    const matchingSubs = subSnap.docs
      .map((d) => d.data() as HomeworkSubmission)
      .filter((s) => s.homeworkId === homeworkId);

    const submissions: TeacherSubmissionViewItem[] = await Promise.all(
      matchingSubs.map(async (sub) => {
        const privSnap = await getDoc(
          doc(db, 'homeworkSubmissions', sub.id, 'private', 'teacherNote')
        ).catch(() => null);
        const privateTeacherNote = privSnap?.exists()
          ? String(privSnap.data().privateTeacherNote || '')
          : undefined;
        return {
          submission: { ...sub, privateTeacherNote },
          studentName: nameMap.get(sub.studentId) ?? sub.studentId,
          homeworkTitle: homework.title,
          maximumMarks: homework.maximumMarks,
        };
      })
    );

    const submittedIds = new Set(submissions.map((s) => s.submission.studentId));
    const pendingStudents = assignedStudents.filter((s) => !submittedIds.has(s.studentId));
    const auditEntries = (audSnap?.docs ?? [])
      .map((d) => d.data() as HomeworkReviewAudit)
      .filter((a) => a.homeworkId === homeworkId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return { homework, assignedStudents, submissions, pendingStudents, auditEntries };
  }
}

export class FirebaseHomeworkSubmissionService implements IHomeworkSubmissionService {
  async listStudentHomework(actor: AuthPrincipal | null): Promise<StudentHomeworkItem[]> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'homework', async () => {
      const enrSnap = await getDocs(
        query(
          collection(db, 'enrolments'),
          where('studentUid', '==', student.uid),
          where('status', '==', 'active')
        )
      );
      if (enrSnap.empty) return [];
      const enr = enrSnap.docs[0].data();

      const [hwSnap, subSnap, clsSnap, batSnap, subListSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'homework'),
            where('batchId', '==', enr.batchId),
            where('status', '==', 'published')
          )
        ),
        getDocs(query(collection(db, 'homeworkSubmissions'), where('studentUid', '==', student.uid))),
        getDocs(query(collection(db, 'classes'), where('status', 'in', ['active', 'inactive']))),
        getDocs(query(collection(db, 'batches'), where('status', 'in', ['active', 'inactive']))),
        getDocs(query(collection(db, 'subjects'), where('status', 'in', ['active', 'inactive']))),
      ]);

      const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name as string]));
      const batMap = new Map(batSnap.docs.map((d) => [d.id, d.data().name as string]));
      const subMap = new Map(subListSnap.docs.map((d) => [d.id, d.data().name as string]));
      const mySubs = new Map(
        subSnap.docs.map((d) => {
          const s = d.data() as HomeworkSubmission;
          return [s.homeworkId, stripSafeSubmission(s)];
        })
      );

      return hwSnap.docs
        .map((d) => d.data() as HomeworkRecord)
        .filter((hw) => hw.classId === enr.classId)
        .map((homework) => {
          const submission = mySubs.get(homework.id) ?? null;
          const effectiveStatus = submission?.status ?? 'assigned';
          const canSubmitOrResubmit =
            homework.status === 'published' &&
            (!submission || submission.status === 'returned_for_correction');
          return {
            homework,
            className: clsMap.get(homework.classId) ?? homework.classId,
            batchName: batMap.get(homework.batchId) ?? homework.batchId,
            subjectName: subMap.get(homework.subjectId) ?? homework.subjectId,
            teacherName: homework.teacherId,
            indicator: computeHomeworkIndicator(homework),
            submission,
            effectiveStatus,
            canSubmitOrResubmit,
          };
        })
        .sort((a, b) => a.homework.dueAt.localeCompare(b.homework.dueAt));
    });
  }

  async submitStudentHomework(
    actor: AuthPrincipal | null,
    homeworkId: string,
    responseText: string
  ): Promise<StudentSafeHomeworkSubmission> {
    const student = requireVerifiedActor(actor, ['student']);
    const text = responseText.trim();
    if (text.length < 2) {
      throw new AssessmentServiceError('VALIDATION_ERROR', 'Please enter your homework response.');
    }

    const db = requireFirestoreDb();
    const hwSnap = await getDoc(doc(db, 'homework', homeworkId));
    if (!hwSnap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Homework not found.');
    const hw = hwSnap.data() as HomeworkRecord & { teacherUid: string; adminUids: string[] };
    if (hw.status !== 'published') {
      throw new AssessmentServiceError('REVISION_NOT_ALLOWED', 'Homework is not open for submission.');
    }

    const existingSnap = await getDocs(
      query(
        collection(db, 'homeworkSubmissions'),
        where('studentUid', '==', student.uid),
        where('homeworkId', '==', homeworkId)
      )
    );

    const nowIso = new Date().toISOString();
    const isLate = Date.now() > Date.parse(hw.dueAt);
    const nextStatus = isLate ? 'late_submitted' : 'submitted';

    if (existingSnap.empty) {
      const subId = generateSafeDocId('HSUB');
      const submission: StudentSafeHomeworkSubmission & {
        studentUid: string;
        teacherUid: string;
        adminUids: string[];
      } = {
        id: subId,
        homeworkId,
        studentId: student.loginId,
        studentUid: student.uid,
        teacherUid: hw.teacherUid,
        responseText: text,
        submittedAt: nowIso,
        status: nextStatus,
        revisionNumber: 1,
        revisionHistory: [
          {
            revisionNumber: 1,
            responseText: text,
            submittedAt: nowIso,
            isLate,
          },
        ],
        adminUids: hw.adminUids,
      };
      await setDoc(doc(db, 'homeworkSubmissions', subId), stripUndefinedFields({ ...submission }));
      return stripSafeSubmission(submission);
    }

    const docSnap = existingSnap.docs[0];
    const current = docSnap.data() as HomeworkSubmission;
    if (current.status !== 'returned_for_correction') {
      throw new AssessmentServiceError(
        'REVISION_NOT_ALLOWED',
        'Resubmission is allowed only when the teacher returns your homework for correction.'
      );
    }
    const nextRev = current.revisionNumber + 1;
    const nextHistory = [
      ...current.revisionHistory,
      {
        revisionNumber: nextRev,
        responseText: text,
        submittedAt: nowIso,
        isLate,
      },
    ];
    await updateDoc(docSnap.ref, {
      responseText: text,
      submittedAt: nowIso,
      status: nextStatus,
      revisionNumber: nextRev,
      revisionHistory: nextHistory,
      reopenedByTeacher: false,
    });
    return stripSafeSubmission({
      ...current,
      responseText: text,
      submittedAt: nowIso,
      status: nextStatus,
      revisionNumber: nextRev,
      revisionHistory: nextHistory,
      reopenedByTeacher: false,
    });
  }

  async reviewHomeworkSubmission(
    actor: AuthPrincipal | null,
    input: ReviewHomeworkSubmissionInput
  ): Promise<HomeworkSubmission> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'homeworkSubmissions', input.submissionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Submission not found.');

    const existing = snap.data() as HomeworkSubmission & {
      studentUid: string;
      teacherUid: string;
      adminUids: string[];
    };
    if (teacher.role === 'teacher' && existing.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'You may review only your own class homework.');
    }

    const nowIso = new Date().toISOString();
    const status =
      input.action === 'returned_for_correction' || input.action === 'reopened'
        ? 'returned_for_correction'
        : 'reviewed';

    const batch = writeBatch(db);
    batch.update(
      ref,
      stripUndefinedFields({
        status,
        feedback: input.feedback?.trim() || existing.feedback,
        marksAwarded: input.marksAwarded ?? existing.marksAwarded,
        reviewedBy: teacher.loginId,
        reviewedAt: nowIso,
        reopenedByTeacher: input.action === 'reopened' || input.action === 'returned_for_correction',
      })
    );

    if (input.privateTeacherNote !== undefined) {
      batch.set(
        doc(db, 'homeworkSubmissions', input.submissionId, 'private', 'teacherNote'),
        {
          submissionId: input.submissionId,
          teacherUid: existing.teacherUid,
          privateTeacherNote: input.privateTeacherNote.trim(),
          updatedAt: nowIso,
        }
      );
    }

    const auditId = generateSafeDocId('HAUD');
    batch.set(
      doc(db, 'homeworkAudit', auditId),
      stripUndefinedFields({
        id: auditId,
        homeworkId: existing.homeworkId,
        submissionId: input.submissionId,
        teacherUid: existing.teacherUid,
        actorId: teacher.loginId,
        action: input.action === 'reopened' ? 'reopened' : status,
        reason: input.correctionReason?.trim() || undefined,
        timestamp: nowIso,
        adminUids: existing.adminUids,
      })
    );

    const nid = `ANF-REV-${input.submissionId}-${existing.revisionNumber}`;
    batch.set(doc(db, 'notifications', nid), {
      id: nid,
      recipientId: existing.studentId,
      recipientUid: existing.studentUid,
      recipientRole: 'student',
      category: 'assessment',
      type: status === 'reviewed' ? 'homework_reviewed' : 'homework_returned',
      relatedRecordId: existing.homeworkId,
      dedupeKey: `${status}:${input.submissionId}:${existing.revisionNumber}`,
      title: status === 'reviewed' ? 'Homework Reviewed' : 'Homework Returned for Revision',
      message: input.feedback?.trim() || 'Your teacher updated your homework review status.',
      adminUids: existing.adminUids,
      createdAt: nowIso,
    });

    await batch.commit();
    return {
      ...existing,
      status,
      feedback: input.feedback?.trim() || existing.feedback,
      privateTeacherNote: input.privateTeacherNote,
      marksAwarded: input.marksAwarded ?? existing.marksAwarded,
      reviewedBy: teacher.loginId,
      reviewedAt: nowIso,
    };
  }
}

export class FirebaseObjectiveTestService implements IObjectiveTestService {
  async listTeacherTests(actor: AuthPrincipal | null): Promise<TeacherObjectiveTestSummary[]> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const [testSnap, clsSnap, batSnap, subSnap, attSnap] = await Promise.all([
      teacher.role === 'admin'
        ? getDocs(collection(db, 'objectiveTests'))
        : getDocs(query(collection(db, 'objectiveTests'), where('teacherUid', '==', teacher.uid))),
      getDocs(query(collection(db, 'classes'), where('status', 'in', ['active', 'inactive']))),
      getDocs(query(collection(db, 'batches'), where('status', 'in', ['active', 'inactive']))),
      getDocs(query(collection(db, 'subjects'), where('status', 'in', ['active', 'inactive']))),
      teacher.role === 'admin'
        ? getDocs(collection(db, 'testAttempts'))
        : getDocs(query(collection(db, 'testAttempts'), where('teacherUid', '==', teacher.uid))),
    ]);

    const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name as string]));
    const batMap = new Map(batSnap.docs.map((d) => [d.id, d.data().name as string]));
    const subMap = new Map(subSnap.docs.map((d) => [d.id, d.data().name as string]));
    const attempts = attSnap.docs.map((d) => d.data() as TestAttempt);

    return testSnap.docs
      .map((d) => {
        const test = d.data() as ObjectiveTest;
        const testAttempts = attempts.filter((a) => a.testId === test.id);
        return {
          test,
          className: clsMap.get(test.classId) ?? test.classId,
          batchName: batMap.get(test.batchId) ?? test.batchId,
          subjectName: subMap.get(test.subjectId) ?? test.subjectId,
          effectiveStatus: computeEffectiveTestStatus(test),
          attemptCount: testAttempts.length,
          evaluatedCount: testAttempts.filter((a) => a.status === 'evaluated').length,
        };
      })
      .sort((a, b) => b.test.createdAt.localeCompare(a.test.createdAt));
  }

  async createObjectiveTest(
    actor: AuthPrincipal | null,
    input: CreateObjectiveTestInput
  ): Promise<ObjectiveTest> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    if (!input.title.trim() || input.questions.length === 0) {
      throw new AssessmentServiceError('VALIDATION_ERROR', 'Title and at least one MCQ are required.');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const id = generateSafeDocId('TST');
    const nowIso = new Date().toISOString();

    const fullQuestions: ObjectiveQuestion[] = input.questions.map((q, idx) => {
      const qId = q.id || `Q-${idx + 1}`;
      const options = q.options.map((opt, oIdx) => ({
        id: opt.id || `OPT-${idx + 1}-${oIdx + 1}`,
        text: opt.text.trim(),
      }));
      return {
        id: qId,
        questionText: q.questionText.trim(),
        options,
        correctOptionId: options[q.correctOptionIndex]?.id || options[0].id,
        marks: Number(q.marks) || 1,
        explanation: q.explanation?.trim() || undefined,
      };
    });

    // Public questions omit correctOptionId and explanation so Students cannot scrape answer keys from test doc
    const publicQuestions = fullQuestions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      options: q.options,
      correctOptionId: '',
      marks: q.marks,
    }));

    const totalMarks = fullQuestions.reduce((sum, q) => sum + q.marks, 0);
    const status: ObjectiveTestStatus = input.publishImmediately ? 'published' : 'draft';

    const testDoc: ObjectiveTest & { teacherUid: string; adminUids: string[] } = {
      id,
      title: input.title.trim(),
      instructions: input.instructions.trim() || 'Answer all questions carefully.',
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: teacher.loginId,
      teacherUid: teacher.uid,
      questions: publicQuestions,
      totalMarks,
      durationMinutes: input.durationMinutes,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      maximumAttempts: input.maximumAttempts,
      resultReleaseMode: input.resultReleaseMode,
      scheduledReleaseAt: input.scheduledReleaseAt,
      showCorrectAnswersOnRelease: Boolean(input.showCorrectAnswersOnRelease),
      manualResultsReleased: false,
      status,
      createdAt: nowIso,
      updatedAt: nowIso,
      adminUids,
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'objectiveTests', id), stripUndefinedFields({ ...testDoc }));
    batch.set(doc(db, 'objectiveTests', id, 'private', 'answerKey'), {
      testId: id,
      teacherUid: teacher.uid,
      answers: fullQuestions.map((q) => ({
        questionId: q.id,
        correctOptionId: q.correctOptionId,
        marks: q.marks,
        explanation: q.explanation || '',
      })),
      updatedAt: nowIso,
    });
    await batch.commit();

    return { ...testDoc, questions: fullQuestions };
  }

  async updateObjectiveTest(
    actor: AuthPrincipal | null,
    testId: string,
    input: UpdateObjectiveTestInput
  ): Promise<ObjectiveTest> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'objectiveTests', testId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Test not found.');
    const existing = snap.data() as ObjectiveTest & { teacherUid: string };
    if (teacher.role === 'teacher' && existing.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { updatedAt: nowIso };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.instructions !== undefined) patch.instructions = input.instructions.trim();
    if (input.durationMinutes !== undefined) patch.durationMinutes = input.durationMinutes;
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt;
    if (input.maximumAttempts !== undefined) patch.maximumAttempts = input.maximumAttempts;
    if (input.resultReleaseMode !== undefined) patch.resultReleaseMode = input.resultReleaseMode;
    if (input.showCorrectAnswersOnRelease !== undefined) {
      patch.showCorrectAnswersOnRelease = input.showCorrectAnswersOnRelease;
    }
    await updateDoc(ref, patch);
    return { ...existing, ...patch } as ObjectiveTest;
  }

  async setObjectiveTestStatus(
    actor: AuthPrincipal | null,
    testId: string,
    status: ObjectiveTestStatus
  ): Promise<ObjectiveTest> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'objectiveTests', testId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Test not found.');
    const existing = snap.data() as ObjectiveTest & { teacherUid: string };
    if (teacher.role === 'teacher' && existing.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { status, updatedAt: nowIso });
    return { ...existing, status, updatedAt: nowIso };
  }

  async releaseTestResults(actor: AuthPrincipal | null, testId: string): Promise<ObjectiveTest> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'objectiveTests', testId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Test not found.');
    const existing = snap.data() as ObjectiveTest & { teacherUid: string; adminUids: string[] };
    if (teacher.role === 'teacher' && existing.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const keySnap = await getDoc(doc(db, 'objectiveTests', testId, 'private', 'answerKey'));
    const answerKeyList = (keySnap.data()?.answers ?? []) as Array<{
      questionId: string;
      correctOptionId: string;
      marks: number;
    }>;

    const nowIso = new Date().toISOString();
    const attSnap = await getDocs(
      teacher.role === 'admin'
        ? query(collection(db, 'testAttempts'), where('testId', '==', testId))
        : query(collection(db, 'testAttempts'), where('teacherUid', '==', teacher.uid))
    );
    const batch = writeBatch(db);
    batch.update(ref, { manualResultsReleased: true, updatedAt: nowIso });

    for (const d of attSnap.docs) {
      const att = d.data() as TestAttempt & { studentUid: string };
      if (att.testId !== testId) continue;
      let marksObtained = att.marksObtained;
      let percentage = att.percentage;
      if (att.status === 'submitted' && answerKeyList.length > 0) {
        let sum = 0;
        for (const q of answerKeyList) {
          if (att.answers?.[q.questionId] === q.correctOptionId) sum += Number(q.marks || 0);
        }
        marksObtained = sum;
        percentage = Math.round((sum / Math.max(1, existing.totalMarks)) * 10000) / 100;
      }
      batch.update(d.ref, {
        status: 'evaluated',
        ...(marksObtained !== undefined ? { marksObtained, percentage } : {}),
        evaluatedAt: att.evaluatedAt || nowIso,
        resultReleasedAt: nowIso,
      });

      const nid = `ANF-TREL-${testId}-${att.studentId}`;
      batch.set(doc(db, 'notifications', nid), {
        id: nid,
        recipientId: att.studentId,
        recipientUid: att.studentUid,
        recipientRole: 'student',
        category: 'assessment',
        type: 'test_result_released',
        relatedRecordId: testId,
        dedupeKey: `test_result_released:${testId}:${att.studentId}`,
        title: `Test Results Released: ${existing.title}`,
        message: 'Your objective test results are now available.',
        adminUids: existing.adminUids,
        createdAt: nowIso,
      });
    }
    await batch.commit();

    return { ...existing, manualResultsReleased: true, updatedAt: nowIso };
  }

  async listTestAttemptsForTeacher(
    actor: AuthPrincipal | null,
    testId: string
  ): Promise<Array<TestAttempt & { studentName: string }>> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const [attSnap, enrSnap] = await Promise.all([
      getDocs(
        teacher.role === 'admin'
          ? query(collection(db, 'testAttempts'), where('testId', '==', testId))
          : query(
              collection(db, 'testAttempts'),
              where('testId', '==', testId),
              where('teacherUid', '==', teacher.uid)
            )
      ),
      teacher.role === 'admin'
        ? getDocs(collection(db, 'enrolments'))
        : getDocs(
            query(collection(db, 'enrolments'), where('teacherUids', 'array-contains', teacher.uid))
          ),
    ]);
    const nameMap = new Map(
      enrSnap.docs.map((d) => [String(d.data().studentAccountId), String(d.data().studentName || '')])
    );
    return attSnap.docs
      .map((d) => {
        const a = d.data() as TestAttempt;
        return { ...a, studentName: nameMap.get(a.studentId) || a.studentId };
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}

export class FirebaseTestAttemptService implements ITestAttemptService, ITestEvaluationService {
  async listStudentAvailableTests(
    actor: AuthPrincipal | null
  ): Promise<StudentObjectiveTestSummary[]> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();
    const enrSnap = await getDocs(
      query(
        collection(db, 'enrolments'),
        where('studentUid', '==', student.uid),
        where('status', '==', 'active')
      )
    );
    if (enrSnap.empty) return [];
    const enr = enrSnap.docs[0].data();

    const [testSnap, attSnap, clsSnap, batSnap, subSnap] = await Promise.all([
      getDocs(
        query(collection(db, 'objectiveTests'), where('status', 'in', ['published', 'active', 'completed']))
      ),
      getDocs(query(collection(db, 'testAttempts'), where('studentUid', '==', student.uid))),
      getDocs(query(collection(db, 'classes'), where('status', 'in', ['active', 'inactive']))),
      getDocs(query(collection(db, 'batches'), where('status', 'in', ['active', 'inactive']))),
      getDocs(query(collection(db, 'subjects'), where('status', 'in', ['active', 'inactive']))),
    ]);

    const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name as string]));
    const batMap = new Map(batSnap.docs.map((d) => [d.id, d.data().name as string]));
    const subMap = new Map(subSnap.docs.map((d) => [d.id, d.data().name as string]));
    const attempts = attSnap.docs.map((d) => d.data() as TestAttempt);

    return testSnap.docs
      .map((d) => d.data() as ObjectiveTest)
      .filter(
        (t) =>
          t.batchId === enr.batchId &&
          t.classId === enr.classId &&
          (t.status === 'published' || t.status === 'active' || t.status === 'completed')
      )
      .map((t) => {
        const effectiveStatus = computeEffectiveTestStatus(t);
        const visible = isTestResultsReleased(t);
        const myAttempts = attempts.filter((a) => a.testId === t.id);
        const inProgress = myAttempts.find((a) => a.status === 'in_progress') ?? null;
        const completed = myAttempts.filter((a) => a.status !== 'in_progress');
        return {
          id: t.id,
          title: t.title,
          instructions: t.instructions,
          classId: t.classId,
          className: clsMap.get(t.classId) ?? t.classId,
          batchId: t.batchId,
          batchName: batMap.get(t.batchId) ?? t.batchId,
          subjectId: t.subjectId,
          subjectName: subMap.get(t.subjectId) ?? t.subjectId,
          teacherId: t.teacherId,
          teacherName: t.teacherId,
          questionCount: t.questions.length,
          totalMarks: t.totalMarks,
          durationMinutes: t.durationMinutes,
          startsAt: t.startsAt,
          endsAt: t.endsAt,
          maximumAttempts: t.maximumAttempts,
          resultReleaseMode: t.resultReleaseMode,
          scheduledReleaseAt: t.scheduledReleaseAt,
          showCorrectAnswersOnRelease: t.showCorrectAnswersOnRelease,
          effectiveStatus,
          attemptsUsed: myAttempts.length,
          attemptsRemaining: Math.max(0, t.maximumAttempts - myAttempts.length),
          inProgressAttempt: inProgress ? toSafeAttempt(inProgress, false) : null,
          completedAttempts: completed.map((a) => toSafeAttempt(a, visible)),
        };
      });
  }

  private async toStudentQuestions(
    db: ReturnType<typeof requireFirestoreDb>,
    test: ObjectiveTest,
    released: boolean
  ): Promise<StudentObjectiveQuestionView[]> {
    let keyMap = new Map<string, { correctOptionId: string; explanation?: string }>();
    if (released && test.showCorrectAnswersOnRelease) {
      const keySnap = await getDoc(
        doc(db, 'objectiveTests', test.id, 'private', 'answerKey')
      ).catch(() => null);
      if (keySnap?.exists()) {
        const list = (keySnap.data().answers ?? []) as Array<{
          questionId: string;
          correctOptionId: string;
          explanation?: string;
        }>;
        keyMap = new Map(list.map((k) => [k.questionId, k]));
      }
    }

    return test.questions.map((q) => {
      const answerInfo = keyMap.get(q.id);
      return {
        id: q.id,
        questionText: q.questionText,
        options: q.options,
        marks: q.marks,
        ...(answerInfo
          ? {
              correctOptionId: answerInfo.correctOptionId,
              explanation: answerInfo.explanation,
            }
          : {}),
      };
    });
  }

  async startOrResumeTestAttempt(
    actor: AuthPrincipal | null,
    testId: string
  ): Promise<{
    test: StudentObjectiveTestSummary;
    attempt: StudentSafeTestAttempt;
    questions: StudentObjectiveQuestionView[];
  }> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();
    const summaries = await this.listStudentAvailableTests(actor);
    const summary = summaries.find((s) => s.id === testId);
    if (!summary) {
      throw new AssessmentServiceError('NOT_FOUND', 'Objective test not available.');
    }

    const testSnap = await getDoc(doc(db, 'objectiveTests', testId));
    const test = testSnap.data() as ObjectiveTest & { teacherUid: string; adminUids: string[] };

    if (summary.inProgressAttempt) {
      const questions = await this.toStudentQuestions(db, test, false);
      return { test: summary, attempt: summary.inProgressAttempt, questions };
    }

    if (summary.attemptsRemaining <= 0) {
      throw new AssessmentServiceError('ATTEMPT_LIMIT_REACHED', 'Maximum attempts reached.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + test.durationMinutes * 60 * 1000);
    const attemptId = generateSafeDocId('TATT');
    const attempt: TestAttempt & {
      studentUid: string;
      teacherUid: string;
      adminUids: string[];
    } = {
      id: attemptId,
      testId,
      studentId: student.loginId,
      studentUid: student.uid,
      teacherUid: test.teacherUid,
      attemptNumber: summary.attemptsUsed + 1,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      answers: {},
      status: 'in_progress',
      totalMarks: test.totalMarks,
      adminUids: test.adminUids,
    };

    await setDoc(doc(db, 'testAttempts', attemptId), stripUndefinedFields({ ...attempt }));
    const questions = await this.toStudentQuestions(db, test, false);
    return {
      test: { ...summary, attemptsUsed: summary.attemptsUsed + 1 },
      attempt: toSafeAttempt(attempt, false),
      questions,
    };
  }

  async saveTestAttemptAnswer(
    actor: AuthPrincipal | null,
    attemptId: string,
    questionId: string,
    optionId: string
  ): Promise<StudentSafeTestAttempt> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'testAttempts', attemptId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().studentUid !== student.uid) {
      throw new AssessmentServiceError('NOT_FOUND', 'Attempt not found.');
    }
    const existing = snap.data() as TestAttempt;
    if (existing.status !== 'in_progress') {
      throw new AssessmentServiceError('ALREADY_SUBMITTED', 'Attempt is already submitted.');
    }
    const nextAnswers = { ...existing.answers, [questionId]: optionId };
    await updateDoc(ref, { answers: nextAnswers });
    return toSafeAttempt({ ...existing, answers: nextAnswers }, false);
  }

  async getStudentAttemptReviewDetail(
    actor: AuthPrincipal | null,
    attemptId: string
  ): Promise<{
    test: StudentObjectiveTestSummary;
    attempt: StudentSafeTestAttempt;
    questions: StudentObjectiveQuestionView[];
  }> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();
    const attSnap = await getDoc(doc(db, 'testAttempts', attemptId));
    if (!attSnap.exists() || attSnap.data().studentUid !== student.uid) {
      throw new AssessmentServiceError('NOT_FOUND', 'Test attempt not found.');
    }
    const attempt = attSnap.data() as TestAttempt;
    const summaries = await this.listStudentAvailableTests(actor);
    const summary = summaries.find((s) => s.id === attempt.testId);
    if (!summary) throw new AssessmentServiceError('NOT_FOUND', 'Test not found.');
    const testSnap = await getDoc(doc(db, 'objectiveTests', attempt.testId));
    const test = testSnap.data() as ObjectiveTest;
    const visible = isTestResultsReleased(test);
    const questions = await this.toStudentQuestions(db, test, visible);
    return { test: summary, attempt: toSafeAttempt(attempt, visible), questions };
  }

  async submitAndEvaluateTestAttempt(
    actor: AuthPrincipal | null,
    attemptId: string
  ): Promise<{
    attempt: StudentSafeTestAttempt;
    questions: StudentObjectiveQuestionView[];
  }> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'testAttempts', attemptId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().studentUid !== student.uid) {
      throw new AssessmentServiceError('NOT_FOUND', 'Attempt not found.');
    }
    const existing = snap.data() as TestAttempt;
    if (existing.status !== 'in_progress') {
      throw new AssessmentServiceError('ALREADY_SUBMITTED', 'Attempt already submitted.');
    }

    const testSnap = await getDoc(doc(db, 'objectiveTests', existing.testId));
    const test = testSnap.data() as ObjectiveTest;
    const visible = isTestResultsReleased(test);
    const nowIso = new Date().toISOString();

    let marksObtained: number | undefined;
    let percentage: number | undefined;
    let status: TestAttempt['status'] = 'submitted';

    if (visible) {
      const keySnap = await getDoc(
        doc(db, 'objectiveTests', existing.testId, 'private', 'answerKey')
      ).catch(() => null);
      if (keySnap?.exists()) {
        const answersList = (keySnap.data().answers ?? []) as Array<{
          questionId: string;
          correctOptionId: string;
          marks: number;
        }>;
        let sum = 0;
        for (const q of answersList) {
          if (existing.answers?.[q.questionId] === q.correctOptionId) {
            sum += Number(q.marks || 0);
          }
        }
        marksObtained = sum;
        percentage = Math.round((sum / Math.max(1, test.totalMarks)) * 10000) / 100;
        status = 'evaluated';
      }
    }

    const patch: Record<string, unknown> = {
      submittedAt: nowIso,
      status,
      ...(status === 'evaluated'
        ? {
            marksObtained,
            percentage,
            evaluatedAt: nowIso,
            resultReleasedAt: nowIso,
          }
        : {}),
    };
    await updateDoc(ref, patch);

    return {
      attempt: toSafeAttempt({ ...existing, ...patch } as TestAttempt, visible),
      questions: await this.toStudentQuestions(db, test, visible),
    };
  }
}

export class FirebaseExaminationService implements IExaminationService, IExaminationMarksService {
  async listTeacherExaminations(actor: AuthPrincipal | null): Promise<ExaminationDetailView[]> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const [exSnap, clsSnap, batSnap, subSnap, enrSnap, mrkSnap] = await Promise.all([
      teacher.role === 'admin'
        ? getDocs(collection(db, 'examinations'))
        : getDocs(query(collection(db, 'examinations'), where('teacherUid', '==', teacher.uid))),
      getDocs(query(collection(db, 'classes'), where('status', 'in', ['active', 'inactive']))),
      getDocs(query(collection(db, 'batches'), where('status', 'in', ['active', 'inactive']))),
      getDocs(query(collection(db, 'subjects'), where('status', 'in', ['active', 'inactive']))),
      teacher.role === 'admin'
        ? getDocs(query(collection(db, 'enrolments'), where('status', '==', 'active')))
        : getDocs(
            query(collection(db, 'enrolments'), where('teacherUids', 'array-contains', teacher.uid))
          ),
      teacher.role === 'admin'
        ? getDocs(collection(db, 'examinationMarks'))
        : getDocs(query(collection(db, 'examinationMarks'), where('teacherUid', '==', teacher.uid))),
    ]);

    const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name as string]));
    const batMap = new Map(batSnap.docs.map((d) => [d.id, d.data().name as string]));
    const subMap = new Map(subSnap.docs.map((d) => [d.id, d.data().name as string]));
    const enrolments = enrSnap.docs.map((d) => d.data()).filter((e) => e.status === 'active');
    const marks = mrkSnap.docs.map((d) => d.data() as ExaminationMarks);

    return exSnap.docs
      .map((d) => {
        const examination = d.data() as ExaminationRecord;
        const eligibleStudentCount = enrolments.filter(
          (e) => e.classId === examination.classId && e.batchId === examination.batchId
        ).length;
        const marksEnteredCount = marks.filter((m) => m.examinationId === examination.id).length;
        return {
          examination,
          className: clsMap.get(examination.classId) ?? examination.classId,
          batchName: batMap.get(examination.batchId) ?? examination.batchId,
          subjectName: subMap.get(examination.subjectId) ?? examination.subjectId,
          teacherName: examination.teacherId,
          eligibleStudentCount,
          marksEnteredCount,
        };
      })
      .sort((a, b) => b.examination.examDate.localeCompare(a.examination.examDate));
  }

  async createExamination(
    actor: AuthPrincipal | null,
    input: CreateExaminationInput
  ): Promise<ExaminationRecord> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    if (!input.title.trim() || input.maximumMarks <= 0) {
      throw new AssessmentServiceError('VALIDATION_ERROR', 'Title and valid maximum marks required.');
    }
    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const id = generateSafeDocId('EXM');
    const nowIso = new Date().toISOString();
    const record: ExaminationRecord & { teacherUid: string; adminUids: string[] } = {
      id,
      title: input.title.trim(),
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: teacher.loginId,
      teacherUid: teacher.uid,
      examDate: input.examDate,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      maximumMarks: input.maximumMarks,
      passingMarks: input.passingMarks,
      instructions: input.instructions.trim() || 'Follow examination instructions.',
      status: input.publishImmediately ? 'published' : 'draft',
      resultsReleased: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      adminUids,
    };
    await setDoc(doc(db, 'examinations', id), stripUndefinedFields({ ...record }));
    return record;
  }

  async updateExamination(
    actor: AuthPrincipal | null,
    examinationId: string,
    input: UpdateExaminationInput
  ): Promise<ExaminationRecord> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'examinations', examinationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Examination not found.');
    const existing = snap.data() as ExaminationRecord & { teacherUid: string };
    if (teacher.role === 'teacher' && existing.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = { updatedAt: nowIso };
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.examDate !== undefined) patch.examDate = input.examDate;
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt;
    if (input.maximumMarks !== undefined) patch.maximumMarks = input.maximumMarks;
    if (input.passingMarks !== undefined && input.passingMarks !== null) {
      patch.passingMarks = input.passingMarks;
    }
    if (input.instructions !== undefined) patch.instructions = input.instructions.trim();
    await updateDoc(ref, patch);
    return { ...existing, ...patch } as ExaminationRecord;
  }

  async setExaminationStatus(
    actor: AuthPrincipal | null,
    examinationId: string,
    status: ExaminationStatus
  ): Promise<ExaminationRecord> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'examinations', examinationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Examination not found.');
    const existing = snap.data() as ExaminationRecord & { teacherUid: string };
    if (teacher.role === 'teacher' && existing.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }
    const nowIso = new Date().toISOString();
    await updateDoc(ref, { status, updatedAt: nowIso });
    return { ...existing, status, updatedAt: nowIso };
  }

  async listStudentExaminations(actor: AuthPrincipal | null): Promise<StudentExaminationItem[]> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();
    const enrSnap = await getDocs(
      query(
        collection(db, 'enrolments'),
        where('studentUid', '==', student.uid),
        where('status', '==', 'active')
      )
    );
    if (enrSnap.empty) return [];
    const enr = enrSnap.docs[0].data();

    const [exSnap, mrkSnap, clsSnap, batSnap, subSnap] = await Promise.all([
      getDocs(query(collection(db, 'examinations'), where('status', 'in', ['published', 'completed']))),
      getDocs(
        query(
          collection(db, 'examinationMarks'),
          where('studentUid', '==', student.uid),
          where('resultsReleased', '==', true)
        )
      ),
      getDocs(query(collection(db, 'classes'), where('status', 'in', ['active', 'inactive']))),
      getDocs(query(collection(db, 'batches'), where('status', 'in', ['active', 'inactive']))),
      getDocs(query(collection(db, 'subjects'), where('status', 'in', ['active', 'inactive']))),
    ]);

    const clsMap = new Map(clsSnap.docs.map((d) => [d.id, d.data().name as string]));
    const batMap = new Map(batSnap.docs.map((d) => [d.id, d.data().name as string]));
    const subMap = new Map(subSnap.docs.map((d) => [d.id, d.data().name as string]));
    const releasedMarksMap = new Map(
      mrkSnap.docs.map((d) => {
        const m = d.data() as ExaminationMarks;
        return [m.examinationId, m];
      })
    );

    return exSnap.docs
      .map((d) => d.data() as ExaminationRecord)
      .filter(
        (ex) =>
          ex.batchId === enr.batchId &&
          ex.classId === enr.classId &&
          (ex.status === 'published' || ex.status === 'completed')
      )
      .map((examination) => {
        const myMarks = examination.resultsReleased
          ? (releasedMarksMap.get(examination.id) ?? null)
          : null;
        return {
          examination,
          className: clsMap.get(examination.classId) ?? examination.classId,
          batchName: batMap.get(examination.batchId) ?? examination.batchId,
          subjectName: subMap.get(examination.subjectId) ?? examination.subjectId,
          teacherName: examination.teacherId,
          myMarks,
          marksEnteredPendingRelease: !examination.resultsReleased && examination.status === 'completed',
        };
      })
      .sort((a, b) => b.examination.examDate.localeCompare(a.examination.examDate));
  }

  async getExaminationMarksRoster(
    actor: AuthPrincipal | null,
    examinationId: string
  ): Promise<{
    examination: ExaminationRecord;
    eligibleStudents: TeacherEligibleStudent[];
    marks: Array<ExaminationMarks & { studentName: string }>;
    auditEntries: MarksAuditEntry[];
  }> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const exSnap = await getDoc(doc(db, 'examinations', examinationId));
    if (!exSnap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Examination not found.');
    const examination = exSnap.data() as ExaminationRecord & { teacherUid: string };
    if (teacher.role === 'teacher' && examination.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const [enrSnap, mrkSnap, audSnap] = await Promise.all([
      getDocs(
        teacher.role === 'admin'
          ? query(
              collection(db, 'enrolments'),
              where('batchId', '==', examination.batchId),
              where('status', '==', 'active')
            )
          : query(collection(db, 'enrolments'), where('teacherUids', 'array-contains', teacher.uid))
      ),
      getDocs(
        teacher.role === 'admin'
          ? query(collection(db, 'examinationMarks'), where('examinationId', '==', examinationId))
          : query(collection(db, 'examinationMarks'), where('teacherUid', '==', teacher.uid))
      ),
      getDocs(
        teacher.role === 'admin'
          ? query(collection(db, 'marksAudit'), where('examinationId', '==', examinationId))
          : query(collection(db, 'marksAudit'), where('teacherUid', '==', teacher.uid))
      ).catch(() => null),
    ]);

    const eligibleStudents: TeacherEligibleStudent[] = enrSnap.docs
      .map((d) => d.data())
      .filter(
        (e) =>
          e.status === 'active' &&
          e.batchId === examination.batchId &&
          e.classId === examination.classId
      )
      .map((e) => ({
        studentId: String(e.studentAccountId),
        studentName: String(e.studentName || e.studentAccountId),
        enrolmentId: String(e.enrolmentId || e.id),
      }));

    const nameMap = new Map(eligibleStudents.map((s) => [s.studentId, s.studentName]));
    const marks = mrkSnap.docs
      .map((d) => d.data() as ExaminationMarks)
      .filter((m) => m.examinationId === examinationId)
      .map((m) => ({ ...m, studentName: nameMap.get(m.studentId) || m.studentId }));
    const auditEntries = (audSnap?.docs ?? [])
      .map((d) => d.data() as MarksAuditEntry)
      .filter((a) => a.examinationId === examinationId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return { examination, eligibleStudents, marks, auditEntries };
  }

  async submitBulkExaminationMarks(
    actor: AuthPrincipal | null,
    input: BulkMarksEntryInput
  ): Promise<ExaminationMarks[]> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const exSnap = await getDoc(doc(db, 'examinations', input.examinationId));
    if (!exSnap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Examination not found.');
    const ex = exSnap.data() as ExaminationRecord & { teacherUid: string; adminUids: string[] };
    if (teacher.role === 'teacher' && ex.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const enrSnap = await getDocs(
      teacher.role === 'admin'
        ? query(
            collection(db, 'enrolments'),
            where('batchId', '==', ex.batchId),
            where('status', '==', 'active')
          )
        : query(collection(db, 'enrolments'), where('teacherUids', 'array-contains', teacher.uid))
    );
    const uidMap = new Map<string, string>();
    for (const d of enrSnap.docs) {
      const e = d.data();
      if (e.status !== 'active' || e.batchId !== ex.batchId) continue;
      uidMap.set(String(e.studentAccountId).toUpperCase(), String(e.studentUid || ''));
    }

    const nowIso = new Date().toISOString();
    const release = Boolean(input.releaseImmediately || ex.resultsReleased);
    const batch = writeBatch(db);
    const saved: ExaminationMarks[] = [];

    for (const entry of input.entries) {
      const normalizedId = entry.studentId.trim().toUpperCase();
      const studentUid = uidMap.get(normalizedId);
      if (!studentUid) continue;
      if (entry.marksObtained < 0 || entry.marksObtained > ex.maximumMarks) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          `Marks for ${normalizedId} must be between 0 and ${ex.maximumMarks}.`
        );
      }

      const percentage = Math.round((entry.marksObtained / ex.maximumMarks) * 10000) / 100;
      const resultStatus =
        ex.passingMarks !== undefined
          ? entry.marksObtained >= ex.passingMarks
            ? 'pass'
            : 'fail'
          : 'recorded';

      const marksId = `${ex.id}-${normalizedId}`;
      const record: ExaminationMarks & {
        studentUid: string;
        teacherUid: string;
        resultsReleased: boolean;
        adminUids: string[];
      } = {
        id: marksId,
        examinationId: ex.id,
        studentId: normalizedId,
        studentUid,
        teacherUid: ex.teacherUid,
        marksObtained: entry.marksObtained,
        maximumMarks: ex.maximumMarks,
        percentage,
        resultStatus,
        resultsReleased: release,
        enteredBy: teacher.loginId,
        enteredAt: nowIso,
        updatedAt: nowIso,
        ...(release ? { releasedAt: nowIso } : {}),
        adminUids: ex.adminUids,
      };
      batch.set(doc(db, 'examinationMarks', marksId), stripUndefinedFields({ ...record }));
      saved.push(record);
    }

    if (release) {
      batch.update(doc(db, 'examinations', ex.id), {
        resultsReleased: true,
        status: 'completed',
        updatedAt: nowIso,
      });
    }

    await batch.commit();
    return saved;
  }

  async correctExaminationMarks(
    actor: AuthPrincipal | null,
    input: CorrectMarksInput
  ): Promise<ExaminationMarks> {
    const activeActor = requireVerifiedActor(actor, ['admin', 'teacher']);
    const reason = input.reason.trim();
    if (!reason || reason.length < 3) {
      throw new AssessmentServiceError(
        'CORRECTION_REASON_REQUIRED',
        'A correction reason is required.'
      );
    }

    const db = requireFirestoreDb();
    const ref = doc(db, 'examinationMarks', input.marksRecordId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Marks record not found.');
    const existing = snap.data() as ExaminationMarks & {
      studentUid: string;
      teacherUid: string;
      resultsReleased: boolean;
      adminUids: string[];
    };
    if (existing.resultsReleased && activeActor.role !== 'admin') {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Only an Admin can correct released examination marks.'
      );
    }
    if (activeActor.role === 'teacher' && existing.teacherUid !== activeActor.uid) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'You may only correct marks for examinations you created.'
      );
    }
    if (input.newMarksObtained < 0 || input.newMarksObtained > existing.maximumMarks) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        `Corrected marks must be between 0 and ${existing.maximumMarks}.`
      );
    }

    const exSnap = await getDoc(doc(db, 'examinations', existing.examinationId));
    const passingMarks = exSnap.data()?.passingMarks as number | undefined;
    const percentage =
      Math.round((input.newMarksObtained / existing.maximumMarks) * 10000) / 100;
    const resultStatus =
      passingMarks !== undefined
        ? input.newMarksObtained >= passingMarks
          ? 'pass'
          : 'fail'
        : 'recorded';

    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    batch.update(ref, {
      marksObtained: input.newMarksObtained,
      percentage,
      resultStatus,
      corrected: true,
      updatedAt: nowIso,
    });
    const auditId = generateSafeDocId('MAUD');
    batch.set(doc(db, 'marksAudit', auditId), {
      id: auditId,
      examinationId: existing.examinationId,
      marksRecordId: existing.id,
      studentId: existing.studentId,
      teacherUid: existing.teacherUid,
      actorId: activeActor.loginId,
      action: 'marks_corrected',
      previousMarks: existing.marksObtained,
      newMarks: input.newMarksObtained,
      reason,
      timestamp: nowIso,
      adminUids: existing.adminUids,
    });
    await batch.commit();

    return {
      ...existing,
      marksObtained: input.newMarksObtained,
      percentage,
      resultStatus,
      corrected: true,
      updatedAt: nowIso,
    };
  }

  async releaseExaminationResults(
    actor: AuthPrincipal | null,
    examinationId: string
  ): Promise<ExaminationRecord> {
    const teacher = requireVerifiedActor(actor, ['teacher', 'admin']);
    const db = requireFirestoreDb();
    const exRef = doc(db, 'examinations', examinationId);
    const exSnap = await getDoc(exRef);
    if (!exSnap.exists()) throw new AssessmentServiceError('NOT_FOUND', 'Examination not found.');
    const ex = exSnap.data() as ExaminationRecord & { teacherUid: string; adminUids: string[] };
    if (teacher.role === 'teacher' && ex.teacherUid !== teacher.uid) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const mrkSnap = await getDocs(
      teacher.role === 'admin'
        ? query(collection(db, 'examinationMarks'), where('examinationId', '==', examinationId))
        : query(collection(db, 'examinationMarks'), where('teacherUid', '==', teacher.uid))
    );
    const nowIso = new Date().toISOString();
    const batch = writeBatch(db);
    batch.update(exRef, { resultsReleased: true, status: 'completed', updatedAt: nowIso });
    for (const d of mrkSnap.docs) {
      const m = d.data() as ExaminationMarks & { studentUid: string };
      if (m.examinationId !== examinationId) continue;
      batch.update(d.ref, { resultsReleased: true, releasedAt: nowIso, updatedAt: nowIso });
      const nid = `ANF-EREL-${examinationId}-${m.studentId}`;
      batch.set(doc(db, 'notifications', nid), {
        id: nid,
        recipientId: m.studentId,
        recipientUid: m.studentUid,
        recipientRole: 'student',
        category: 'assessment',
        type: 'examination_marks_released',
        relatedRecordId: examinationId,
        dedupeKey: `exam_marks_released:${examinationId}:${m.studentId}`,
        title: `Exam Marks Released: ${ex.title}`,
        message: `Your marks (${m.marksObtained}/${m.maximumMarks}) are now released.`,
        adminUids: ex.adminUids,
        createdAt: nowIso,
      });
    }
    await batch.commit();
    return { ...ex, resultsReleased: true, status: 'completed', updatedAt: nowIso };
  }
}

export class FirebaseAssessmentOverviewService implements IAssessmentOverviewService {
  private readonly homeworkSvc = new FirebaseHomeworkService();
  private readonly testSvc = new FirebaseObjectiveTestService();
  private readonly examSvc = new FirebaseExaminationService();

  async getStudentResultsDashboard(
    actor: AuthPrincipal | null,
    filter?: StudentResultFilter
  ): Promise<StudentResultsDashboardData> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();

    const [exams, subSnap, testSnap, attSnap, hwSnap, notifSnap, subjectsSnap] =
      await Promise.all([
        this.examSvc.listStudentExaminations(actor),
        getDocs(query(collection(db, 'homeworkSubmissions'), where('studentUid', '==', student.uid))),
        getDocs(
          query(collection(db, 'objectiveTests'), where('status', 'in', ['published', 'active', 'completed']))
        ),
        getDocs(query(collection(db, 'testAttempts'), where('studentUid', '==', student.uid))),
        getDocs(query(collection(db, 'homework'), where('status', '==', 'published'))),
        getDocs(
          query(
            collection(db, 'notifications'),
            where('recipientUid', '==', student.uid)
          )
        ),
        getDocs(query(collection(db, 'subjects'), where('status', 'in', ['active', 'inactive']))),
      ]);

    const subMap = new Map(subjectsSnap.docs.map((d) => [d.id, d.data().name as string]));
    const testMap = new Map(testSnap.docs.map((d) => [d.id, d.data() as ObjectiveTest]));
    const hwMap = new Map(hwSnap.docs.map((d) => [d.id, d.data() as HomeworkRecord]));

    const results: StudentUnifiedResultItem[] = [];
    let unreleasedPendingCount = 0;

    for (const item of exams) {
      if (item.myMarks) {
        results.push({
          id: item.myMarks.id,
          sourceType: 'examination',
          relatedId: item.examination.id,
          title: item.examination.title,
          subjectId: item.examination.subjectId,
          subjectName: item.subjectName,
          assessmentDate: item.examination.examDate,
          releasedAt: item.myMarks.releasedAt || item.myMarks.updatedAt,
          marksObtained: item.myMarks.marksObtained,
          maximumMarks: item.myMarks.maximumMarks,
          percentage: item.myMarks.percentage,
          resultStatus: item.myMarks.resultStatus,
        });
      } else if (item.marksEnteredPendingRelease) {
        unreleasedPendingCount += 1;
      }
    }

    for (const d of attSnap.docs) {
      const att = d.data() as TestAttempt;
      if (att.status === 'in_progress') continue;
      const test = testMap.get(att.testId);
      if (!test) continue;
      if (isTestResultsReleased(test) && att.marksObtained !== undefined) {
        results.push({
          id: att.id,
          sourceType: 'objective_test',
          relatedId: test.id,
          title: test.title,
          subjectId: test.subjectId,
          subjectName: subMap.get(test.subjectId) ?? test.subjectId,
          assessmentDate: att.submittedAt || att.startedAt,
          releasedAt: att.resultReleasedAt || att.evaluatedAt || att.startedAt,
          marksObtained: att.marksObtained,
          maximumMarks: att.totalMarks,
          percentage: att.percentage ?? 0,
          resultStatus: 'recorded',
          attemptNumber: att.attemptNumber,
        });
      } else {
        unreleasedPendingCount += 1;
      }
    }

    for (const d of subSnap.docs) {
      const sub = d.data() as HomeworkSubmission;
      const hw = hwMap.get(sub.homeworkId);
      if (sub.status === 'reviewed' && hw?.maximumMarks && sub.marksAwarded !== undefined) {
        results.push({
          id: sub.id,
          sourceType: 'homework',
          relatedId: hw.id,
          title: hw.title,
          subjectId: hw.subjectId,
          subjectName: subMap.get(hw.subjectId) ?? hw.subjectId,
          assessmentDate: sub.submittedAt,
          releasedAt: sub.reviewedAt || sub.submittedAt,
          marksObtained: sub.marksAwarded,
          maximumMarks: hw.maximumMarks,
          percentage: Math.round((sub.marksAwarded / hw.maximumMarks) * 10000) / 100,
          resultStatus: 'recorded',
        });
      }
    }

    let filtered = results;
    if (filter?.subjectId && filter.subjectId !== 'all') {
      filtered = filtered.filter((r) => r.subjectId === filter.subjectId);
    }
    if (filter?.sourceType && filter.sourceType !== 'all') {
      filtered = filtered.filter((r) => r.sourceType === filter.sourceType);
    }
    if (filter?.resultStatus && filter.resultStatus !== 'all') {
      filtered = filtered.filter((r) => r.resultStatus === filter.resultStatus);
    }
    filtered.sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));

    const summaryBySubject = new Map<string, StudentUnifiedResultItem[]>();
    for (const r of filtered) {
      const list = summaryBySubject.get(r.subjectId) ?? [];
      list.push(r);
      summaryBySubject.set(r.subjectId, list);
    }

    const subjectSummaries: SubjectPerformanceSummary[] = Array.from(
      summaryBySubject.entries()
    ).map(([subjectId, items]) => {
      const obtained = items.reduce((s, x) => s + x.marksObtained, 0);
      const max = items.reduce((s, x) => s + x.maximumMarks, 0);
      const pct = max > 0 ? Math.round((obtained / max) * 1000) / 10 : null;
      return {
        subjectId,
        subjectName: subMap.get(subjectId) ?? subjectId,
        availability: 'result_available',
        releasedAssessmentsCount: items.length,
        pendingAssessmentsCount: 0,
        totalMarksObtained: obtained,
        totalMaximumMarks: max,
        percentage: pct,
        displayPercentage: pct === null ? 'Not available' : `${pct.toFixed(1)}%`,
        latestResultTitle: items[0]?.title,
        latestResultDisplay: items[0] ? `${items[0].marksObtained}/${items[0].maximumMarks}` : undefined,
        latestReleasedAt: items[0]?.releasedAt,
      };
    });

    const notifications = notifSnap.docs
      .map((d) => d.data())
      .filter((n) => n.category === 'assessment')
      .map((n) => ({
        id: String(n.id),
        recipientStudentId: String(n.recipientId),
        type: n.type as AssessmentNotification['type'],
        relatedRecordId: String(n.relatedRecordId),
        title: String(n.title),
        message: String(n.message),
        createdAt: String(n.createdAt),
        readAt: typeof n.readAt === 'string' ? n.readAt : undefined,
        dedupeKey: String(n.dedupeKey),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      results: filtered,
      subjectSummaries,
      notifications,
      unreadNotificationCount: notifications.filter((n) => !n.readAt).length,
      releasedCount: filtered.length,
      unreleasedPendingCount,
    };
  }

  async getTeacherResultsWorkspace(
    actor: AuthPrincipal | null
  ): Promise<TeacherResultsWorkspaceData> {
    const tests = await this.testSvc.listTeacherTests(actor);
    const exams = await this.examSvc.listTeacherExaminations(actor);
    const homeworks = await this.homeworkSvc.listTeacherHomework(actor);

    const testResults = await Promise.all(
      tests.map(async (t) => ({
        test: t.test,
        subjectName: t.subjectName,
        className: t.className,
        batchName: t.batchName,
        attempts: await this.testSvc.listTestAttemptsForTeacher(actor, t.test.id),
      }))
    );

    const examinationResults = await Promise.all(
      exams.map(async (e) => {
        const roster = await this.examSvc.getExaminationMarksRoster(actor, e.examination.id);
        return {
          examination: e.examination,
          subjectName: e.subjectName,
          className: e.className,
          batchName: e.batchName,
          marks: roster.marks,
          pendingStudentCount: Math.max(0, roster.eligibleStudents.length - roster.marks.length),
        };
      })
    );

    const homeworkResults = await Promise.all(
      homeworks.map(async (h) => {
        const roster = await this.homeworkSvc.getTeacherHomeworkRosterAndSubmissions(
          actor,
          h.homework.id
        );
        return {
          homework: h.homework,
          subjectName: h.subjectName,
          className: h.className,
          batchName: h.batchName,
          submissions: roster.submissions.map((s) => ({
            ...s.submission,
            studentName: s.studentName,
          })),
        };
      })
    );

    return { testResults, examinationResults, homeworkResults };
  }

  async getAdminAssessmentOverview(
    actor: AuthPrincipal | null,
    filter?: AdminAssessmentFilter
  ): Promise<AdminAssessmentOverviewData> {
    requireVerifiedActor(actor, ['admin']);
    const db = requireFirestoreDb();
    const [hw, tests, exams, marksAudSnap, hwAudSnap] = await Promise.all([
      this.homeworkSvc.listTeacherHomework(actor, {
        classId: filter?.classId,
        subjectId: filter?.subjectId,
      }),
      this.testSvc.listTeacherTests(actor),
      this.examSvc.listTeacherExaminations(actor),
      getDocs(query(collection(db, 'marksAudit'), limit(250))).catch(() => null),
      getDocs(query(collection(db, 'homeworkAudit'), limit(250))).catch(() => null),
    ]);

    return {
      stats: {
        totalHomeworkCreated: hw.length,
        publishedHomework: hw.filter((h) => h.homework.status === 'published').length,
        pendingHomeworkSubmissions: hw.reduce((s, h) => s + h.pendingCount, 0),
        reviewedHomeworkSubmissions: hw.reduce((s, h) => s + h.reviewedCount, 0),
        totalObjectiveTests: tests.length,
        publishedTests: tests.filter((t) => t.effectiveStatus !== 'draft').length,
        completedTestAttempts: tests.reduce((s, t) => s + t.attemptCount, 0),
        upcomingExaminations: exams.filter((e) => e.examination.status === 'published').length,
        completedExaminations: exams.filter((e) => e.examination.status === 'completed').length,
        pendingMarksEntry: exams.reduce(
          (s, e) => s + Math.max(0, e.eligibleStudentCount - e.marksEnteredCount),
          0
        ),
        releasedResults: exams.filter((e) => e.examination.resultsReleased).length,
      },
      homework: hw,
      tests,
      examinations: exams,
      marksAuditEntries: (marksAudSnap?.docs ?? [])
        .map((d) => d.data() as MarksAuditEntry)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      homeworkAuditEntries: (hwAudSnap?.docs ?? [])
        .map((d) => d.data() as HomeworkReviewAudit)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    };
  }

  async listMyAssessmentNotifications(
    actor: AuthPrincipal | null
  ): Promise<AssessmentNotification[]> {
    const res = await this.getStudentResultsDashboard(actor);
    return res.notifications;
  }

  async markAssessmentNotificationRead(
    actor: AuthPrincipal | null,
    notificationId: string
  ): Promise<AssessmentNotification> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();
    const ref = doc(db, 'notifications', notificationId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().recipientUid !== student.uid) {
      throw new AssessmentServiceError('NOT_FOUND', 'Notification not found.');
    }
    const readAt = new Date().toISOString();
    await updateDoc(ref, { readAt });
    const d = snap.data();
    return {
      id: snap.id,
      recipientStudentId: String(d.recipientId),
      type: d.type as AssessmentNotification['type'],
      relatedRecordId: String(d.relatedRecordId),
      title: String(d.title),
      message: String(d.message),
      createdAt: String(d.createdAt),
      readAt,
      dedupeKey: String(d.dedupeKey),
    };
  }

  async markAllAssessmentNotificationsRead(actor: AuthPrincipal | null): Promise<void> {
    const student = requireVerifiedActor(actor, ['student']);
    const db = requireFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'notifications'),
        where('recipientUid', '==', student.uid),
        where('category', '==', 'assessment')
      )
    );
    const batch = writeBatch(db);
    const readAt = new Date().toISOString();
    for (const d of snap.docs) {
      if (!d.data().readAt) batch.update(d.ref, { readAt });
    }
    await batch.commit();
  }
}

export const firebaseHomeworkService = new FirebaseHomeworkService();
export const firebaseHomeworkSubmissionService = new FirebaseHomeworkSubmissionService();
export const firebaseObjectiveTestService = new FirebaseObjectiveTestService();
export const firebaseTestAttemptService = new FirebaseTestAttemptService();
export const firebaseExaminationService = new FirebaseExaminationService();
export const firebaseAssessmentOverviewService = new FirebaseAssessmentOverviewService();
