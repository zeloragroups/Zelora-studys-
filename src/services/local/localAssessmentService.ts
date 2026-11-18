import type {
  AdminAssessmentOverviewData,
  AdminAssessmentOverviewStats,
  AssessmentNotification,
  AuthPrincipal,
  ExaminationDetailView,
  StudentResultsDashboardData,
  StudentUnifiedResultItem,
  SubjectPerformanceAvailability,
  SubjectPerformanceSummary,
  TeacherHomeworkSummaryItem,
  TeacherObjectiveTestSummary,
  TeacherResultsWorkspaceData,
} from '../../types';
import {
  areTestResultsVisibleToStudent,
  calculateScorePercentage,
  getEffectiveTestStatus,
  getHomeworkComputedIndicator,
} from '../../utils/assessmentCalculations';
import {
  type AdminAssessmentFilter,
  AssessmentServiceError,
  type IAssessmentOverviewService,
  type StudentResultFilter,
} from '../contracts/assessmentService';
import {
  getBatchActiveStudents,
  getStudentActiveEnrolment,
  lookupAcademicNames,
  requireActiveActor,
  requireAdminActor,
  requireStudentActor,
  requireTeacherActor,
} from './localAssessmentHelpers';
import {
  LocalAssessmentStores,
  sharedLocalAssessmentStores,
} from './localAssessmentStores';

export class LocalDevAssessmentService implements IAssessmentOverviewService {
  private readonly stores: LocalAssessmentStores;

  constructor(stores: LocalAssessmentStores = sharedLocalAssessmentStores) {
    this.stores = stores;
  }

