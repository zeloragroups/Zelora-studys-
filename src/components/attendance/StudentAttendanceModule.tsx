import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { attendanceService, isFirebaseConnectedMode } from '../../services';
import type {
  AttendanceSessionType,
  StudentAttendanceDashboardData,
  StudentAttendanceHistoryItem,
} from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { Select } from '../ui/Select';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { AbsenceNotificationList } from './AbsenceNotificationList';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';

export function StudentAttendanceModule() {
  const { principal } = useAuth();
  const [data, setData] = useState<StudentAttendanceDashboardData | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | AttendanceSessionType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!principal || principal.role !== 'student') {
      setError('Student account authentication required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await attendanceService.getMyStudentAttendance(principal, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        subjectId: subjectFilter,
        sessionType: typeFilter,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load attendance records.');
    } finally {
      setLoading(false);
    }
  }, [principal, dateFrom, dateTo, subjectFilter, typeFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!principal || principal.role !== 'student') {
    return (
      <Alert tone="error" title="Access Restricted">
        Only authenticated Student / Parent accounts can access personal attendance.
      </Alert>
    );
  }

  const handleMarkRead = async (notificationId: string) => {
    await attendanceService.markNotificationAsRead(principal, notificationId);
    void loadData();
  };

  const handleMarkAllRead = async () => {
    await attendanceService.markAllNotificationsAsRead(principal);
    void loadData();
  };

  const hasFilters =
    Boolean(dateFrom) || Boolean(dateTo) || subjectFilter !== 'all' || typeFilter !== 'all';

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSubjectFilter('all');
    setTypeFilter('all');
  };

  const columns: TableColumn<StudentAttendanceHistoryItem>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (row) => (
        <span className="font-mono text-xs tabular-nums text-[#343C42] dark:text-[#D5E0DD]">
          {row.session.sessionDate}
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div>
          <p className="font-medium text-[#171D21] dark:text-[#F4F7F6]">{row.subjectName}</p>
          <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
            {row.className} · {row.batchName}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Session Type',
      render: (row) => (
        <div className="text-xs">
          <p className="capitalize font-medium text-[#171D21] dark:text-[#F4F7F6]">
            {row.session.sessionType === 'examination' ? 'Examination' : 'Regular Class'}
          </p>
          {row.session.examTitle && (
            <p className="text-[#68737C] dark:text-[#AAB6B4] truncate max-w-[180px]">
              {row.session.examTitle}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'teacher',
      header: 'Teacher',
      render: (row) => (
        <span className="text-xs text-[#343C42] dark:text-[#D5E0DD]">
          {row.teacherName}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <AttendanceStatusBadge
          status={row.record.status}
          corrected={row.record.corrected}
        />
      ),
    },
    {
      key: 'remarks',
      header: 'Remarks',
      render: (row) => (
        <span className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
          {row.record.remarks ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Student & Parent Attendance · ${principal.loginId} · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo'}`}
        title="My Attendance & Absence Alerts"
        rightSlot={<StatusText tone="nominal" label={`Student: ${principal.fullName}`} />}
      />

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-[#F0F4F2] dark:bg-[#252E33] animate-pulse"
            />
          ))}
        </div>
      ) : (
        data && (
          <>
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatTile
                label="Attendance Rate"
                value={data.summary.percentage === null ? 'N/A' : data.summary.displayPercentage}
                caption={
                  data.summary.eligibleDenominator > 0
                    ? `${data.summary.attendedCount} / ${data.summary.eligibleDenominator} attended`
                    : 'No eligible sessions'
                }
                tone="mint"
                className="col-span-2 sm:col-span-1"
              />

              <StatTile
                label="Eligible Sessions"
                value={data.summary.eligibleDenominator}
                caption="Present + Absent + Late"
              />
              <StatTile label="Present" value={data.summary.presentCount} caption="Attended" />
              <StatTile label="Late" value={data.summary.lateCount} caption="Counts as attended" />
              <StatTile label="Absent" value={data.summary.absentCount} caption="Not attended" />
              <StatTile
                label="Excused"
                value={data.summary.excusedCount}
                caption="Excluded from %"
              />
            </div>

            {/* In-App Absence Notifications */}
            <AbsenceNotificationList
              role="student"
              notifications={data.notifications}
              unreadCount={data.unreadNotificationCount}
              onMarkRead={(id) => void handleMarkRead(id)}
              onMarkAllRead={() => void handleMarkAllRead()}
            />

            {/* Recent Attendance Strip */}
            {data.recentRecords.length > 0 && (
              <Card
                title="Recent Submitted Attendance"
                subtitle="Latest attendance records submitted by your subject teachers."
                padding="sm"
              >
                <ul className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
                  {data.recentRecords.map((item) => (
                    <li
                      key={item.record.id}
                      className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
                          {item.session.sessionDate}
                        </span>
                        <span className="font-medium text-[#171D21] dark:text-[#F4F7F6]">
                          {item.subjectName}
                        </span>
                        <span className="text-xs text-[#68737C] dark:text-[#AAB6B4] capitalize">
                          {item.session.sessionType === 'examination'
                            ? `Exam (${item.session.examTitle ?? ''})`
                            : 'Regular'}
                        </span>
                      </div>
                      <AttendanceStatusBadge
                        status={item.record.status}
                        corrected={item.record.corrected}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Full Filterable History */}
            <Card
              title="Attendance History"
              subtitle="Filter personal submitted attendance records by date range, subject, or session type."
            >
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    aria-label="Filter from date"
                    className="min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#151A1E] border border-[#E2E8E5] dark:border-[#344047] text-[#171D21] dark:text-[#F4F7F6] focus:border-[#18B985] dark:focus:border-[#42DDA9] focus:outline-2 focus:outline-[#35D6A0]/25 dark:focus:outline-[#42DDA9]/25 transition-colors duration-150"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    aria-label="Filter to date"
                    className="min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#151A1E] border border-[#E2E8E5] dark:border-[#344047] text-[#171D21] dark:text-[#F4F7F6] focus:border-[#18B985] dark:focus:border-[#42DDA9] focus:outline-2 focus:outline-[#35D6A0]/25 dark:focus:outline-[#42DDA9]/25 transition-colors duration-150"
                  />
                  <Select
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    aria-label="Filter by subject"
                  >
                    <option value="all">All Subjects</option>
                    {data.availableSubjects.map((s) => (
                      <option key={s.subjectId} value={s.subjectId}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={typeFilter}
                    onChange={(e) =>
                      setTypeFilter(e.target.value as 'all' | AttendanceSessionType)
                    }
                    aria-label="Filter by session type"
                  >
                    <option value="all">Regular & Exam</option>
                    <option value="regular">Regular Class Only</option>
                    <option value="examination">Examination Only</option>
                  </Select>
                  {hasFilters && (
                    <Button
                      variant="secondary"
                      onClick={clearFilters}
                      iconLeft={<X className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                <div className="hidden md:block">
                  <Table
                    columns={columns}
                    rows={data.history}
                    rowKey={(row) => row.record.id}
                    emptyTitle="No attendance records match these filters"
                    emptyDescription="Attendance records appear here once your teachers submit regular or examination attendance."
                    emptyAction={
                      hasFilters ? (
                        <Button variant="secondary" size="sm" onClick={clearFilters}>
                          Clear Filters
                        </Button>
                      ) : undefined
                    }
                  />
                </div>

                <div className="md:hidden space-y-3">
                  {data.history.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#E2E8E5] dark:border-[#344047] p-6 text-center space-y-2">
                      <CalendarCheck2
                        className="w-5 h-5 text-[#68737C] dark:text-[#AAB6B4] mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-[#171D21] dark:text-[#F4F7F6]">
                        No matching attendance records
                      </p>
                    </div>
                  ) : (
                    data.history.map((item) => (
                      <div
                        key={item.record.id}
                        className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-4 space-y-2 bg-white dark:bg-[#1D2429]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
                              {item.session.sessionDate} ·{' '}
                              {item.session.sessionType === 'examination'
                                ? `Exam (${item.session.examTitle ?? ''})`
                                : 'Regular'}
                            </p>
                            <p className="font-semibold text-sm text-[#171D21] dark:text-[#F4F7F6]">
                              {item.subjectName}
                            </p>
                            <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                              {item.className} · {item.batchName}
                            </p>
                          </div>
                          <AttendanceStatusBadge
                            status={item.record.status}
                            corrected={item.record.corrected}
                          />
                        </div>
                        <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                          Marked by {item.teacherName} on{' '}
                          {formatShortDate(item.record.markedAt)}
                          {item.record.remarks ? ` · Note: ${item.record.remarks}` : ''}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          </>
        )
      )}
    </div>
  );
}
