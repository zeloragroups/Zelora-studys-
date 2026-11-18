import type {
  AuthPrincipal,
  HomeworkRecord,
  HomeworkReviewAudit,
  HomeworkStatus,
  HomeworkSubmission,
  StudentHomeworkItem,
  StudentSafeHomeworkSubmission,
  TeacherHomeworkSummaryItem,
  TeacherSubmissionViewItem,
} from '../../types';
import { getHomeworkComputedIndicator } from '../../utils/assessmentCalculations';
import { formatShortDate } from '../../utils/formatters';
import { validateRequiredText } from '../../utils/validation';
import {
  AssessmentServiceError,
  type CreateHomeworkInput,
  type IHomeworkService,
  type IHomeworkSubmissionService,
  type ReviewHomeworkSubmissionInput,
  type TeacherScopeResources,
  type UpdateHomeworkInput,
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

function toStudentSafeSubmission(
  submission: HomeworkSubmission
): StudentSafeHomeworkSubmission {
  const isReviewedOrReturned =
    submission.status === 'reviewed' || submission.status === 'returned_for_correction';
  return {
    id: submission.id,
    homeworkId: submission.homeworkId,
    studentId: submission.studentId,
    responseText: submission.responseText,
    submittedAt: submission.submittedAt,
    status: submission.status,
    feedback: isReviewedOrReturned ? submission.feedback : undefined,
    marksAwarded: isReviewedOrReturned ? submission.marksAwarded : undefined,
    reviewedBy: submission.reviewedBy,
    reviewedAt: submission.reviewedAt,
    revisionNumber: submission.revisionNumber,
    reopenedByTeacher: submission.reopenedByTeacher,
    revisionHistory: submission.revisionHistory.map((r) => ({ ...r })),
  };
}

export class LocalDevHomeworkService implements IHomeworkService, IHomeworkSubmissionService {
  private readonly stores: LocalAssessmentStores;

  constructor(stores: LocalAssessmentStores = sharedLocalAssessmentStores) {
    this.stores = stores;
  }

  private notifyHomeworkPublished(hw: HomeworkRecord): void {
    const roster = getBatchActiveStudents(this.stores, hw.classId, hw.batchId);
    const names = lookupAcademicNames(this.stores, hw);
    for (const stu of roster) {
      enqueueAssessmentNotification(this.stores, {
        recipientStudentId: stu.studentId,
        type: 'homework_published',
        relatedRecordId: hw.id,
        title: `New Homework: ${hw.title}`,
        message: `${names.subjectName} (${names.batchName}) due ${formatShortDate(hw.dueAt)}.`,
        dedupeKey: `homework_published:${hw.id}:${stu.studentId}`,
      });
    }
  }

  private buildTeacherHomeworkSummary(hw: HomeworkRecord): TeacherHomeworkSummaryItem {
    const names = lookupAcademicNames(this.stores, hw);
    const assignedStudents = getBatchActiveStudents(this.stores, hw.classId, hw.batchId);
    const eligibleSet = new Set(assignedStudents.map((s) => s.studentId.toUpperCase()));
    const subs = this.stores.submissions.filter(
      (s) => s.homeworkId === hw.id && eligibleSet.has(s.studentId.toUpperCase())
    );
    const reviewedCount = subs.filter((s) => s.status === 'reviewed').length;
    const submittedCount = subs.length;
    const pendingCount = Math.max(0, assignedStudents.length - submittedCount);

    return {
      homework: { ...hw },
      className: names.className,
      batchName: names.batchName,
      subjectName: names.subjectName,
      indicator: getHomeworkComputedIndicator(hw),
      totalAssignedStudents: assignedStudents.length,
      submittedCount,
      reviewedCount,
      pendingCount,
    };
  }

  private appendHomeworkAudit(entry: Omit<HomeworkReviewAudit, 'id'>): HomeworkReviewAudit {
    const seq = this.stores.homeworkCounters.auditSeq;
    const id = formatAssessmentId('HAUD', seq);
    this.stores.homeworkCounters.auditSeq = seq + 1;
    const created: HomeworkReviewAudit = { id, ...entry };
    this.stores.homeworkAuditEntries = [created, ...this.stores.homeworkAuditEntries];
    return created;
  }

  async getTeacherScopeResources(actor: AuthPrincipal | null): Promise<TeacherScopeResources> {
    const teacher = requireTeacherActor(this.stores, actor, 'homework:read_assigned');
    const normalizedId = teacher.loginId.toUpperCase();

    const activeAssignments = this.stores.academicStore.assignments.filter(
      (a) => a.status === 'active' && a.teacherAccountId.toUpperCase() === normalizedId
    );
    const classIds = new Set(activeAssignments.map((a) => a.classId));
    const batchIds = new Set(activeAssignments.map((a) => a.batchId));
    const subjectIds = new Set(activeAssignments.map((a) => a.subjectId));

    return {
      classes: this.stores.academicStore.classes
        .filter((c) => c.status === 'active' && classIds.has(c.classId))
        .map((c) => ({ ...c })),
      batches: this.stores.academicStore.batches
        .filter((b) => b.status === 'active' && batchIds.has(b.batchId))
        .map((b) => ({ ...b })),
      subjects: this.stores.academicStore.subjects
        .filter((s) => s.status === 'active' && subjectIds.has(s.subjectId))
        .map((s) => ({ ...s, classIds: [...s.classIds] })),
      assignments: activeAssignments.map((a) => ({ ...a })),
    };
  }

  async listTeacherHomework(
    actor: AuthPrincipal | null,
    filter?: { search?: string; status?: 'all' | HomeworkStatus; classId?: string; subjectId?: string }
  ): Promise<TeacherHomeworkSummaryItem[]> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Students cannot access teacher homework management.'
      );
    }

    const search = filter?.search?.trim().toLowerCase() ?? '';
    return this.stores.homeworks
      .filter((hw) => {
        if (
          active.role === 'teacher' &&
          hw.teacherId.toUpperCase() !== active.loginId.toUpperCase()
        ) {
          return false;
        }
        if (filter?.status && filter.status !== 'all' && hw.status !== filter.status) {
          return false;
        }
        if (filter?.classId && filter.classId !== 'all' && hw.classId !== filter.classId) {
          return false;
        }
        if (filter?.subjectId && filter.subjectId !== 'all' && hw.subjectId !== filter.subjectId) {
          return false;
        }
        if (search) {
          const hay = `${hw.id} ${hw.title} ${hw.instructions}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((hw) => this.buildTeacherHomeworkSummary(hw));
  }

  async createHomework(
    actor: AuthPrincipal | null,
    input: CreateHomeworkInput
  ): Promise<HomeworkRecord> {
    const teacher = requireTeacherActor(this.stores, actor, 'homework:create_text_only');

    const titleCheck = validateRequiredText(input.title, 'Homework title', 3);
    if (!titleCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', titleCheck.error!, 'title');
    }
    const instCheck = validateRequiredText(input.instructions, 'Homework instructions', 5);
    if (!instCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', instCheck.error!, 'instructions');
    }

    const parsedDue = parseIsoDateTime(input.dueAt, 'dueAt', 'Submission deadline');

    if (input.maximumMarks !== undefined) {
      if (!Number.isFinite(input.maximumMarks) || input.maximumMarks <= 0) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          'Maximum marks must be a positive number.',
          'maximumMarks'
        );
      }
    }

    validateTeacherAcademicAssignment(this.stores, teacher.loginId, {
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
    });

    const seq = this.stores.homeworkCounters.homeworkSeq;
    const id = formatAssessmentId('HW', seq);
    this.stores.homeworkCounters.homeworkSeq = seq + 1;

    const now = new Date().toISOString();
    const record: HomeworkRecord = {
      id,
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: teacher.loginId,
      assignedAt: now,
      dueAt: parsedDue.iso,
      maximumMarks: input.maximumMarks,
      status: input.publishImmediately ? 'published' : 'draft',
      createdAt: now,
      updatedAt: now,
    };

    this.stores.homeworks = [record, ...this.stores.homeworks];
    if (record.status === 'published') {
      this.notifyHomeworkPublished(record);
    }
    this.stores.saveHomework();
    return { ...record };
  }

  async updateHomework(
    actor: AuthPrincipal | null,
    homeworkId: string,
    input: UpdateHomeworkInput
  ): Promise<HomeworkRecord> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const idx = this.stores.homeworks.findIndex((h) => h.id === homeworkId);
    if (idx === -1) {
      throw new AssessmentServiceError('NOT_FOUND', `Homework "${homeworkId}" not found.`);
    }
    const existing = this.stores.homeworks[idx];
    if (
      active.role === 'teacher' &&
      existing.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'You may only edit your own homework.');
    }
    if (existing.status === 'archived') {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Archived homework cannot be edited directly.'
      );
    }

    const nextTitle =
      input.title !== undefined ? input.title.trim() : existing.title;
    const titleCheck = validateRequiredText(nextTitle, 'Homework title', 3);
    if (!titleCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', titleCheck.error!, 'title');
    }

    const nextInstructions =
      input.instructions !== undefined ? input.instructions.trim() : existing.instructions;
    const instCheck = validateRequiredText(nextInstructions, 'Homework instructions', 5);
    if (!instCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', instCheck.error!, 'instructions');
    }

    const nextDueAt =
      input.dueAt !== undefined
        ? parseIsoDateTime(input.dueAt, 'dueAt', 'Submission deadline').iso
        : existing.dueAt;

    let nextMaxMarks = existing.maximumMarks;
    if (input.maximumMarks === null) {
      nextMaxMarks = undefined;
    } else if (input.maximumMarks !== undefined) {
      if (!Number.isFinite(input.maximumMarks) || input.maximumMarks <= 0) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          'Maximum marks must be greater than zero.',
          'maximumMarks'
        );
      }
      nextMaxMarks = input.maximumMarks;
    }

    const updated: HomeworkRecord = {
      ...existing,
      title: nextTitle,
      instructions: nextInstructions,
      dueAt: nextDueAt,
      maximumMarks: nextMaxMarks,
      updatedAt: new Date().toISOString(),
    };
    this.stores.homeworks[idx] = updated;
    this.stores.saveHomework();
    return { ...updated };
  }

  async setHomeworkStatus(
    actor: AuthPrincipal | null,
    homeworkId: string,
    status: HomeworkStatus
  ): Promise<HomeworkRecord> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const idx = this.stores.homeworks.findIndex((h) => h.id === homeworkId);
    if (idx === -1) {
      throw new AssessmentServiceError('NOT_FOUND', `Homework "${homeworkId}" not found.`);
    }
    const existing = this.stores.homeworks[idx];
    if (
      active.role === 'teacher' &&
      existing.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'You may only update status for your own homework.'
      );
    }

    const wasDraft = existing.status === 'draft';
    const updated: HomeworkRecord = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.stores.homeworks[idx] = updated;
    if (wasDraft && status === 'published') {
      this.notifyHomeworkPublished(updated);
    }
    this.stores.saveHomework();
    return { ...updated };
  }

  async getTeacherHomeworkRosterAndSubmissions(actor: AuthPrincipal | null, homeworkId: string) {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const hw = this.stores.homeworks.find((h) => h.id === homeworkId);
    if (!hw) {
      throw new AssessmentServiceError('NOT_FOUND', `Homework "${homeworkId}" not found.`);
    }
    if (
      active.role === 'teacher' &&
      hw.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Access denied. You may only inspect submissions for your own homework.'
      );
    }

    const assignedStudents = getBatchActiveStudents(this.stores, hw.classId, hw.batchId);
    const submissionsForHw = this.stores.submissions.filter((s) => s.homeworkId === hw.id);
    const submittedStudentIds = new Set(
      submissionsForHw.map((s) => s.studentId.toUpperCase())
    );

    const submissions: TeacherSubmissionViewItem[] = submissionsForHw
      .map((s) => {
        const stuAcc = this.stores.academicStore.accountStore.findAccountById(s.studentId);
        return {
          submission: {
            ...s,
            revisionHistory: s.revisionHistory.map((r) => ({ ...r })),
          },
          studentName: stuAcc?.name ?? s.studentId,
          homeworkTitle: hw.title,
          maximumMarks: hw.maximumMarks,
        };
      })
      .sort((a, b) => a.submission.studentId.localeCompare(b.submission.studentId));

    const pendingStudents = assignedStudents.filter(
      (stu) => !submittedStudentIds.has(stu.studentId.toUpperCase())
    );

    const auditEntries = this.stores.homeworkAuditEntries
      .filter((a) => a.homeworkId === hw.id)
      .map((a) => ({ ...a }));

    return {
      homework: { ...hw },
      assignedStudents,
      submissions,
      pendingStudents,
      auditEntries,
    };
  }

  async listStudentHomework(actor: AuthPrincipal | null): Promise<StudentHomeworkItem[]> {
    const student = requireStudentActor(this.stores, actor, 'homework:read_assigned');
    const enrolment = getStudentActiveEnrolment(this.stores, student.loginId);
    if (!enrolment) {
      return [];
    }

    const normalizedStudent = student.loginId.toUpperCase();

    return this.stores.homeworks
      .filter(
        (hw) =>
          hw.classId === enrolment.classId &&
          hw.batchId === enrolment.batchId &&
          (hw.status === 'published' || hw.status === 'closed')
      )
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
      .map((hw) => {
        const names = lookupAcademicNames(this.stores, hw);
        const existing = this.stores.submissions.find(
          (s) => s.homeworkId === hw.id && s.studentId.toUpperCase() === normalizedStudent
        );
        const safeSub = existing ? toStudentSafeSubmission(existing) : null;
        const effectiveStatus = safeSub ? safeSub.status : 'assigned';
        const canSubmitOrResubmit =
          (!safeSub && hw.status === 'published') ||
          Boolean(
            safeSub &&
              (safeSub.status === 'returned_for_correction' || safeSub.reopenedByTeacher)
          );

        return {
          homework: { ...hw },
          className: names.className,
          batchName: names.batchName,
          subjectName: names.subjectName,
          teacherName: names.teacherName,
          indicator: getHomeworkComputedIndicator(hw),
          submission: safeSub,
          effectiveStatus,
          canSubmitOrResubmit,
        };
      });
  }

  async submitStudentHomework(
    actor: AuthPrincipal | null,
    homeworkId: string,
    responseText: string
  ): Promise<StudentSafeHomeworkSubmission> {
    const student = requireStudentActor(this.stores, actor, 'homework:read_assigned');
    const enrolment = getStudentActiveEnrolment(this.stores, student.loginId);
    if (!enrolment) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Active batch enrolment is required to submit homework.'
      );
    }

    const hw = this.stores.homeworks.find((h) => h.id === homeworkId);
    if (!hw) {
      throw new AssessmentServiceError('NOT_FOUND', `Homework "${homeworkId}" not found.`);
    }
    if (hw.classId !== enrolment.classId || hw.batchId !== enrolment.batchId) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'This homework does not belong to your enrolled class and batch.'
      );
    }
    if (hw.status === 'draft' || hw.status === 'archived') {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'This homework is not available for student submission.'
      );
    }

    const textCheck = validateRequiredText(responseText, 'Homework response', 1);
    if (!textCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', textCheck.error!, 'responseText');
    }

    const normalizedStudent = student.loginId.toUpperCase();
    const existingIdx = this.stores.submissions.findIndex(
      (s) => s.homeworkId === hw.id && s.studentId.toUpperCase() === normalizedStudent
    );
    const existing = existingIdx >= 0 ? this.stores.submissions[existingIdx] : undefined;

    if (!existing && hw.status === 'closed') {
      throw new AssessmentServiceError(
        'REVISION_NOT_ALLOWED',
        'This homework is closed for new submissions.'
      );
    }

    if (
      existing &&
      existing.status !== 'returned_for_correction' &&
      !existing.reopenedByTeacher
    ) {
      throw new AssessmentServiceError(
        'DUPLICATE_RECORD',
        'Homework has already been submitted and cannot be overwritten unless returned for correction or reopened.'
      );
    }

    const now = new Date().toISOString();
    const nowMs = new Date(now).getTime();
    const dueMs = new Date(hw.dueAt).getTime();
    const isLate = !Number.isNaN(dueMs) && nowMs > dueMs;
    const nextStatus = isLate ? 'late_submitted' : 'submitted';
    const trimmedResponse = responseText.trim();

    if (existing) {
      const nextRev = existing.revisionNumber + 1;
      const updated: HomeworkSubmission = {
        ...existing,
        responseText: trimmedResponse,
        submittedAt: now,
        status: nextStatus,
        reopenedByTeacher: false,
        revisionNumber: nextRev,
        revisionHistory: [
          ...existing.revisionHistory,
          {
            revisionNumber: nextRev,
            responseText: trimmedResponse,
            submittedAt: now,
            isLate,
          },
        ],
      };
      this.stores.submissions[existingIdx] = updated;
      this.stores.saveHomework();
      return toStudentSafeSubmission(updated);
    }

    const seq = this.stores.homeworkCounters.submissionSeq;
    const id = formatAssessmentId('HSUB', seq);
    this.stores.homeworkCounters.submissionSeq = seq + 1;

    const created: HomeworkSubmission = {
      id,
      homeworkId: hw.id,
      studentId: student.loginId.toUpperCase(),
      responseText: trimmedResponse,
      submittedAt: now,
      status: nextStatus,
      revisionNumber: 1,
      revisionHistory: [
        {
          revisionNumber: 1,
          responseText: trimmedResponse,
          submittedAt: now,
          isLate,
        },
      ],
    };

    this.stores.submissions = [created, ...this.stores.submissions];
    this.stores.saveHomework();
    return toStudentSafeSubmission(created);
  }

  async reviewHomeworkSubmission(
    actor: AuthPrincipal | null,
    input: ReviewHomeworkSubmissionInput
  ): Promise<HomeworkSubmission> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Only an authorized Teacher or Admin may review homework submissions.'
      );
    }

    const subIdx = this.stores.submissions.findIndex((s) => s.id === input.submissionId);
    if (subIdx === -1) {
      throw new AssessmentServiceError(
        'NOT_FOUND',
        `Homework submission "${input.submissionId}" not found.`
      );
    }
    const existing = this.stores.submissions[subIdx];
    const hw = this.stores.homeworks.find((h) => h.id === existing.homeworkId);
    if (!hw) {
      throw new AssessmentServiceError('NOT_FOUND', 'Parent homework record not found.');
    }

    if (
      active.role === 'teacher' &&
      hw.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'You may only review submissions for your own homework.'
      );
    }

    if (input.marksAwarded !== undefined) {
      if (!Number.isFinite(input.marksAwarded) || input.marksAwarded < 0) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          'Awarded marks cannot be negative.',
          'marksAwarded'
        );
      }
      if (hw.maximumMarks !== undefined && input.marksAwarded > hw.maximumMarks) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          `Awarded marks (${input.marksAwarded}) cannot exceed maximum marks (${hw.maximumMarks}).`,
          'marksAwarded'
        );
      }
    }

    const isMarksCorrection =
      existing.status === 'reviewed' &&
      existing.marksAwarded !== undefined &&
      input.marksAwarded !== undefined &&
      input.marksAwarded !== existing.marksAwarded;

    if (isMarksCorrection) {
      const reasonCheck = validateRequiredText(
        input.correctionReason ?? '',
        'Correction reason',
        5
      );
      if (!reasonCheck.valid) {
        throw new AssessmentServiceError(
          'CORRECTION_REASON_REQUIRED',
          reasonCheck.error!,
          'correctionReason'
        );
      }
    }

    if (input.action === 'returned_for_correction') {
      const fbCheck = validateRequiredText(input.feedback ?? '', 'Correction feedback', 3);
      if (!fbCheck.valid) {
        throw new AssessmentServiceError('VALIDATION_ERROR', fbCheck.error!, 'feedback');
      }
    }

    const now = new Date().toISOString();
    const feedback =
      input.feedback !== undefined ? input.feedback.trim() || undefined : existing.feedback;
    const privateTeacherNote =
      input.privateTeacherNote !== undefined
        ? input.privateTeacherNote.trim() || undefined
        : existing.privateTeacherNote;

    const updatedHistory = existing.revisionHistory.map((rev, index) => {
      if (index !== existing.revisionHistory.length - 1) {
        return { ...rev };
      }
      return {
        ...rev,
        reviewedBy: active.loginId,
        reviewedAt: now,
        reviewAction:
          input.action === 'returned_for_correction'
            ? ('returned_for_correction' as const)
            : ('reviewed' as const),
        feedback,
        marksAwarded:
          input.action === 'reopened'
            ? existing.marksAwarded
            : input.marksAwarded !== undefined
              ? input.marksAwarded
              : existing.marksAwarded,
      };
    });

    const nextStatus =
      input.action === 'returned_for_correction'
        ? 'returned_for_correction'
        : input.action === 'reviewed'
          ? 'reviewed'
          : existing.status;

    const updated: HomeworkSubmission = {
      ...existing,
      status: nextStatus,
      feedback,
      privateTeacherNote,
      marksAwarded:
        input.action === 'reopened'
          ? existing.marksAwarded
          : input.marksAwarded !== undefined
            ? input.marksAwarded
            : existing.marksAwarded,
      reviewedBy: active.loginId,
      reviewedAt: now,
      reopenedByTeacher: input.action === 'reopened' ? true : false,
      revisionHistory: updatedHistory,
    };

    this.stores.submissions[subIdx] = updated;

    this.appendHomeworkAudit({
      homeworkId: hw.id,
      submissionId: updated.id,
      actorId: active.loginId,
      action: isMarksCorrection ? 'marks_corrected' : input.action,
      previousValues: `status=${existing.status}, marks=${existing.marksAwarded ?? 'none'}`,
      newValues: `status=${updated.status}, marks=${updated.marksAwarded ?? 'none'}, reopened=${Boolean(updated.reopenedByTeacher)}`,
      reason: input.correctionReason?.trim() || feedback,
      timestamp: now,
    });

    if (input.action === 'reviewed' || input.action === 'returned_for_correction') {
      enqueueAssessmentNotification(this.stores, {
        recipientStudentId: updated.studentId,
        type:
          input.action === 'returned_for_correction'
            ? 'homework_returned'
            : 'homework_reviewed',
        relatedRecordId: hw.id,
        title:
          input.action === 'returned_for_correction'
            ? `Homework Returned for Correction: ${hw.title}`
            : `Homework Reviewed: ${hw.title}`,
        message:
          input.action === 'returned_for_correction'
            ? `Feedback: ${feedback ?? 'Please revise and resubmit.'}`
            : updated.marksAwarded !== undefined
              ? `Marks awarded: ${updated.marksAwarded}${hw.maximumMarks ? ` / ${hw.maximumMarks}` : ''}.`
              : 'Your homework response has been reviewed.',
        dedupeKey: `${input.action}:${updated.id}:rev${updated.revisionNumber}:${now}`,
      });
    }

    this.stores.saveHomework();
    return {
      ...updated,
      revisionHistory: updated.revisionHistory.map((r) => ({ ...r })),
    };
  }
}

export const localHomeworkService = new LocalDevHomeworkService();