  async getStudentResultsDashboard(
    actor: AuthPrincipal | null,
    filter?: StudentResultFilter
  ): Promise<StudentResultsDashboardData> {
    const student = requireStudentActor(this.stores, actor, 'assessments:take_online_test');
    const enrolment = getStudentActiveEnrolment(this.stores, student.loginId);
    const normalizedId = student.loginId.toUpperCase();
    const nowMs = Date.now();

    const notifications = this.stores.notifications
      .filter((n) => n.recipientStudentId.toUpperCase() === normalizedId)
      .map((n) => ({ ...n }));
    const unreadNotificationCount = notifications.filter((n) => !n.readAt).length;

    if (!enrolment) {
      return {
        results: [],
        subjectSummaries: [],
        notifications,
        unreadNotificationCount,
        releasedCount: 0,
        unreleasedPendingCount: 0,
      };
    }

    const batchSubjects = this.stores.academicStore.subjects.filter(
      (s) => s.status === 'active' && s.classIds.includes(enrolment.classId)
    );
    const subjectNameMap = new Map(batchSubjects.map((s) => [s.subjectId, s.name]));
    const getSubjectName = (sid: string) =>
      subjectNameMap.get(sid) ??
      this.stores.academicStore.subjects.find((s) => s.subjectId === sid)?.name ??
      sid;

    const allReleasedItems: StudentUnifiedResultItem[] = [];
    let unreleasedPendingCount = 0;

    // 1. Examinations
    const batchExams = this.stores.examinations.filter(
      (e) =>
        e.classId === enrolment.classId &&
        e.batchId === enrolment.batchId &&
        (e.status === 'published' || e.status === 'completed')
    );
    for (const exam of batchExams) {
      const mark = this.stores.examinationMarks.find(
        (m) => m.examinationId === exam.id && m.studentId.toUpperCase() === normalizedId
      );
      if (exam.resultsReleased && mark) {
        allReleasedItems.push({
          id: mark.id,
          sourceType: 'examination',
          relatedId: exam.id,
          title: exam.title,
          subjectId: exam.subjectId,
          subjectName: getSubjectName(exam.subjectId),
          assessmentDate: exam.examDate,
          releasedAt: mark.releasedAt ?? mark.updatedAt,
          marksObtained: mark.marksObtained,
          maximumMarks: mark.maximumMarks,
          percentage: mark.percentage,
          resultStatus: mark.resultStatus,
        });
      } else {
        unreleasedPendingCount += 1;
      }
    }

    // 2. Objective Tests
    const batchTests = this.stores.tests.filter(
      (t) =>
        t.classId === enrolment.classId &&
        t.batchId === enrolment.batchId &&
        t.status !== 'draft' &&
        t.status !== 'archived'
    );
    for (const test of batchTests) {
      const attempts = this.stores.attempts.filter(
        (a) => a.testId === test.id && a.studentId.toUpperCase() === normalizedId
      );
      if (attempts.length === 0) {
        unreleasedPendingCount += 1;
        continue;
      }
      for (const att of attempts) {
        if (att.status === 'in_progress') {
          unreleasedPendingCount += 1;
          continue;
        }
        if (areTestResultsVisibleToStudent(test, att, nowMs)) {
          allReleasedItems.push({
            id: att.id,
            sourceType: 'objective_test',
            relatedId: test.id,
            title: test.title,
            subjectId: test.subjectId,
            subjectName: getSubjectName(test.subjectId),
            assessmentDate: att.submittedAt ?? test.startsAt,
            releasedAt: att.resultReleasedAt ?? att.evaluatedAt ?? att.submittedAt ?? test.endsAt,
            marksObtained: att.marksObtained ?? 0,
            maximumMarks: att.totalMarks,
            percentage: att.percentage ?? 0,
            resultStatus: 'recorded',
            attemptNumber: att.attemptNumber,
          });
        } else {
          unreleasedPendingCount += 1;
        }
      }
    }

    // 3. Reviewed Homework with maximumMarks & marksAwarded
    const batchHomework = this.stores.homeworks.filter(
      (h) =>
        h.classId === enrolment.classId &&
        h.batchId === enrolment.batchId &&
        (h.status === 'published' || h.status === 'closed') &&
        h.maximumMarks !== undefined &&
        h.maximumMarks > 0
    );
    for (const hw of batchHomework) {
      const sub = this.stores.submissions.find(
        (s) => s.homeworkId === hw.id && s.studentId.toUpperCase() === normalizedId
      );
      if (sub && sub.status === 'reviewed' && sub.marksAwarded !== undefined) {
        const max = hw.maximumMarks!;
        allReleasedItems.push({
          id: sub.id,
          sourceType: 'homework',
          relatedId: hw.id,
          title: hw.title,
          subjectId: hw.subjectId,
          subjectName: getSubjectName(hw.subjectId),
          assessmentDate: sub.submittedAt,
          releasedAt: sub.reviewedAt ?? sub.submittedAt,
          marksObtained: sub.marksAwarded,
          maximumMarks: max,
          percentage: calculateScorePercentage(sub.marksAwarded, max),
          resultStatus: 'recorded',
        });
      }
    }

    // Subject-wise Performance Summaries covering every mapped subject honestly
    const subjectSummaries: SubjectPerformanceSummary[] = batchSubjects.map((sub) => {
      const releasedForSub = allReleasedItems.filter((r) => r.subjectId === sub.subjectId);
      const subExams = batchExams.filter((e) => e.subjectId === sub.subjectId);
      const subTests = batchTests.filter((t) => t.subjectId === sub.subjectId);
      const subScoredHomework = batchHomework.filter((h) => h.subjectId === sub.subjectId);

      const totalScoped = subExams.length + subTests.length + subScoredHomework.length;

      let hasUnreleasedSubmitted = false;
      for (const ex of subExams) {
        const m = this.stores.examinationMarks.find(
          (mk) => mk.examinationId === ex.id && mk.studentId.toUpperCase() === normalizedId
        );
        if (m && !ex.resultsReleased) {
          hasUnreleasedSubmitted = true;
        }
      }
      for (const tst of subTests) {
        const atts = this.stores.attempts.filter(
          (a) =>
            a.testId === tst.id &&
            a.studentId.toUpperCase() === normalizedId &&
            a.status !== 'in_progress'
        );
        if (atts.some((a) => !areTestResultsVisibleToStudent(tst, a, nowMs))) {
          hasUnreleasedSubmitted = true;
        }
      }

      if (releasedForSub.length > 0) {
        const obtained = releasedForSub.reduce((acc, r) => acc + r.marksObtained, 0);
        const max = releasedForSub.reduce((acc, r) => acc + r.maximumMarks, 0);
        const pct = calculateScorePercentage(obtained, max);
        const latest = [...releasedForSub].sort((a, b) =>
          b.releasedAt.localeCompare(a.releasedAt)
        )[0];
        return {
          subjectId: sub.subjectId,
          subjectName: sub.name,
          availability: 'result_available' as SubjectPerformanceAvailability,
          releasedAssessmentsCount: releasedForSub.length,
          pendingAssessmentsCount: Math.max(0, totalScoped - releasedForSub.length),
          totalMarksObtained: obtained,
          totalMaximumMarks: max,
          percentage: pct,
          displayPercentage: `${pct}%`,
          latestResultTitle: latest?.title,
          latestResultDisplay: latest
            ? `${latest.marksObtained}/${latest.maximumMarks} (${latest.percentage}%)`
            : undefined,
          latestReleasedAt: latest?.releasedAt,
        };
      }

      if (hasUnreleasedSubmitted) {
        return {
          subjectId: sub.subjectId,
          subjectName: sub.name,
          availability: 'result_not_released' as SubjectPerformanceAvailability,
          releasedAssessmentsCount: 0,
          pendingAssessmentsCount: totalScoped,
          totalMarksObtained: 0,
          totalMaximumMarks: 0,
          percentage: null,
          displayPercentage: 'Not released',
        };
      }

      if (totalScoped > 0) {
        return {
          subjectId: sub.subjectId,
          subjectName: sub.name,
          availability: 'assessment_pending' as SubjectPerformanceAvailability,
          releasedAssessmentsCount: 0,
          pendingAssessmentsCount: totalScoped,
          totalMarksObtained: 0,
          totalMaximumMarks: 0,
          percentage: null,
          displayPercentage: 'Pending',
        };
      }

      return {
        subjectId: sub.subjectId,
        subjectName: sub.name,
        availability: 'no_assessment_yet' as SubjectPerformanceAvailability,
        releasedAssessmentsCount: 0,
        pendingAssessmentsCount: 0,
        totalMarksObtained: 0,
        totalMaximumMarks: 0,
        percentage: null,
        displayPercentage: 'No assessment yet',
      };
    });

    const filteredResults = allReleasedItems
      .filter((item) => {
        if (filter?.subjectId && filter.subjectId !== 'all' && item.subjectId !== filter.subjectId) {
          return false;
        }
        if (filter?.sourceType && filter.sourceType !== 'all' && item.sourceType !== filter.sourceType) {
          return false;
        }
        if (filter?.examinationId && filter.examinationId !== 'all') {
          if (item.sourceType !== 'examination' || item.relatedId !== filter.examinationId) {
            return false;
          }
        }
        if (filter?.testId && filter.testId !== 'all') {
          if (item.sourceType !== 'objective_test' || item.relatedId !== filter.testId) {
            return false;
          }
        }
        if (filter?.resultStatus && filter.resultStatus !== 'all') {
          if (item.resultStatus !== filter.resultStatus) return false;
        }
        const dateOnly = item.assessmentDate.slice(0, 10);
        if (filter?.dateFrom && dateOnly < filter.dateFrom) return false;
        if (filter?.dateTo && dateOnly > filter.dateTo) return false;
        if (filter?.month && filter.month !== 'all' && dateOnly.slice(0, 7) !== filter.month) {
          return false;
        }
        if (filter?.year && filter.year !== 'all' && dateOnly.slice(0, 4) !== filter.year) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));

    return {
      results: filteredResults,
      subjectSummaries,
      notifications,
      unreadNotificationCount,
      releasedCount: allReleasedItems.length,
      unreleasedPendingCount,
    };
  }

