import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  Eye,
  Megaphone,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import type {
  StudentNotificationCategory,
  StudentUnifiedNotificationsData,
} from '../../services/contracts/studentPortalService';
import { studentPortalService } from '../../services';
import { cn } from '../../utils/cn';
import { formatDateTime, formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatusText } from '../ui/StatusText';

interface StudentNotificationsModuleProps {
  initialFocus?: 'notifications' | 'announcements';
  onNavigate?: (navId: string, subTab?: string) => void;
}

type AnnouncementFilter = 'all' | 'latest' | 'unread' | 'viewed';

const CATEGORY_TABS: Array<{
  id: StudentNotificationCategory;
  label: string;
}> = [
  { id: 'all', label: 'All Alerts' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'homework_tests', label: 'Homework & Tests' },
  { id: 'exams_results', label: 'Exams & Results' },
  { id: 'fees_receipts', label: 'Fees & Receipts' },
];

const ANNOUNCEMENT_FILTERS: Array<{
  id: AnnouncementFilter;
  label: string;
}> = [
  { id: 'all', label: 'All Notices' },
  { id: 'latest', label: 'Latest' },
  { id: 'unread', label: 'Unread' },
  { id: 'viewed', label: 'Previously Viewed' },
];

export function StudentNotificationsModule({
  initialFocus = 'notifications',
  onNavigate,
}: StudentNotificationsModuleProps) {
  const { principal } = useAuth();
  const { publicSettings } = useInterface();
  const notifPrefs = publicSettings.notificationPreferences;
  const [sectionTab, setSectionTab] = useState<'notifications' | 'announcements'>(
    initialFocus
  );
  const [categoryFilter, setCategoryFilter] =
    useState<StudentNotificationCategory>('all');
  const [unreadOnly, setUnreadOnly] = useState(
    () => notifPrefs.defaultFilterView === 'unread_only'
  );
  const [announcementFilter, setAnnouncementFilter] =
    useState<AnnouncementFilter>('all');

  const [data, setData] = useState<StudentUnifiedNotificationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSectionTab(initialFocus);
  }, [initialFocus]);

  const loadData = useCallback(async () => {
    if (!principal || principal.role !== 'student') {
      setError('Student authentication is required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res =
        await studentPortalService.getMyStudentNotificationsAndAnnouncements(
          principal
        );
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load notifications.'
      );
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!principal || principal.role !== 'student') {
    return (
      <Card title="Access Restricted">
        <p className="text-sm text-[#D94C5C] dark:text-[#F16B75]">
          Notifications and announcements are restricted to authenticated Student / Parent accounts.
        </p>
      </Card>
    );
  }

  const handleMarkNotificationRead = async (unifiedId: string) => {
    try {
      await studentPortalService.markStudentNotificationRead(principal, unifiedId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark notification read.');
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await studentPortalService.markAllStudentNotificationsRead(
        principal,
        categoryFilter
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark notifications read.');
    }
  };

  const handleMarkAnnouncementViewed = async (announcementId: string) => {
    try {
      await studentPortalService.markStudentAnnouncementViewed(
        principal,
        announcementId
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update announcement.');
    }
  };

  const handleMarkAllAnnouncementsViewed = async () => {
    try {
      await studentPortalService.markAllStudentAnnouncementsViewed(principal);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark announcements viewed.');
    }
  };

  const filteredNotifications = (data?.notifications ?? []).filter((n) => {
    if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
    if (unreadOnly && n.isRead) return false;
    return true;
  });

  const filteredAnnouncements = (data?.announcements ?? []).filter((item) => {
    if (announcementFilter === 'latest') return item.isLatest;
    if (announcementFilter === 'unread') return !item.isViewed;
    if (announcementFilter === 'viewed') return item.isViewed;
    return true;
  });

  const unreadInCurrentCategory =
    categoryFilter === 'all'
      ? data?.unreadTotal ?? 0
      : data?.unreadByCategory[categoryFilter] ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Student & Parent Portal · ${principal.loginId}`}
        title="Notifications & Announcements"
        subtitle="Centralized in-app updates across attendance, homework, tests, examinations, fees, and centre notices."
        rightSlot={
          <StatusText
            tone={
              (data?.unreadTotal ?? 0) + (data?.unreadAnnouncementsCount ?? 0) > 0
                ? 'warning'
                : 'nominal'
            }
            label={`${data?.unreadTotal ?? 0} alert(s) · ${data?.unreadAnnouncementsCount ?? 0} unread notice(s)`}
          />
        }
      />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/40 bg-[#D94C5C]/8 dark:bg-[#F16B75]/12 p-4 text-sm text-[#D94C5C] dark:text-[#F16B75]"
        >
          {error}
        </div>
      )}

      {/* Primary Section Switcher */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F1EEFA] dark:bg-[#202844]"
        role="tablist"
        aria-label="Notification center views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={sectionTab === 'notifications'}
          onClick={() => setSectionTab('notifications')}
          className={cn(
            'inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer',
            sectionTab === 'notifications'
              ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white'
              : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
          )}
        >
          <Bell className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            Notifications ({data?.unreadTotal ?? 0} unread)
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={sectionTab === 'announcements'}
          onClick={() => setSectionTab('announcements')}
          className={cn(
            'inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer',
            sectionTab === 'announcements'
              ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white'
              : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
          )}
        >
          <Megaphone className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            Announcements ({data?.announcements.length ?? 0})
          </span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-[#F1EEFA] dark:bg-[#202844] animate-pulse"
            />
          ))}
        </div>
      ) : sectionTab === 'notifications' ? (
        <Card
          title="Unified In-App Notification Centre"
          subtitle="Attendance, homework, online tests, exam results, and fee updates (in-app only — no SMS, WhatsApp, or email sent)."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setUnreadOnly((prev) => !prev)}
                className={cn(
                  'min-h-[40px] px-3 rounded-xl text-xs font-medium border cursor-pointer transition-colors',
                  unreadOnly
                    ? 'border-[#7552D9] bg-[#F1EEFA] text-[#7552D9] dark:border-[#8B5CF6] dark:bg-[#202844] dark:text-[#C4B5FD]'
                    : 'border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] text-[#687086] dark:text-[#A6B0C3]'
                )}
              >
                {unreadOnly ? 'Showing Unread Only' : 'Filter: Unread Only'}
              </button>
              {unreadInCurrentCategory > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleMarkAllNotificationsRead()}
                  iconLeft={<CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />}
                >
                  Mark All Read
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            {/* Category Filter Strip */}
            <div className="flex overflow-x-auto gap-1.5 pb-1">
              {CATEGORY_TABS.filter((cat) => {
                if (cat.id === 'attendance') return notifPrefs.enabledCategories.attendance;
                if (cat.id === 'homework_tests') return notifPrefs.enabledCategories.homeworkTests;
                if (cat.id === 'exams_results') return notifPrefs.enabledCategories.examsResults;
                if (cat.id === 'fees_receipts') return notifPrefs.enabledCategories.feesReceipts;
                return true;
              }).map((cat) => {
                const active = categoryFilter === cat.id;
                const unreadCat =
                  cat.id === 'all'
                    ? data?.unreadTotal ?? 0
                    : data?.unreadByCategory[cat.id] ?? 0;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={cn(
                      'min-h-[40px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer border transition-colors',
                      active
                        ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white border-[#7552D9] dark:border-[#8B5CF6]'
                        : 'bg-[#F8F9FC] dark:bg-[#101426] text-[#434960] dark:text-[#A6B0C3] border-[#E5E7EF] dark:border-[#303A55] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
                    )}
                  >
                    {cat.label}
                    {notifPrefs.showUnreadBadgesInNavigation && unreadCat > 0
                      ? ` (${unreadCat})`
                      : ''}
                  </button>
                );
              })}
            </div>

            {filteredNotifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-8 text-center space-y-2">
                <Bell
                  className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                  {unreadOnly
                    ? 'No unread notifications in this category'
                    : 'No notifications recorded in this category'}
                </p>
                <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                  Alerts appear automatically when teachers mark absence, publish homework or tests, release results, or Admin verifies fees.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                {filteredNotifications.map((notif) => (
                  <li
                    key={notif.id}
                    className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                        <StatusText tone={notif.tone} label={notif.typeLabel} />
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {notif.relatedRecordId}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {formatDateTime(notif.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        {notif.title}
                      </p>
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3] leading-relaxed">
                        {notif.message}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <StatusText
                        tone={notif.isRead ? 'neutral' : 'warning'}
                        label={notif.isRead ? 'Read' : 'Unread'}
                      />
                      {!notif.isRead && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleMarkNotificationRead(notif.id)}
                          iconLeft={<Check className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                          Mark Read
                        </Button>
                      )}
                      {onNavigate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onNavigate(notif.targetNavId, notif.targetSubTab)
                          }
                          iconRight={<ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                          Open
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ) : (
        <Card
          title="Centre & Batch Announcements"
          subtitle="Published notices scoped to Students, Parents, your Class, or your Batch (read-only)."
          action={
            (data?.unreadAnnouncementsCount ?? 0) > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleMarkAllAnnouncementsViewed()}
                iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Mark All Viewed
              </Button>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex overflow-x-auto gap-1.5 pb-1">
                {ANNOUNCEMENT_FILTERS.map((f) => {
                  const active = announcementFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAnnouncementFilter(f.id)}
                      className={cn(
                        'min-h-[40px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer border transition-colors',
                        active
                          ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white border-[#7552D9] dark:border-[#8B5CF6]'
                          : 'bg-[#F8F9FC] dark:bg-[#101426] text-[#434960] dark:text-[#A6B0C3] border-[#E5E7EF] dark:border-[#303A55] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
                      )}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                Read-only · Published by Tuition Centre Admin
              </span>
            </div>

            {filteredAnnouncements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-8 text-center space-y-2">
                <Megaphone
                  className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                  No announcements match this filter
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                {filteredAnnouncements.map((item) => {
                  const ann = item.announcement;
                  const scopeLabel =
                    ann.audience === 'all'
                      ? 'Centre-wide'
                      : ann.audience === 'students'
                        ? 'Students & Parents'
                        : ann.audience === 'class'
                          ? 'Class Notice'
                          : 'Batch Notice';
                  return (
                    <article
                      key={ann.announcementId}
                      className="py-4 first:pt-1 last:pb-1 space-y-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                            <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                              {ann.announcementId}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{scopeLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {formatShortDate(ann.publishedAt ?? ann.createdAt)}
                            </span>
                            {item.isLatest && (
                              <>
                                <span aria-hidden="true">·</span>
                                <StatusText tone="nominal" label="Latest" />
                              </>
                            )}
                          </div>
                          <h2 className="text-base font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                            {ann.title}
                          </h2>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <StatusText
                            tone={item.isViewed ? 'neutral' : 'warning'}
                            label={item.isViewed ? 'Viewed' : 'Unread'}
                          />
                          {!item.isViewed && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                void handleMarkAnnouncementViewed(ann.announcementId)
                              }
                            >
                              Mark Viewed
                            </Button>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-[#434960] dark:text-[#D4DCEB] whitespace-pre-line leading-relaxed">
                        {ann.content}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
