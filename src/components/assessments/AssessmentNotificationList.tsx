import { Bell, CheckCheck } from 'lucide-react';
import type { AssessmentNotification } from '../../types';
import { formatDateTime } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { StatusText, type SemanticTone } from '../ui/StatusText';

interface AssessmentNotificationListProps {
  notifications: AssessmentNotification[];
  unreadCount: number;
  onMarkRead?: (notificationId: string) => void;
  onMarkAllRead?: () => void;
  title?: string;
  subtitle?: string;
  compact?: boolean;
  readOnly?: boolean;
}

const TYPE_META: Record<
  AssessmentNotification['type'],
  { label: string; tone: SemanticTone }
> = {
  homework_published: { label: 'Homework Published', tone: 'neutral' },
  homework_reviewed: { label: 'Homework Reviewed', tone: 'nominal' },
  homework_returned: { label: 'Correction Requested', tone: 'warning' },
  test_published: { label: 'Online Test Published', tone: 'neutral' },
  test_result_released: { label: 'Test Result Released', tone: 'nominal' },
  examination_published: { label: 'Exam Scheduled', tone: 'neutral' },
  examination_updated: { label: 'Exam Updated', tone: 'warning' },
  examination_marks_released: { label: 'Exam Marks Released', tone: 'nominal' },
};

export function AssessmentNotificationList({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  title = 'In-App Assessment Notifications',
  subtitle = 'Homework deadlines, online tests, exam schedules, and released results (in-app only; no SMS, WhatsApp, or email sent).',
  compact = false,
  readOnly = false,
}: AssessmentNotificationListProps) {
  const visibleList = compact ? notifications.slice(0, 5) : notifications;

  return (
    <Card
      title={title}
      subtitle={subtitle}
      action={
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
            {unreadCount} unread
          </span>
          {!readOnly && unreadCount > 0 && onMarkAllRead && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onMarkAllRead}
              iconLeft={<CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Mark All Read
            </Button>
          )}
        </div>
      }
    >
      {visibleList.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-6 text-center space-y-2">
          <Bell className="w-5 h-5 text-[#68737C] dark:text-[#AAB6B4] mx-auto" aria-hidden="true" />
          <p className="text-sm font-medium text-[#171D21] dark:text-[#F4F7F6]">
            No assessment notifications right now
          </p>
          <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
            Notifications appear here when homework, online tests, exams, or released scores are published.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
          {visibleList.map((notif) => {
            const isRead = Boolean(notif.readAt);
            const typeMeta = TYPE_META[notif.type];
            return (
              <li
                key={notif.id}
                className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                    <span className="font-mono font-semibold text-[#168A63] dark:text-[#42DDA9]">
                      {notif.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <StatusText tone={typeMeta.tone} label={typeMeta.label} />
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{notif.relatedRecordId}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatDateTime(notif.createdAt)}</span>
                  </div>

                  <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                    {notif.title}
                  </p>
                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                    {notif.message}
                  </p>
                </div>

                {!readOnly && (
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusText
                      tone={isRead ? 'neutral' : 'warning'}
                      label={isRead ? 'Read' : 'Unread'}
                    />
                    {!isRead && onMarkRead && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onMarkRead(notif.id)}
                      >
                        Mark Read
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