  async getTeacherResultsWorkspace(
    actor: AuthPrincipal | null
  ): Promise<TeacherResultsWorkspaceData> {
    const teacher = requireTeacherActor(this.stores, actor, 'assessments:manage_assigned');
    const normalized = teacher.loginId.toUpperCase();
    const accountStore = this.stores.academicStore.accountStore;

    const testResults = this.stores.tests
      .filter((t) => t.teacherId.toUpperCase() === normalized)
      .map((test) => {
        const names = lookupAcademicNames(this.stores, test);
        const attempts = this.stores.attempts
          .filter((a) => a.testId === test.id)
          .map((a) => ({
            ...a,
            answers: { ...a.answers },
            studentName: accountStore.findAccountById(a.studentId)?.name ?? a.studentId,
          }));
        return {
          test: { ...test, questions: test.questions.map((q) => ({ ...q })) },
          subjectName: names.subjectName,
          className: names.className,
          batchName: names.batchName,
          attempts,
        };
      });

    const examinationResults = this.stores.examinations
      .filter((e) => e.teacherId.toUpperCase() === normalized)
      .map((examination) => {
        const names = lookupAcademicNames(this.stores, examination);
        const eligible = getBatchActiveStudents(
          this.stores,
          examination.classId,
          examination.batchId
        );
        const marks = this.stores.examinationMarks
          .filter((m) => m.examinationId === examination.id)
          .map((m) => ({
            ...m,
            studentName: accountStore.findAccountById(m.studentId)?.name ?? m.studentId,
          }));
        return {
          examination: { ...examination },
          subjectName: names.subjectName,
          className: names.className,
          batchName: names.batchName,
          marks,
          pendingStudentCount: Math.max(0, eligible.length - marks.length),
        };
      });

    const homeworkResults = this.stores.homeworks
      .filter((h) => h.teacherId.toUpperCase() === normalized)
      .map((homework) => {
        const names = lookupAcademicNames(this.stores, homework);
        const submissions = this.stores.submissions
          .filter((s) => s.homeworkId === homework.id)
          .map((s) => ({
            ...s,
            revisionHistory: s.revisionHistory.map((r) => ({ ...r })),
            studentName: accountStore.findAccountById(s.studentId)?.name ?? s.studentId,
          }));
        return {
          homework: { ...homework },
          subjectName: names.subjectName,
          className: names.className,
          batchName: names.batchName,
          submissions,
        };
      });

    return {
      testResults,
      examinationResults,
      homeworkResults,
    };
  }

