import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { OperationType } from '../../lib/firebase/firestore';
import {
  hasPermission,
  type AbsenceNotification,
  type AssessmentNotification,
  type AuthPrincipal,
  type FinancialNotification,
  type StudentEnrolment,
  type StudentWorkspaceData,
} from '../../types';
import { formatInrFromPaise } from '../../utils/currency';
import {
  StudentPortalError,
  type IStudentPortalService,
  type StudentActivityItem,
  type StudentAnnouncementViewItem,
  type StudentDashboardSummary,
  type StudentNotificationCategory,
  type StudentProfileSummary,
  type StudentUnifiedNotification,
  type StudentUnifiedNotificationsData,
} from '../contracts/studentPortalService';
import { firebaseAcademicService } from './firebaseAcademicService';
import {
  firebaseAssessmentOverviewService,
  firebaseExaminationService,
  firebaseHomeworkSubmissionService,
  firebaseTestAttemptService,
} from './firebaseAssessmentServices';
import { firebaseAttendanceService } from './firebaseAttendanceService';
import { firebaseFeeService } from './firebaseFinanceServices';
import { firebaseSettingsService } from './firebaseSettingsService';
import { requireFirestoreDb, requireVerifiedActor, withFirestoreErrorHandling } from './helpers';

const FIREBASE_STUDENT_VIEWS_KEY = 'tuition_firebase_student_views_v1';

type StudentAnnouncementViewsMap = Record<string, Record<string, string>>;

const IMMUTABLE_PROFILE_NOTICE =
  'Student ID, class, batch, and enrolment status are managed by the tuition centre Admin and cannot be edited by students or parents.';

function getSafeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getLocalIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class FirebaseStudentPortalService implements IStudentPortalService {
  private viewedAnnouncementsByStudent: StudentAnnouncementViewsMap = {};

  constructor() {
    this.loadViewedState();
  }

  private loadViewedState(): void {
    const storage = getSafeStorage();
    const raw = storage?.getItem(FIREBASE_STUDENT_VIEWS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as StudentAnnouncementViewsMap;
      if (parsed && typeof parsed === 'object') {
        this.viewedAnnouncementsByStudent = parsed;
      }
    } catch {
      storage?.removeItem(FIREBASE_STUDENT_VIEWS_KEY);
    }
  }

  private saveViewedState(): void {
    const storage = getSafeStorage();
    if (!storage) return;
    storage.setItem(FIREBASE_STUDENT_VIEWS_KEY, JSON.stringify(this.viewedAnnouncementsByStudent));
  }

  private requireActiveStudent(actor: AuthPrincipal | null): AuthPrincipal {
    try {
      const verified = requireVerifiedActor(actor, ['student']);
      if (!hasPermission(verified.role, 'attendance:read_personal')) {
        throw new StudentPortalError('UNAUTHORIZED', 'Access denied.');
      }
      return verified;
    } catch (error) {
      if (error instanceof StudentPortalError) throw error;
      throw new StudentPortalError(
        'UNAUTHORIZED',
        error instanceof Error
          ? error.message
          : 'Access denied. Only an authenticated active Student / Parent account may view this workspace.'
      );
    }
  }

  async getMyStudentProfile(actor: AuthPrincipal | null): Promise<StudentProfileSummary> {
    const student = this.requireActiveStudent(actor);
    const db = requireFirestoreDb();

    return withFirestoreErrorHandling(OperationType.GET, `users/${student.uid}`, async () => {
      const [userSnap, enrSnap, workspace] = await Promise.all([
        getDoc(doc(db, 'users', student.uid)),
        getDocs(query(collection(db, 'enrolments'), where('studentUid', '==', student.uid))),
        firebaseAcademicService.getMyStudentWorkspace(student),
      ]);

      if (!userSnap.exists()) {
        throw new StudentPortalError('NOT_FOUND', 'Student profile record was not found.');
      }
      const userData = userSnap.data();
      const hasInactiveEnrolment =
        !workspace.enrolment &&
        enrSnap.docs.some((d) => (d.data() as StudentEnrolment).status === 'inactive');

      return {
        studentId: String(userData.accountId || student.loginId),
        fullName: String(userData.name || student.fullName),
        phone: String(userData.phone || ''),
        accountStatus: userData.status === 'deactivated' ? 'deactivated' : 'active',
        enrolmentStatus: workspace.enrolment
          ? 'active'
          : hasInactiveEnrolment
            ? 'inactive'
            : 'not_enrolled',
        enrolmentId: workspace.enrolment?.enrolmentId,
        classId: workspace.enrolment?.classId,
        className: workspace.classRecord?.name,
        batchId: workspace.enrolment?.batchId,
        batchName: workspace.batchRecord?.name,
        enrolmentDate: workspace.enrolment?.enrolmentDate,
        sharedWithParent: true,
        immutableNotice: IMMUTABLE_PROFILE_NOTICE,
      };
    });
  }

  private mapAttendanceNotification(n: AbsenceNotification): StudentUnifiedNotification {
    const isCorrected = n.resolutionStatus === 'corrected_not_absent';
    return {
      id: `ATT:${n.id}`,
      source: 'attendance',
      sourceId: n.id,
      category: 'attendance',
      typeLabel: isCorrected ? 'Attendance Corrected' : 'Absence Alert',
      tone: isCorrected ? 'nominal' : 'danger',
      title: isCorrected
        ? `Attendance Corrected · ${n.subjectName}`
        : `Absence Recorded · ${n.subjectName}`,
      message:
        isCorrected && n.correctionNote
          ? `${n.correctionNote} (${n.absenceDate})`
          : `Marked Absent on ${n.absenceDate} (${
              n.attendanceType === 'examination'
                ? n.examTitle
                  ? `Exam: ${n.examTitle}`
                  : 'Examination'
                : 'Regular Class'
            }).`,
      relatedRecordId: n.attendanceRecordId,
      createdAt: n.createdAt,
      isRead: n.readByStudent,
      readAt: n.readByStudent ? n.createdAt : undefined,
      targetNavId: 'attendance',
      dedupeKey: `att:${n.id}`,
    };
  }

  private mapAssessmentNotification(n: AssessmentNotification): StudentUnifiedNotification {
    switch (n.type) {
      case 'homework_published':
        return {
          id: `ASM:${n.id}`,
          source: 'assessment',
          sourceId: n.id,
          category: 'homework_tests',
          typeLabel: 'Homework Published',
          tone: 'neutral',
          title: n.title,
          message: n.message,
          relatedRecordId: n.relatedRecordId,
          createdAt: n.createdAt,
          isRead: Boolean(n.readAt),
          readAt: n.readAt,
          targetNavId: 'homework',
          dedupeKey: `asm:${n.dedupeKey || n.id}`,
        };
      case 'homework_reviewed':
        return {
          id: `ASM:${n.id}`,
          source: 'assessment',
          sourceId: n.id,
          category: 'homework_tests',
          typeLabel: 'Homework Reviewed',
          tone: 'nominal',
          title: n.title,
          message: n.message,
          relatedRecordId: n.relatedRecordId,
          createdAt: n.createdAt,
          isRead: Boolean(n.readAt),
          readAt: n.readAt,
          targetNavId: 'homework',
          dedupeKey: `asm:${n.dedupeKey || n.id}`,
        };
      case 'homework_returned':
        return {
          id: `ASM:${n.id}`,
          source: 'assessment',
          sourceId: n.id,
          category: 'homework_tests',
          typeLabel: 'Revision Requested',
          tone: 'warning',
          title: n.title,
          message: n.message,
          relatedRecordId: n.relatedRecordId,
          createdAt: n.createdAt,
          isRead: Boolean(n.readAt),
          readAt: n.readAt,
          targetNavId: 'homework',
          dedupeKey: `asm:${n.dedupeKey || n.id}`,
        };
      case 'test_published':
        return {
          id: `ASM:${n.id}`,
          source: 'assessment',
          sourceId: n.id,
          category: 'homework_tests',
          typeLabel: 'Online Test Published',
          tone: 'neutral',
          title: n.title,
          message: n.message,
          relatedRecordId: n.relatedRecordId,
          createdAt: n.createdAt,
          isRead: Boolean(n.readAt),
          readAt: n.readAt,
          targetNavId: 'assessments',
          targetSubTab: 'tests',
          dedupeKey: `asm:${n.dedupeKey || n.id}`,
        };
      case 'test_result_released':
        return {
          id: `ASM:${n.id}`,
          source: 'assessment',
          sourceId: n.id,
          category: 'exams_results',
          typeLabel: 'Test Result Released',
          tone: 'nominal',
          title: n.title,
          message: n.message,
          relatedRecordId: n.relatedRecordId,
          createdAt: n.createdAt,
          isRead: Boolean(n.readAt),
          readAt: n.readAt,
          targetNavId: 'assessments',
          targetSubTab: 'results',
          dedupeKey: `asm:${n.dedupeKey || n.id}`,
        };
      case 'examination_published':
      case 'examination_updated':
        return {
          id: `ASM:${n.id}`,
          source: 'assessment',
          sourceId: n.id,
          category: 'exams_results',
          typeLabel:
            n.type === 'examination_updated' ? 'Exam Schedule Updated' : 'Examination Scheduled',
          tone: n.type === 'examination_updated' ? 'warning' : 'neutral',
          title: n.title,
          message: n.message,
          relatedRecordId: n.relatedRecordId,
          createdAt: n.createdAt,
          isRead: Boolean(n.readAt),
          readAt: n.readAt,
          targetNavId: 'assessments',
          targetSubTab: 'examinations',
          dedupeKey: `asm:${n.dedupeKey || n.id}`,
        };
      case 'examination_marks_released':
        return {
          id: `ASM:${n.id}`,
          source: 'assessment',
          sourceId: n.id,
          category: 'exams_results',
          typeLabel: 'Exam Marks Released',
          tone: 'nominal',
          title: n.title,
          message: n.message,
          relatedRecordId: n.relatedRecordId,
          createdAt: n.createdAt,
          isRead: Boolean(n.readAt),
          readAt: n.readAt,
          targetNavId: 'assessments',
          targetSubTab: 'results',
          dedupeKey: `asm:${n.dedupeKey || n.id}`,
        };
    }
  }

  private mapFinancialNotification(n: FinancialNotification): StudentUnifiedNotification {
    let typeLabel = 'Fee Update';
    let tone: StudentUnifiedNotification['tone'] = 'neutral';
    switch (n.notificationType) {
      case 'upcoming_due':
        typeLabel = 'Upcoming Fee Due';
        tone = 'warning';
        break;
      case 'due_today':
        typeLabel = 'Fee Due Today';
        tone = 'warning';
        break;
      case 'overdue_fee':
        typeLabel = 'Fee Overdue';
        tone = 'danger';
        break;
      case 'claim_received':
        typeLabel = 'Claim Submitted';
        tone = 'neutral';
        break;
      case 'payment_verified':
        typeLabel = 'Payment Verified';
        tone = 'nominal';
        break;
      case 'payment_rejected':
        typeLabel = 'Claim Rejected';
        tone = 'danger';
        break;
      case 'receipt_issued':
        typeLabel = 'Receipt Issued';
        tone = 'nominal';
        break;
    }

    return {
      id: `FIN:${n.id}`,
      source: 'finance',
      sourceId: n.id,
      category: 'fees_receipts',
      typeLabel,
      tone,
      title: n.title,
      message: n.message,
      relatedRecordId: n.relatedRecordId,
      createdAt: n.createdAt,
      isRead: Boolean(n.readAt),
      readAt: n.readAt,
      targetNavId: 'fees',
      dedupeKey: `fin:${n.dedupeKey || n.id}`,
    };
  }

  private buildAnnouncementsList(
    studentId: string,
    workspaceAnnouncements: StudentWorkspaceData['announcements']
  ): StudentAnnouncementViewItem[] {
    const normalizedId = studentId.trim().toUpperCase();
    const viewedMap = this.viewedAnnouncementsByStudent[normalizedId] ?? {};
    const nowMs = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const sorted = [...workspaceAnnouncements].sort((a, b) =>
      (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt)
    );

    return sorted.map((ann, idx) => {
      const refIso = ann.publishedAt ?? ann.createdAt;
      const ageMs = nowMs - new Date(refIso).getTime();
      const viewedAt = viewedMap[ann.announcementId];
      const isLatest = idx < 3 || (Number.isFinite(ageMs) && ageMs <= sevenDaysMs);
      return {
        announcement: ann,
        isLatest,
        isViewed: Boolean(viewedAt),
        viewedAt,
      };
    });
  }

  async getMyStudentNotificationsAndAnnouncements(
    actor: AuthPrincipal | null
  ): Promise<StudentUnifiedNotificationsData> {
    const student = this.requireActiveStudent(actor);
    const [workspace, attDash, resDash, feeDash, appSettings] = await Promise.all([
      firebaseAcademicService.getMyStudentWorkspace(student),
      firebaseAttendanceService.getMyStudentAttendance(student),
      firebaseAssessmentOverviewService.getStudentResultsDashboard(student),
      firebaseFeeService.getStudentFeeDashboard(student),
      firebaseSettingsService.getPublicBrandingAndSettings(),
    ]);

    const enabledCats = appSettings.notificationPreferences.enabledCategories;
    const isCategoryEnabled = (cat: StudentUnifiedNotification['category']): boolean => {
      switch (cat) {
        case 'attendance':
          return enabledCats.attendance;
        case 'homework_tests':
          return enabledCats.homeworkTests;
        case 'exams_results':
          return enabledCats.examsResults;
        case 'fees_receipts':
          return enabledCats.feesReceipts;
      }
    };

    const rawUnified: StudentUnifiedNotification[] = [
      ...attDash.notifications.map((n) => this.mapAttendanceNotification(n)),
      ...resDash.notifications.map((n) => this.mapAssessmentNotification(n)),
      ...feeDash.notifications.map((n) => this.mapFinancialNotification(n)),
    ];

    const seenKeys = new Set<string>();
    const notifications = rawUnified
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((item) => {
        if (!isCategoryEnabled(item.category)) return false;
        if (seenKeys.has(item.dedupeKey)) return false;
        seenKeys.add(item.dedupeKey);
        return true;
      });

    const unreadByCategory: Record<Exclude<StudentNotificationCategory, 'all'>, number> = {
      attendance: 0,
      homework_tests: 0,
      exams_results: 0,
      fees_receipts: 0,
    };
    for (const item of notifications) {
      if (!item.isRead) {
        unreadByCategory[item.category] += 1;
      }
    }
    const unreadTotal =
      unreadByCategory.attendance +
      unreadByCategory.homework_tests +
      unreadByCategory.exams_results +
      unreadByCategory.fees_receipts;

    const announcements = this.buildAnnouncementsList(student.loginId, workspace.announcements);
    const unreadAnnouncementsCount = announcements.filter((a) => !a.isViewed).length;

    return {
      notifications,
      unreadTotal,
      unreadByCategory,
      announcements,
      unreadAnnouncementsCount,
    };
  }

  async markStudentNotificationRead(
    actor: AuthPrincipal | null,
    unifiedNotificationId: string
  ): Promise<void> {
    const student = this.requireActiveStudent(actor);
    const [prefix, ...rest] = unifiedNotificationId.split(':');
    const sourceId = rest.join(':');
    if (!sourceId) {
      throw new StudentPortalError('VALIDATION_ERROR', 'Invalid notification identifier.');
    }
    if (prefix === 'ATT') {
      await firebaseAttendanceService.markNotificationAsRead(student, sourceId);
      return;
    }
    if (prefix === 'ASM') {
      await firebaseAssessmentOverviewService.markAssessmentNotificationRead(student, sourceId);
      return;
    }
    if (prefix === 'FIN') {
      await firebaseFeeService.markFinancialNotificationRead(student, sourceId);
      return;
    }
    throw new StudentPortalError('NOT_FOUND', 'Notification source not recognized.');
  }

  async markAllStudentNotificationsRead(
    actor: AuthPrincipal | null,
    category: StudentNotificationCategory = 'all'
  ): Promise<void> {
    const student = this.requireActiveStudent(actor);
    if (category === 'all') {
      await Promise.all([
        firebaseAttendanceService.markAllNotificationsAsRead(student),
        firebaseAssessmentOverviewService.markAllAssessmentNotificationsRead(student),
        firebaseFeeService.markAllFinancialNotificationsRead(student),
      ]);
      return;
    }

    const data = await this.getMyStudentNotificationsAndAnnouncements(student);
    const matchingUnread = data.notifications.filter((n) => n.category === category && !n.isRead);
    for (const item of matchingUnread) {
      await this.markStudentNotificationRead(student, item.id);
    }
  }

  async markStudentAnnouncementViewed(
    actor: AuthPrincipal | null,
    announcementId: string
  ): Promise<void> {
    const student = this.requireActiveStudent(actor);
    const workspace = await firebaseAcademicService.getMyStudentWorkspace(student);
    const visible = workspace.announcements.some((a) => a.announcementId === announcementId);
    if (!visible) {
      throw new StudentPortalError(
        'NOT_FOUND',
        'Announcement not found or not targeted to your student account.'
      );
    }
    const normalizedId = student.loginId.trim().toUpperCase();
    const current = this.viewedAnnouncementsByStudent[normalizedId] ?? {};
    if (!current[announcementId]) {
      this.viewedAnnouncementsByStudent = {
        ...this.viewedAnnouncementsByStudent,
        [normalizedId]: { ...current, [announcementId]: new Date().toISOString() },
      };
      this.saveViewedState();
    }
  }

  async markAllStudentAnnouncementsViewed(actor: AuthPrincipal | null): Promise<void> {
    const student = this.requireActiveStudent(actor);
    const workspace = await firebaseAcademicService.getMyStudentWorkspace(student);
    const normalizedId = student.loginId.trim().toUpperCase();
    const current = { ...(this.viewedAnnouncementsByStudent[normalizedId] ?? {}) };
    const nowIso = new Date().toISOString();
    let changed = false;
    for (const ann of workspace.announcements) {
      if (!current[ann.announcementId]) {
        current[ann.announcementId] = nowIso;
        changed = true;
      }
    }
    if (changed) {
      this.viewedAnnouncementsByStudent = {
        ...this.viewedAnnouncementsByStudent,
        [normalizedId]: current,
      };
      this.saveViewedState();
    }
  }

  async getMyStudentDashboard(actor: AuthPrincipal | null): Promise<StudentDashboardSummary> {
    const student = this.requireActiveStudent(actor);
    const [
      profile,
      workspace,
      attDash,
      hwItems,
      testItems,
      examItems,
      resDash,
      feeDash,
      notifBundle,
    ] = await Promise.all([
      this.getMyStudentProfile(student),
      firebaseAcademicService.getMyStudentWorkspace(student),
      firebaseAttendanceService.getMyStudentAttendance(student),
      firebaseHomeworkSubmissionService.listStudentHomework(student),
      firebaseTestAttemptService.listStudentAvailableTests(student),
      firebaseExaminationService.listStudentExaminations(student),
      firebaseAssessmentOverviewService.getStudentResultsDashboard(student),
      firebaseFeeService.getStudentFeeDashboard(student),
      this.getMyStudentNotificationsAndAnnouncements(student),
    ]);

    const nowMs = Date.now();
    const todayIso = getLocalIsoDate(new Date(nowMs));

    const upcomingHomework = hwItems
      .filter((item) => item.canSubmitOrResubmit)
      .sort((a, b) => a.homework.dueAt.localeCompare(b.homework.dueAt));

    const dueTodayHomeworkCount = upcomingHomework.filter(
      (item) => item.homework.dueAt.slice(0, 10) === todayIso
    ).length;

    const overdueHomeworkCount = upcomingHomework.filter(
      (item) => item.indicator === 'overdue' || new Date(item.homework.dueAt).getTime() < nowMs
    ).length;

    const upcomingOrAvailableTests = testItems
      .filter(
        (t) =>
          Boolean(t.inProgressAttempt) ||
          (t.effectiveStatus === 'active' && t.attemptsRemaining > 0) ||
          t.effectiveStatus === 'published'
      )
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    const upcomingExaminations = examItems
      .filter(
        (ex) =>
          ex.examination.examDate >= todayIso ||
          (ex.examination.status === 'published' && !ex.myMarks)
      )
      .sort((a, b) => a.examination.examDate.localeCompare(b.examination.examDate));

    const unpaidAccounts = feeDash.accounts
      .filter((acc) => acc.account.remainingBalancePaise > 0)
      .sort((a, b) => a.account.dueAt.localeCompare(b.account.dueAt));
    const nextDueAccount = unpaidAccounts[0] ?? null;
    const hasOverdueFees = feeDash.accounts.some(
      (acc) => acc.isOverdue || acc.account.status === 'overdue'
    );

    const rawActivity: StudentActivityItem[] = [];

    for (const hw of hwItems) {
      if (hw.submission?.reviewedAt) {
        rawActivity.push({
          id: `act-hw-rev-${hw.submission.id}`,
          dedupeKey: `hw-rev:${hw.submission.id}:${hw.submission.reviewedAt}`,
          category: 'homework',
          title:
            hw.submission.status === 'returned_for_correction'
              ? `Homework returned for revision: ${hw.homework.title}`
              : `Homework reviewed: ${hw.homework.title}`,
          detail:
            hw.submission.marksAwarded !== undefined
              ? `${hw.subjectName} · Marks: ${hw.submission.marksAwarded}${
                  hw.homework.maximumMarks ? `/${hw.homework.maximumMarks}` : ''
                }`
              : `${hw.subjectName} · Feedback posted`,
          timestamp: hw.submission.reviewedAt,
          tone: hw.submission.status === 'returned_for_correction' ? 'warning' : 'nominal',
          targetNavId: 'homework',
        });
      } else if (hw.submission?.submittedAt) {
        rawActivity.push({
          id: `act-hw-sub-${hw.submission.id}`,
          dedupeKey: `hw-sub:${hw.submission.id}:${hw.submission.revisionNumber}`,
          category: 'homework',
          title: `Homework submitted: ${hw.homework.title}`,
          detail: `${hw.subjectName} · Revision #${hw.submission.revisionNumber}`,
          timestamp: hw.submission.submittedAt,
          tone: hw.submission.status === 'late_submitted' ? 'warning' : 'nominal',
          targetNavId: 'homework',
        });
      } else {
        rawActivity.push({
          id: `act-hw-pub-${hw.homework.id}`,
          dedupeKey: `hw-pub:${hw.homework.id}`,
          category: 'homework',
          title: `Homework assigned: ${hw.homework.title}`,
          detail: `${hw.subjectName} · Due ${hw.homework.dueAt.slice(0, 10)}`,
          timestamp: hw.homework.assignedAt,
          tone: hw.indicator === 'overdue' ? 'danger' : 'neutral',
          targetNavId: 'homework',
        });
      }
    }

    for (const tst of testItems) {
      for (const att of tst.completedAttempts) {
        if (att.resultsVisible && att.resultReleasedAt) {
          rawActivity.push({
            id: `act-tst-res-${att.id}`,
            dedupeKey: `tst-res:${att.id}`,
            category: 'test',
            title: `Test result released: ${tst.title}`,
            detail: `${tst.subjectName} · ${att.marksObtained}/${att.totalMarks} (${att.percentage}%)`,
            timestamp: att.resultReleasedAt,
            tone: 'nominal',
            targetNavId: 'assessments',
            targetSubTab: 'results',
          });
        } else if (att.submittedAt) {
          rawActivity.push({
            id: `act-tst-sub-${att.id}`,
            dedupeKey: `tst-sub:${att.id}`,
            category: 'test',
            title: `Online test submitted: ${tst.title}`,
            detail: `${tst.subjectName} · Attempt #${att.attemptNumber}`,
            timestamp: att.submittedAt,
            tone: 'neutral',
            targetNavId: 'assessments',
            targetSubTab: 'tests',
          });
        }
      }
      if (tst.completedAttempts.length === 0 && tst.effectiveStatus !== 'completed') {
        rawActivity.push({
          id: `act-tst-open-${tst.id}`,
          dedupeKey: `tst-open:${tst.id}`,
          category: 'test',
          title: `Online test scheduled: ${tst.title}`,
          detail: `${tst.subjectName} · ${tst.questionCount} MCQs · ${tst.durationMinutes} min`,
          timestamp: tst.startsAt,
          tone: tst.effectiveStatus === 'active' ? 'nominal' : 'neutral',
          targetNavId: 'assessments',
          targetSubTab: 'tests',
        });
      }
    }

    for (const ex of examItems) {
      if (ex.myMarks) {
        rawActivity.push({
          id: `act-ex-res-${ex.myMarks.id}`,
          dedupeKey: `ex-res:${ex.myMarks.id}`,
          category: 'examination',
          title: `Exam marks released: ${ex.examination.title}`,
          detail: `${ex.subjectName} · ${ex.myMarks.marksObtained}/${ex.myMarks.maximumMarks} (${ex.myMarks.percentage}%)`,
          timestamp: ex.myMarks.releasedAt ?? ex.myMarks.updatedAt,
          tone: ex.myMarks.resultStatus === 'fail' ? 'danger' : 'nominal',
          targetNavId: 'assessments',
          targetSubTab: 'results',
        });
      }
    }

    for (const notif of attDash.notifications.slice(0, 5)) {
      rawActivity.push({
        id: `act-att-${notif.id}`,
        dedupeKey: `att:${notif.id}`,
        category: 'attendance',
        title:
          notif.resolutionStatus === 'corrected_not_absent'
            ? `Attendance corrected: ${notif.subjectName}`
            : `Absence alert: ${notif.subjectName}`,
        detail: `${notif.absenceDate} · ${notif.batchName}`,
        timestamp: notif.createdAt,
        tone: notif.resolutionStatus === 'corrected_not_absent' ? 'nominal' : 'danger',
        targetNavId: 'attendance',
      });
    }

    for (const rec of feeDash.receipts.filter((r) => r.status === 'issued').slice(0, 5)) {
      rawActivity.push({
        id: `act-rec-${rec.id}`,
        dedupeKey: `rec:${rec.id}`,
        category: 'fee',
        title: `Fee receipt issued (${rec.receiptNumber})`,
        detail: `${rec.periodLabel} · ${formatInrFromPaise(rec.amountPaise)} verified`,
        timestamp: rec.issuedAt,
        tone: 'nominal',
        targetNavId: 'fees',
      });
    }

    for (const claimView of feeDash.claims.slice(0, 5)) {
      if (claimView.claim.status !== 'verified') {
        rawActivity.push({
          id: `act-clm-${claimView.claim.id}`,
          dedupeKey: `clm:${claimView.claim.id}:${claimView.claim.status}`,
          category: 'fee',
          title:
            claimView.claim.status === 'rejected'
              ? `Payment claim rejected (${claimView.claim.paymentReference})`
              : `Payment claim pending verification (${claimView.claim.paymentReference})`,
          detail: `${claimView.periodLabel} · ${formatInrFromPaise(claimView.claim.amountPaise)}`,
          timestamp: claimView.claim.verifiedAt ?? claimView.claim.submittedAt,
          tone: claimView.claim.status === 'rejected' ? 'danger' : 'warning',
          targetNavId: 'fees',
        });
      }
    }

    const seenActivity = new Set<string>();
    const recentActivity = rawActivity
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .filter((item) => {
        if (seenActivity.has(item.dedupeKey)) return false;
        seenActivity.add(item.dedupeKey);
        return true;
      })
      .slice(0, 10);

    return {
      profile,
      workspace,
      attendanceSummary: attDash.summary,
      upcomingHomework,
      dueTodayHomeworkCount,
      overdueHomeworkCount,
      upcomingOrAvailableTests,
      upcomingExaminations,
      recentReleasedResults: resDash.results.slice(0, 5),
      releasedResultsCount: resDash.releasedCount,
      unreleasedPendingCount: resDash.unreleasedPendingCount,
      feeSummary: {
        totalDuePaise: feeDash.totalDuePaise,
        totalVerifiedPaidPaise: feeDash.totalVerifiedPaidPaise,
        totalPendingClaimsPaise: feeDash.totalPendingClaimsPaise,
        totalRemainingBalancePaise: feeDash.totalRemainingBalancePaise,
        nextDueDate: nextDueAccount ? nextDueAccount.account.dueAt : null,
        nextDuePeriodLabel: nextDueAccount ? nextDueAccount.account.periodLabel : null,
        hasOverdue: hasOverdueFees,
        feeAccountsCount: feeDash.accounts.length,
      },
      unreadNotificationCount: notifBundle.unreadTotal,
      unreadAnnouncementCount: notifBundle.unreadAnnouncementsCount,
      recentActivity,
    };
  }
}

export const firebaseStudentPortalService = new FirebaseStudentPortalService();
