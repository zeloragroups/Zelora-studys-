import type {
  AuthPrincipal,
  ExaminationDetailView,
  ExaminationMarks,
  ExaminationMarksResultStatus,
  ExaminationRecord,
  ExaminationStatus,
  MarksAuditEntry,
  StudentExaminationItem,
} from '../../types';
import { calculateScorePercentage } from '../../utils/assessmentCalculations';
import { formatShortDate } from '../../utils/formatters';
import {
  validateIsoDate,
  validateRequiredText,
  validateTimeRange,
} from '../../utils/validation';
import {
  AssessmentServiceError,
  type BulkMarksEntryInput,
  type CorrectMarksInput,
  type CreateExaminationInput,
  type IExaminationMarksService,
  type IExaminationService,
  type UpdateExaminationInput,
} from '../contracts/assessmentService';
import {
  enqueueAssessmentNotification,
  getBatchActiveStudents,
  getStudentActiveEnrolment,
  lookupAcademicNames,
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

function computeMarksResultStatus(
  marksObtained: number,
  passingMarks?: number
): ExaminationMarksResultStatus {
  if (passingMarks === undefined) {
    return 'recorded';
  }
  return marksObtained >= passingMarks ? 'pass' : 'fail';
}

export class LocalDevExaminationService
  implements IExaminationService, IExaminationMarksService
{
  private readonly stores: LocalAssessmentStores;

  constructor(stores: LocalAssessmentStores = sharedLocalAssessmentStores) {
    this.stores = stores;
  }

  private buildExaminationDetail(exam: ExaminationRecord): ExaminationDetailView {
    const names = lookupAcademicNames(this.stores, exam);
    const eligible = getBatchActiveStudents(this.stores, exam.classId, exam.batchId);
    const enteredCount = this.stores.examinationMarks.filter(
      (m) => m.examinationId === exam.id
    ).length;

    return {
      examination: { ...exam },
      className: names.className,
      batchName: names.batchName,
      subjectName: names.subjectName,
      teacherName: names.teacherName,
      eligibleStudentCount: eligible.length,
      marksEnteredCount: enteredCount,
    };
  }

  private notifyStudentsExamEvent(
    exam: ExaminationRecord,
    type: 'examination_published' | 'examination_updated'
  ): void {
    const roster = getBatchActiveStudents(this.stores, exam.classId, exam.batchId);
    const names = lookupAcademicNames(this.stores, exam);
    const suffix = type === 'examination_updated' ? `:${exam.updatedAt}` : '';
    for (const stu of roster) {
      enqueueAssessmentNotification(this.stores, {
        recipientStudentId: stu.studentId,
        type,
        relatedRecordId: exam.id,
        title:
          type === 'examination_published'
            ? `Examination Scheduled: ${exam.title}`
            : `Examination Updated: ${exam.title}`,
        message: `${names.subjectName} (${names.batchName}) on ${formatShortDate(exam.examDate)} · ${exam.startsAt}–${exam.endsAt} · Max ${exam.maximumMarks} marks.`,
        dedupeKey: `${type}:${exam.id}:${stu.studentId}${suffix}`,
      });
    }
    this.stores.saveHomework();
  }

  private notifyStudentExamMarksReleased(
    exam: ExaminationRecord,
    marks: ExaminationMarks
  ): void {
    const names = lookupAcademicNames(this.stores, exam);
    enqueueAssessmentNotification(this.stores, {
      recipientStudentId: marks.studentId,
      type: 'examination_marks_released',
      relatedRecordId: exam.id,
      title: `Examination Marks Released: ${exam.title}`,
      message: `${names.subjectName}: ${marks.marksObtained} / ${marks.maximumMarks} (${marks.percentage}%).`,
      dedupeKey: `examination_marks_released:${exam.id}:${marks.studentId}:${marks.releasedAt ?? ''}`,
    });
  }

  // -------------------- EXAMINATION MANAGEMENT --------------------

  async listTeacherExaminations(
    actor: AuthPrincipal | null
  ): Promise<ExaminationDetailView[]> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    return this.stores.examinations
      .filter((e) =>
        active.role === 'teacher'
          ? e.teacherId.toUpperCase() === active.loginId.toUpperCase()
          : true
      )
      .sort((a, b) => b.examDate.localeCompare(a.examDate))
      .map((e) => this.buildExaminationDetail(e));
  }

  async createExamination(
    actor: AuthPrincipal | null,
    input: CreateExaminationInput
  ): Promise<ExaminationRecord> {
    const teacher = requireTeacherActor(this.stores, actor, 'assessments:manage_assigned');

    const titleCheck = validateRequiredText(input.title, 'Examination title', 3);
    if (!titleCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', titleCheck.error!, 'title');
    }
    const instCheck = validateRequiredText(input.instructions, 'Examination instructions', 3);
    if (!instCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', instCheck.error!, 'instructions');
    }
    const dateCheck = validateIsoDate(input.examDate, 'Examination date');
    if (!dateCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', dateCheck.error!, 'examDate');
    }
    const timeCheck = validateTimeRange(input.startsAt, input.endsAt);
    if (!timeCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', timeCheck.error!, 'startsAt');
    }

    if (!Number.isFinite(input.maximumMarks) || input.maximumMarks <= 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Maximum marks must be greater than zero.',
        'maximumMarks'
      );
    }

    if (input.passingMarks !== undefined) {
      if (
        !Number.isFinite(input.passingMarks) ||
        input.passingMarks < 0 ||
        input.passingMarks > input.maximumMarks
      ) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          `Passing marks must be between 0 and maximum marks (${input.maximumMarks}).`,
          'passingMarks'
        );
      }
    }

    validateTeacherAcademicAssignment(this.stores, teacher.loginId, {
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
    });

    const normTitle = input.title.trim().toLowerCase();
    const duplicate = this.stores.examinations.find(
      (e) =>
        e.status !== 'archived' &&
        e.classId === input.classId &&
        e.batchId === input.batchId &&
        e.subjectId === input.subjectId &&
        e.examDate === input.examDate.trim() &&
        e.title.trim().toLowerCase() === normTitle
    );
    if (duplicate) {
      throw new AssessmentServiceError(
        'DUPLICATE_RECORD',
        `An examination "${duplicate.title}" is already scheduled for this batch and subject on ${duplicate.examDate}.`
      );
    }

    const seq = this.stores.examinationCounters.examinationSeq;
    const id = formatAssessmentId('EXM', seq);
    this.stores.examinationCounters.examinationSeq = seq + 1;
    const now = new Date().toISOString();

    const created: ExaminationRecord = {
      id,
      title: input.title.trim(),
      classId: input.classId,
      batchId: input.batchId,
      subjectId: input.subjectId,
      teacherId: teacher.loginId,
      examDate: input.examDate.trim(),
      startsAt: input.startsAt.trim(),
      endsAt: input.endsAt.trim(),
      maximumMarks: input.maximumMarks,
      passingMarks: input.passingMarks,
      instructions: input.instructions.trim(),
      status: input.publishImmediately ? 'published' : 'draft',
      resultsReleased: false,
      createdAt: now,
      updatedAt: now,
    };

    this.stores.examinations = [created, ...this.stores.examinations];
    if (created.status === 'published') {
      this.notifyStudentsExamEvent(created, 'examination_published');
    }
    this.stores.saveExaminations();
    return { ...created };
  }

  async updateExamination(
    actor: AuthPrincipal | null,
    examinationId: string,
    input: UpdateExaminationInput
  ): Promise<ExaminationRecord> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const idx = this.stores.examinations.findIndex((e) => e.id === examinationId);
    if (idx === -1) {
      throw new AssessmentServiceError(
        'NOT_FOUND',
        `Examination "${examinationId}" not found.`
      );
    }
    const existing = this.stores.examinations[idx];
    if (
      active.role === 'teacher' &&
      existing.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const nextTitle = input.title !== undefined ? input.title.trim() : existing.title;
    const titleCheck = validateRequiredText(nextTitle, 'Examination title', 3);
    if (!titleCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', titleCheck.error!, 'title');
    }

    const nextInstructions =
      input.instructions !== undefined ? input.instructions.trim() : existing.instructions;
    const instCheck = validateRequiredText(nextInstructions, 'Examination instructions', 3);
    if (!instCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', instCheck.error!, 'instructions');
    }

    const nextDate = input.examDate !== undefined ? input.examDate.trim() : existing.examDate;
    const dateCheck = validateIsoDate(nextDate, 'Examination date');
    if (!dateCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', dateCheck.error!, 'examDate');
    }

    const nextStarts = input.startsAt !== undefined ? input.startsAt.trim() : existing.startsAt;
    const nextEnds = input.endsAt !== undefined ? input.endsAt.trim() : existing.endsAt;
    const timeCheck = validateTimeRange(nextStarts, nextEnds);
    if (!timeCheck.valid) {
      throw new AssessmentServiceError('VALIDATION_ERROR', timeCheck.error!, 'startsAt');
    }

    const nextMaxMarks =
      input.maximumMarks !== undefined ? input.maximumMarks : existing.maximumMarks;
    if (!Number.isFinite(nextMaxMarks) || nextMaxMarks <= 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Maximum marks must be greater than zero.',
        'maximumMarks'
      );
    }

    const existingMarks = this.stores.examinationMarks.filter(
      (m) => m.examinationId === existing.id
    );
    if (existingMarks.length > 0 && nextMaxMarks !== existing.maximumMarks) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Maximum marks cannot be changed after marks have already been recorded.'
      );
    }

    let nextPassingMarks = existing.passingMarks;
    if (input.passingMarks === null) {
      nextPassingMarks = undefined;
    } else if (input.passingMarks !== undefined) {
      if (
        !Number.isFinite(input.passingMarks) ||
        input.passingMarks < 0 ||
        input.passingMarks > nextMaxMarks
      ) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          `Passing marks must be between 0 and ${nextMaxMarks}.`,
          'passingMarks'
        );
      }
      nextPassingMarks = input.passingMarks;
    } else if (nextPassingMarks !== undefined && nextPassingMarks > nextMaxMarks) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Existing passing marks exceed the new maximum marks.'
      );
    }

    const updated: ExaminationRecord = {
      ...existing,
      title: nextTitle,
      examDate: nextDate,
      startsAt: nextStarts,
      endsAt: nextEnds,
      maximumMarks: nextMaxMarks,
      passingMarks: nextPassingMarks,
      instructions: nextInstructions,
      updatedAt: new Date().toISOString(),
    };

    this.stores.examinations[idx] = updated;
    if (updated.status === 'published') {
      this.notifyStudentsExamEvent(updated, 'examination_updated');
    }
    this.stores.saveExaminations();
    return { ...updated };
  }

  async setExaminationStatus(
    actor: AuthPrincipal | null,
    examinationId: string,
    status: ExaminationStatus
  ): Promise<ExaminationRecord> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const idx = this.stores.examinations.findIndex((e) => e.id === examinationId);
    if (idx === -1) {
      throw new AssessmentServiceError(
        'NOT_FOUND',
        `Examination "${examinationId}" not found.`
      );
    }
    const existing = this.stores.examinations[idx];
    if (
      active.role === 'teacher' &&
      existing.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const wasDraft = existing.status === 'draft';
    const updated: ExaminationRecord = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.stores.examinations[idx] = updated;
    if (wasDraft && status === 'published') {
      this.notifyStudentsExamEvent(updated, 'examination_published');
    }
    this.stores.saveExaminations();
    return { ...updated };
  }

  async listStudentExaminations(
    actor: AuthPrincipal | null
  ): Promise<StudentExaminationItem[]> {
    const student = requireStudentActor(this.stores, actor, 'assessments:take_online_test');
    const enrolment = getStudentActiveEnrolment(this.stores, student.loginId);
    if (!enrolment) {
      return [];
    }

    const normalizedStu = student.loginId.toUpperCase();
    return this.stores.examinations
      .filter(
        (e) =>
          e.classId === enrolment.classId &&
          e.batchId === enrolment.batchId &&
          (e.status === 'published' || e.status === 'completed')
      )
      .sort((a, b) => a.examDate.localeCompare(b.examDate))
      .map((exam) => {
        const names = lookupAcademicNames(this.stores, exam);
        const marks = this.stores.examinationMarks.find(
          (m) => m.examinationId === exam.id && m.studentId.toUpperCase() === normalizedStu
        );
        return {
          examination: { ...exam },
          className: names.className,
          batchName: names.batchName,
          subjectName: names.subjectName,
          teacherName: names.teacherName,
          myMarks: exam.resultsReleased && marks ? { ...marks } : null,
          marksEnteredPendingRelease: Boolean(marks && !exam.resultsReleased),
        };
      });
  }

  // -------------------- MANUAL MARKS ENTRY & AUDITED CORRECTIONS --------------------

  async getExaminationMarksRoster(actor: AuthPrincipal | null, examinationId: string) {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const exam = this.stores.examinations.find((e) => e.id === examinationId);
    if (!exam) {
      throw new AssessmentServiceError(
        'NOT_FOUND',
        `Examination "${examinationId}" not found.`
      );
    }
    if (
      active.role === 'teacher' &&
      exam.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Access denied. You may only manage marks for your own examinations.'
      );
    }

    const eligibleStudents = getBatchActiveStudents(this.stores, exam.classId, exam.batchId);
    const marks = this.stores.examinationMarks
      .filter((m) => m.examinationId === exam.id)
      .map((m) => {
        const acc = this.stores.academicStore.accountStore.findAccountById(m.studentId);
        return {
          ...m,
          studentName: acc?.name ?? m.studentId,
        };
      })
      .sort((a, b) => a.studentId.localeCompare(b.studentId));

    const auditEntries: MarksAuditEntry[] = this.stores.marksAuditEntries
      .filter((a) => a.examinationId === exam.id)
      .map((a) => ({ ...a }));

    return {
      examination: { ...exam },
      eligibleStudents,
      marks,
      auditEntries,
    };
  }

  async submitBulkExaminationMarks(
    actor: AuthPrincipal | null,
    input: BulkMarksEntryInput
  ): Promise<ExaminationMarks[]> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const examIdx = this.stores.examinations.findIndex((e) => e.id === input.examinationId);
    if (examIdx === -1) {
      throw new AssessmentServiceError(
        'NOT_FOUND',
        `Examination "${input.examinationId}" not found.`
      );
    }
    const exam = this.stores.examinations[examIdx];
    if (
      active.role === 'teacher' &&
      exam.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }
    if (exam.status === 'draft' || exam.status === 'archived') {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Marks can only be entered for published or completed examinations.'
      );
    }

    const eligibleStudents = getBatchActiveStudents(this.stores, exam.classId, exam.batchId);
    if (eligibleStudents.length === 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'No active enrolled students found in this examination batch.'
      );
    }

    const existingForExam = this.stores.examinationMarks.filter(
      (m) => m.examinationId === exam.id
    );
    if (existingForExam.length > 0) {
      throw new AssessmentServiceError(
        'DUPLICATE_RECORD',
        'Examination marks have already been recorded. Use the audited marks correction workflow to update individual scores.'
      );
    }

    const eligibleSet = new Set(eligibleStudents.map((s) => s.studentId.toUpperCase()));
    const byStudent = new Map<string, number>();

    for (const entry of input.entries) {
      const stuId = entry.studentId.trim().toUpperCase();
      if (!eligibleSet.has(stuId)) {
        throw new AssessmentServiceError(
          'INVALID_REFERENCE',
          `Student "${entry.studentId}" is not an active student in this examination batch.`
        );
      }
      if (byStudent.has(stuId)) {
        throw new AssessmentServiceError(
          'DUPLICATE_RECORD',
          `Duplicate marks entry detected for student ${stuId}.`
        );
      }
      if (!Number.isFinite(entry.marksObtained)) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          `Enter valid numeric marks for student ${stuId}.`
        );
      }
      if (entry.marksObtained < 0 || entry.marksObtained > exam.maximumMarks) {
        throw new AssessmentServiceError(
          'VALIDATION_ERROR',
          `Marks for ${stuId} must be between 0 and ${exam.maximumMarks}.`
        );
      }
      byStudent.set(stuId, entry.marksObtained);
    }

    const missing = eligibleStudents.filter((s) => !byStudent.has(s.studentId.toUpperCase()));
    if (missing.length > 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        `Incomplete marks entry. Missing marks for: ${missing.map((m) => m.studentId).join(', ')}.`
      );
    }

    const now = new Date().toISOString();
    const released = Boolean(input.releaseImmediately);
    const createdRecords: ExaminationMarks[] = [];

    for (const stu of eligibleStudents) {
      const obtained = byStudent.get(stu.studentId.toUpperCase())!;
      const seq = this.stores.examinationCounters.marksSeq;
      const id = formatAssessmentId('EMRK', seq);
      this.stores.examinationCounters.marksSeq = seq + 1;

      const rec: ExaminationMarks = {
        id,
        examinationId: exam.id,
        studentId: stu.studentId,
        marksObtained: obtained,
        maximumMarks: exam.maximumMarks,
        percentage: calculateScorePercentage(obtained, exam.maximumMarks),
        resultStatus: computeMarksResultStatus(obtained, exam.passingMarks),
        enteredBy: active.loginId,
        enteredAt: now,
        updatedAt: now,
        releasedAt: released ? now : undefined,
      };
      createdRecords.push(rec);
    }

    this.stores.examinationMarks = [...createdRecords, ...this.stores.examinationMarks];
    this.stores.examinations[examIdx] = {
      ...exam,
      status: 'completed',
      resultsReleased: released ? true : exam.resultsReleased,
      updatedAt: now,
    };

    if (released) {
      for (const rec of createdRecords) {
        this.notifyStudentExamMarksReleased(exam, rec);
      }
      this.stores.saveHomework();
    }

    this.stores.saveExaminations();
    return createdRecords.map((r) => ({ ...r }));
  }

  async correctExaminationMarks(
    actor: AuthPrincipal | null,
    input: CorrectMarksInput
  ): Promise<ExaminationMarks> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'Students cannot modify examination marks.'
      );
    }

    const reasonCheck = validateRequiredText(input.reason, 'Correction reason', 5);
    if (!reasonCheck.valid) {
      throw new AssessmentServiceError(
        'CORRECTION_REASON_REQUIRED',
        reasonCheck.error!,
        'reason'
      );
    }

    const marksIdx = this.stores.examinationMarks.findIndex(
      (m) => m.id === input.marksRecordId
    );
    if (marksIdx === -1) {
      throw new AssessmentServiceError(
        'NOT_FOUND',
        `Marks record "${input.marksRecordId}" not found.`
      );
    }
    const existing = this.stores.examinationMarks[marksIdx];
    const exam = this.stores.examinations.find((e) => e.id === existing.examinationId);
    if (!exam) {
      throw new AssessmentServiceError('NOT_FOUND', 'Parent examination not found.');
    }

    if (
      active.role === 'teacher' &&
      exam.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError(
        'UNAUTHORIZED',
        'You may only correct marks for your own examinations.'
      );
    }

    if (
      !Number.isFinite(input.newMarksObtained) ||
      input.newMarksObtained < 0 ||
      input.newMarksObtained > exam.maximumMarks
    ) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        `Corrected marks must be between 0 and ${exam.maximumMarks}.`,
        'newMarksObtained'
      );
    }

    if (input.newMarksObtained === existing.marksObtained) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        `Marks are already recorded as ${existing.marksObtained}.`
      );
    }

    const now = new Date().toISOString();
    const updated: ExaminationMarks = {
      ...existing,
      marksObtained: input.newMarksObtained,
      percentage: calculateScorePercentage(input.newMarksObtained, exam.maximumMarks),
      resultStatus: computeMarksResultStatus(input.newMarksObtained, exam.passingMarks),
      updatedAt: now,
      corrected: true,
    };

    this.stores.examinationMarks[marksIdx] = updated;

    const audSeq = this.stores.examinationCounters.auditSeq;
    const audId = formatAssessmentId('MAUD', audSeq);
    this.stores.examinationCounters.auditSeq = audSeq + 1;

    const auditEntry: MarksAuditEntry = {
      id: audId,
      examinationId: exam.id,
      marksRecordId: updated.id,
      studentId: updated.studentId,
      actorId: active.loginId,
      previousMarks: existing.marksObtained,
      newMarks: updated.marksObtained,
      reason: input.reason.trim(),
      timestamp: now,
    };
    this.stores.marksAuditEntries = [auditEntry, ...this.stores.marksAuditEntries];

    this.stores.saveExaminations();
    return { ...updated };
  }

  async releaseExaminationResults(
    actor: AuthPrincipal | null,
    examinationId: string
  ): Promise<ExaminationRecord> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role !== 'teacher' && active.role !== 'admin') {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const idx = this.stores.examinations.findIndex((e) => e.id === examinationId);
    if (idx === -1) {
      throw new AssessmentServiceError(
        'NOT_FOUND',
        `Examination "${examinationId}" not found.`
      );
    }
    const existing = this.stores.examinations[idx];
    if (
      active.role === 'teacher' &&
      existing.teacherId.toUpperCase() !== active.loginId.toUpperCase()
    ) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }

    const marksCount = this.stores.examinationMarks.filter(
      (m) => m.examinationId === existing.id
    ).length;
    if (marksCount === 0) {
      throw new AssessmentServiceError(
        'VALIDATION_ERROR',
        'Enter marks before releasing examination results.'
      );
    }

    const now = new Date().toISOString();
    const updatedExam: ExaminationRecord = {
      ...existing,
      status: 'completed',
      resultsReleased: true,
      updatedAt: now,
    };
    this.stores.examinations[idx] = updatedExam;

    this.stores.examinationMarks = this.stores.examinationMarks.map((m) => {
      if (m.examinationId !== existing.id) {
        return m;
      }
      const nextMark: ExaminationMarks = {
        ...m,
        releasedAt: m.releasedAt ?? now,
      };
      this.notifyStudentExamMarksReleased(updatedExam, nextMark);
      return nextMark;
    });

    this.stores.saveHomework();
    this.stores.saveExaminations();
    return { ...updatedExam };
  }
}

export const localExaminationService = new LocalDevExaminationService();
