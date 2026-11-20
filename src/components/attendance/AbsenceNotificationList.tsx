import { Bell, CheckCheck } from 'lucide-react';
import type { AbsenceNotification } from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { StatusText } from '../ui/StatusText';

interface AbsenceNotificationListProps {
  role: 'admin' | 'student';
  notifications: AbsenceNotification[];
  unreadCount: number;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export function AbsenceNotificationList({
  role,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  title = 'In-App Absence Notifications',
  subtitle,
  compact = false,
}: AbsenceNotificationListProps) {
  const isRead = (n: AbsenceNotification) =>
    role === 'student' ? n.readByStudent : n.readByAdmin;

  const visibleList = compact ? notifications.slice(0, 4) : notifications;

  return (
    <Card
      title={title}
      subtitle={
        subtitle ??
        (role === 'student'
          ? 'In-app absence alerts visible to both student and parent using shared credentials.'
          : 'Submitted absence alerts across classes and batches (in-app only; no SMS/WhatsApp/email sent).')
      }
      action={
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
            {unreadCount} unread
          </span>
          {unreadCount > 0 && (
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
        <EmptyState
          icon={<Bell className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />}
          title="No absence notifications recorded"
          description="Absence alerts appear only when attendance is formally submitted with an Absent status."
        />
      ) : (
        <ul className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
          {visibleList.map((notif) => {
            const read = isRead(notif);
            const isCorrected = notif.resolutionStatus === 'corrected_not_absent';
            return (
              <li
                key={notif.id}
                className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                    <span className="font-mono font-semibold text-[#343C42] dark:text-[#D4DDDC]">
                      {notif.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{notif.absenceDate}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">
                      {notif.attendanceType === 'examination'
                        ? `Examination${notif.examTitle ? ` (${notif.examTitle})` : ''}`
                        : 'Regular Class'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Created {formatShortDate(notif.createdAt)}</span>
                  </div>

                  <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                    {notif.studentName} ({notif.studentId}) — {notif.subjectName}
                  </p>
                  <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                    {notif.className} · {notif.batchName}
                  </p>

                  {isCorrected && notif.correctionNote ? (
                    <div className="pt-1">
                      <StatusText tone="nominal" label={notif.correctionNote} />
                    </div>
                  ) : (
                    <div className="pt-1">
                      <StatusText
                        tone="danger"
                        label="Marked Absent in submitted attendance"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <StatusText
                    tone={read ? 'neutral' : 'warning'}
                    label={read ? 'Read' : 'Unread'}
                  />
                  {!read && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onMarkRead(notif.id)}
                    >
                      Mark Read
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
