import { Bell, CheckCheck } from 'lucide-react';
import type { AbsenceNotification } from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
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
          <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
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
        <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-2">
          <Bell className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto" aria-hidden="true" />
          <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
            No absence notifications recorded
          </p>
          <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
            Absence alerts appear only when attendance is formally submitted with an Absent status.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
          {visibleList.map((notif) => {
            const read = isRead(notif);
            const isCorrected = notif.resolutionStatus === 'corrected_not_absent';
            return (
              <li
                key={notif.id}
                className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
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

                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {notif.studentName} ({notif.studentId}) — {notif.subjectName}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
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