  async getAdminAssessmentOverview(
    actor: AuthPrincipal | null,
    filter?: AdminAssessmentFilter
  ): Promise<AdminAssessmentOverviewData> {
    requireAdminActor(this.stores, actor);
    const nowMs = Date.now();
    const todayDate = new Date(nowMs).toISOString().slice(0, 10);

    // Centre-wide 11 KPIs
    let pendingHomeworkSubmissions = 0;
    let reviewedHomeworkSubmissions = 0;
    for (const hw of this.stores.homeworks) {
      if (hw.status === 'published' || hw.status === 'closed') {
        const roster = getBatchActiveStudents(this.stores, hw.classId, hw.batchId);
        const eligibleSet = new Set(roster.map((s) => s.studentId.toUpperCase()));
        const subs = this.stores.submissions.filter(
          (s) => s.homeworkId === hw.id && eligibleSet.has(s.studentId.toUpperCase())
        );
        const rev = subs.filter((s) => s.status === 'reviewed').length;
        reviewedHomeworkSubmissions += rev;
        pendingHomeworkSubmissions += Math.max(0, roster.length - subs.length);
      }
    }

    let pendingMarksEntry = 0;
    for (const ex of this.stores.examinations) {
      if (ex.status === 'published' || ex.status === 'completed') {
        const roster = getBatchActiveStudents(this.stores, ex.classId, ex.batchId);
        const entered = this.stores.examinationMarks.filter(
          (m) => m.examinationId === ex.id
        ).length;
        if (entered < roster.length) {
          pendingMarksEntry += roster.length - entered;
        }
      }
    }

    const releasedTestsCount = this.stores.tests.filter(
      (t) =>
        t.status !== 'draft' &&
        t.status !== 'archived' &&
        (Boolean(t.manualResultsReleased) ||
          t.resultReleaseMode === 'auto_after_submission' ||
          (t.resultReleaseMode === 'scheduled_after_end' &&
            nowMs >= new Date(t.scheduledReleaseAt ?? t.endsAt).getTime()))
    ).length;

    const stats: AdminAssessmentOverviewStats = {
      totalHomeworkCreated: this.stores.homeworks.length,
      publishedHomework: this.stores.homeworks.filter((h) => h.status === 'published').length,
      pendingHomeworkSubmissions,
      reviewedHomeworkSubmissions,
      totalObjectiveTests: this.stores.tests.length,
      publishedTests: this.stores.tests.filter(
        (t) => t.status === 'published' || t.status === 'active'
      ).length,
      completedTestAttempts: this.stores.attempts.filter(
        (a) => a.status !== 'in_progress'
      ).length,
      upcomingExaminations: this.stores.examinations.filter(
        (e) => e.status === 'published' && e.examDate >= todayDate
      ).length,
      completedExaminations: this.stores.examinations.filter(
        (e) => e.status === 'completed'
      ).length,
      pendingMarksEntry,
      releasedResults:
        this.stores.examinations.filter((e) => e.resultsReleased).length +
        releasedTestsCount,
    };

    const studentSearch = filter?.studentIdSearch?.trim().toLowerCase() ?? '';
    const matchesCommon = (rec: {
      classId: string;
      batchId: string;
      subjectId: string;
      teacherId: string;
    }) => {
      if (filter?.classId && filter.classId !== 'all' && rec.classId !== filter.classId) {
        return false;
      }
      if (filter?.batchId && filter.batchId !== 'all' && rec.batchId !== filter.batchId) {
        return false;
      }
      if (filter?.subjectId && filter.subjectId !== 'all' && rec.subjectId !== filter.subjectId) {
        return false;
      }
      if (
        filter?.teacherId &&
        filter.teacherId !== 'all' &&
        rec.teacherId.toUpperCase() !== filter.teacherId.toUpperCase()
      ) {
        return false;
      }
      return true;
    };

    const matchesStudentScope = (classId: string, batchId: string) => {
      if (!studentSearch) return true;
      const roster = getBatchActiveStudents(this.stores, classId, batchId);
      return roster.some(
        (s) =>
          s.studentId.toLowerCase().includes(studentSearch) ||
          s.studentName.toLowerCase().includes(studentSearch)
      );
    };

    const homework: TeacherHomeworkSummaryItem[] = this.stores.homeworks
      .filter((hw) => {
        if (!matchesCommon(hw)) return false;
        if (filter?.homeworkId && hw.id !== filter.homeworkId) return false;
        if (filter?.date && hw.dueAt.slice(0, 10) !== filter.date && hw.assignedAt.slice(0, 10) !== filter.date) {
          return false;
        }
        if (filter?.status && filter.status !== 'all' && hw.status !== filter.status) {
          return false;
        }
        if (!matchesStudentScope(hw.classId, hw.batchId)) return false;
        return true;
      })
      .map((hw) => {
        const names = lookupAcademicNames(this.stores, hw);
        const roster = getBatchActiveStudents(this.stores, hw.classId, hw.batchId);
        const eligibleSet = new Set(roster.map((s) => s.studentId.toUpperCase()));
        const subs = this.stores.submissions.filter(
          (s) => s.homeworkId === hw.id && eligibleSet.has(s.studentId.toUpperCase())
        );
        return {
          homework: { ...hw },
          className: names.className,
          batchName: names.batchName,
          subjectName: names.subjectName,
          indicator: getHomeworkComputedIndicator(hw, nowMs),
          totalAssignedStudents: roster.length,
          submittedCount: subs.length,
          reviewedCount: subs.filter((s) => s.status === 'reviewed').length,
          pendingCount: Math.max(0, roster.length - subs.length),
        };
      });

    const tests: TeacherObjectiveTestSummary[] = this.stores.tests
      .filter((t) => {
        if (!matchesCommon(t)) return false;
        if (filter?.testId && t.id !== filter.testId) return false;
        if (
          filter?.date &&
          t.startsAt.slice(0, 10) !== filter.date &&
          t.endsAt.slice(0, 10) !== filter.date
        ) {
          return false;
        }
        if (
          filter?.status &&
          filter.status !== 'all' &&
          getEffectiveTestStatus(t, nowMs) !== filter.status &&
          t.status !== filter.status
        ) {
          return false;
        }
        if (!matchesStudentScope(t.classId, t.batchId)) return false;
        return true;
      })
      .map((t) => {
        const names = lookupAcademicNames(this.stores, t);
        const testAttempts = this.stores.attempts.filter((a) => a.testId === t.id);
        return {
          test: { ...t, questions: t.questions.map((q) => ({ ...q })) },
          className: names.className,
          batchName: names.batchName,
          subjectName: names.subjectName,
          effectiveStatus: getEffectiveTestStatus(t, nowMs),
          attemptCount: testAttempts.length,
          evaluatedCount: testAttempts.filter((a) => a.status === 'evaluated').length,
        };
      });

    const examinations: ExaminationDetailView[] = this.stores.examinations
      .filter((e) => {
        if (!matchesCommon(e)) return false;
        if (filter?.examinationId && e.id !== filter.examinationId) return false;
        if (filter?.date && e.examDate !== filter.date) return false;
        if (filter?.status && filter.status !== 'all' && e.status !== filter.status) {
          return false;
        }
        if (!matchesStudentScope(e.classId, e.batchId)) return false;
        return true;
      })
      .map((e) => {
        const names = lookupAcademicNames(this.stores, e);
        const roster = getBatchActiveStudents(this.stores, e.classId, e.batchId);
        const entered = this.stores.examinationMarks.filter(
          (m) => m.examinationId === e.id
        ).length;
        return {
          examination: { ...e },
          className: names.className,
          batchName: names.batchName,
          subjectName: names.subjectName,
          teacherName: names.teacherName,
          eligibleStudentCount: roster.length,
          marksEnteredCount: entered,
        };
      });

    return {
      stats,
      homework,
      tests,
      examinations,
      marksAuditEntries: this.stores.marksAuditEntries.map((a) => ({ ...a })),
      homeworkAuditEntries: this.stores.homeworkAuditEntries.map((a) => ({ ...a })),
    };
  }

