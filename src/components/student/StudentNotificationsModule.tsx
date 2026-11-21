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
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatusText } from '../ui/StatusText';
import { Tabs } from '../ui/Tabs';

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
        <p className="text-sm text-[var(--error)]">
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
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Primary Section Switcher */}
      <Tabs
        ariaLabel="Notification center views"
        value={sectionTab}
        onChange={setSectionTab}
        items={[
          {
            id: 'notifications',
            label: 'Notifications',
            count: data?.unreadTotal ?? 0,
            icon: <Bell className="w-4 h-4 shrink-0" aria-hidden="true" />,
          },
          {
            id: 'announcements',
            label: 'Announcements',
            count: data?.announcements.length ?? 0,
            icon: <Megaphone className="w-4 h-4 shrink-0" aria-hidden="true" />,
          },
        ]}
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-[var(--surface-secondary)] animate-pulse"
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
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'
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
            <Tabs
              ariaLabel="Filter notifications by category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              items={CATEGORY_TABS.filter((cat) => {
                if (cat.id === 'attendance') return notifPrefs.enabledCategories.attendance;
                if (cat.id === 'homework_tests') return notifPrefs.enabledCategories.homeworkTests;
                if (cat.id === 'exams_results') return notifPrefs.enabledCategories.examsResults;
                if (cat.id === 'fees_receipts') return notifPrefs.enabledCategories.feesReceipts;
                return true;
              }).map((cat) => {
                const unreadCat =
                  cat.id === 'all'
                    ? data?.unreadTotal ?? 0
                    : data?.unreadByCategory[cat.id] ?? 0;
                return {
                  id: cat.id,
                  label: cat.label,
                  count:
                    notifPrefs.showUnreadBadgesInNavigation && unreadCat > 0
                      ? unreadCat
                      : undefined,
                };
              })}
            />

            {filteredNotifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center space-y-2">
                <Bell
                  className="w-5 h-5 text-[var(--text-muted)] mx-auto"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {unreadOnly
                    ? 'No unread notifications in this category'
                    : 'No notifications recorded in this category'}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Alerts appear automatically when teachers mark absence, publish homework or tests, release results, or Admin verifies fees.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {filteredNotifications.map((notif) => (
                  <li
                    key={notif.id}
                    className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
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

                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {notif.title}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">
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
              <Tabs
                ariaLabel="Filter announcements"
                value={announcementFilter}
                onChange={setAnnouncementFilter}
                items={ANNOUNCEMENT_FILTERS}
              />
              <span className="text-xs text-[var(--text-muted)]">
                Read-only · Published by Tuition Centre Admin
              </span>
            </div>

            {filteredAnnouncements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center space-y-2">
                <Megaphone
                  className="w-5 h-5 text-[var(--text-muted)] mx-auto"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  No announcements match this filter
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
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
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                            <span className="font-mono font-semibold text-[var(--accent-text)]">
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
                          <h2 className="text-base font-semibold text-[var(--text-primary)]">
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

                      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
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
