import type {
  AnnouncementRecord,
  AttendanceSummaryStats,
  AuthPrincipal,
  StudentExaminationItem,
  StudentHomeworkItem,
  StudentObjectiveTestSummary,
  StudentUnifiedResultItem,
  StudentWorkspaceData,
} from '../../types';

export type StudentPortalErrorCode = 'UNAUTHORIZED' | 'NOT_FOUND' | 'VALIDATION_ERROR';

export class StudentPortalError extends Error {
  code: StudentPortalErrorCode;

  constructor(code: StudentPortalErrorCode, message: string) {
    super(message);
    this.name = 'StudentPortalError';
    this.code = code;
  }
}

export type StudentNotificationCategory =
  | 'all'
  | 'attendance'
  | 'homework_tests'
  | 'exams_results'
  | 'fees_receipts';

export type StudentTargetNavId =
  | 'dashboard'
  | 'learning'
  | 'homework'
  | 'academics'
  | 'attendance'
  | 'assessments'
  | 'fees'
  | 'notices'
  | 'profile';

export interface StudentUnifiedNotification {
  id: string; // Prefixed e.g. ATT:..., ASM:..., FIN:...
  source: 'attendance' | 'assessment' | 'finance';
  sourceId: string;
  category: Exclude<StudentNotificationCategory, 'all'>;
  typeLabel: string;
  tone: 'nominal' | 'warning' | 'danger' | 'neutral';
  title: string;
  message: string;
  relatedRecordId: string;
  createdAt: string;
  isRead: boolean;
  readAt?: string;
  targetNavId: StudentTargetNavId;
  targetSubTab?: string;
  dedupeKey: string;
}

export interface StudentAnnouncementViewItem {
  announcement: AnnouncementRecord;
  isLatest: boolean;
  isViewed: boolean;
  viewedAt?: string;
}

export interface StudentActivityItem {
  id: string;
  dedupeKey: string;
  category: 'homework' | 'test' | 'examination' | 'attendance' | 'fee';
  title: string;
  detail: string;
  timestamp: string;
  tone: 'nominal' | 'warning' | 'danger' | 'neutral';
  targetNavId: StudentTargetNavId;
  targetSubTab?: string;
}

export interface StudentProfileSummary {
  studentId: string;
  fullName: string;
  phone: string;
  accountStatus: 'active' | 'deactivated';
  enrolmentStatus: 'active' | 'inactive' | 'not_enrolled';
  enrolmentId?: string;
  classId?: string;
  className?: string;
  batchId?: string;
  batchName?: string;
  enrolmentDate?: string;
  sharedWithParent: boolean;
  immutableNotice: string;
}

export interface StudentDashboardSummary {
  profile: StudentProfileSummary;
  workspace: StudentWorkspaceData;
  attendanceSummary: AttendanceSummaryStats;
  upcomingHomework: StudentHomeworkItem[];
  dueTodayHomeworkCount: number;
  overdueHomeworkCount: number;
  upcomingOrAvailableTests: StudentObjectiveTestSummary[];
  upcomingExaminations: StudentExaminationItem[];
  recentReleasedResults: StudentUnifiedResultItem[];
  releasedResultsCount: number;
  unreleasedPendingCount: number;
  feeSummary: {
    totalDuePaise: number;
    totalVerifiedPaidPaise: number;
    totalPendingClaimsPaise: number;
    totalRemainingBalancePaise: number;
    nextDueDate: string | null;
    nextDuePeriodLabel: string | null;
    hasOverdue: boolean;
    feeAccountsCount: number;
  };
  unreadNotificationCount: number;
  unreadAnnouncementCount: number;
  recentActivity: StudentActivityItem[];
}

export interface StudentUnifiedNotificationsData {
  notifications: StudentUnifiedNotification[];
  unreadTotal: number;
  unreadByCategory: Record<Exclude<StudentNotificationCategory, 'all'>, number>;
  announcements: StudentAnnouncementViewItem[];
  unreadAnnouncementsCount: number;
}

export interface IStudentPortalService {
  getMyStudentProfile(actor: AuthPrincipal | null): Promise<StudentProfileSummary>;
  getMyStudentDashboard(actor: AuthPrincipal | null): Promise<StudentDashboardSummary>;
  getMyStudentNotificationsAndAnnouncements(
    actor: AuthPrincipal | null
  ): Promise<StudentUnifiedNotificationsData>;
  markStudentNotificationRead(
    actor: AuthPrincipal | null,
    unifiedNotificationId: string
  ): Promise<void>;
  markAllStudentNotificationsRead(
    actor: AuthPrincipal | null,
    category?: StudentNotificationCategory
  ): Promise<void>;
  markStudentAnnouncementViewed(
    actor: AuthPrincipal | null,
    announcementId: string
  ): Promise<void>;
  markAllStudentAnnouncementsViewed(actor: AuthPrincipal | null): Promise<void>;
}