  async listMyAssessmentNotifications(
    actor: AuthPrincipal | null
  ): Promise<AssessmentNotification[]> {
    const active = requireActiveActor(this.stores, actor);
    if (active.role === 'student') {
      const normalized = active.loginId.toUpperCase();
      return this.stores.notifications
        .filter((n) => n.recipientStudentId.toUpperCase() === normalized)
        .map((n) => ({ ...n }));
    }
    if (active.role === 'admin') {
      return this.stores.notifications.map((n) => ({ ...n }));
    }
    return [];
  }

  async markAssessmentNotificationRead(
    actor: AuthPrincipal | null,
    notificationId: string
  ): Promise<AssessmentNotification> {
    const student = requireStudentActor(this.stores, actor, 'homework:read_assigned');
    const idx = this.stores.notifications.findIndex((n) => n.id === notificationId);
    if (idx === -1) {
      throw new AssessmentServiceError(
        'NOT_FOUND',
        `Notification "${notificationId}" not found.`
      );
    }
    const existing = this.stores.notifications[idx];
    if (existing.recipientStudentId.toUpperCase() !== student.loginId.toUpperCase()) {
      throw new AssessmentServiceError('UNAUTHORIZED', 'Access denied.');
    }
    const updated: AssessmentNotification = {
      ...existing,
      readAt: existing.readAt ?? new Date().toISOString(),
    };
    this.stores.notifications[idx] = updated;
    this.stores.saveHomework();
    return { ...updated };
  }

  async markAllAssessmentNotificationsRead(actor: AuthPrincipal | null): Promise<void> {
    const student = requireStudentActor(this.stores, actor, 'homework:read_assigned');
    const normalized = student.loginId.toUpperCase();
    const now = new Date().toISOString();
    this.stores.notifications = this.stores.notifications.map((n) =>
      n.recipientStudentId.toUpperCase() === normalized
        ? { ...n, readAt: n.readAt ?? now }
        : n
    );
    this.stores.saveHomework();
  }
}

export const localAssessmentService = new LocalDevAssessmentService();
