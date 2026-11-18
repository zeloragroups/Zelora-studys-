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
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
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
      <Card title="Access Restricted">
        <p className="text-sm text-red-700 dark:text-red-400">
          Only authenticated Student / Parent accounts can access personal attendance.
        </p>
      </Card>
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
        <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
          {row.session.sessionDate}
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-slate-100">{row.subjectName}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
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
          <p className="capitalize font-medium text-slate-800 dark:text-slate-200">
            {row.session.sessionType === 'examination' ? 'Examination' : 'Regular Class'}
          </p>
          {row.session.examTitle && (
            <p className="text-slate-500 dark:text-slate-400 truncate max-w-[180px]">
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
        <span className="text-xs text-slate-600 dark:text-slate-300">
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
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {row.record.remarks ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
            Student & Parent Attendance · {principal.loginId} · {isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Demo'}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] text-balance">
            My Attendance & Absence Alerts
          </h1>
        </div>
        <StatusText tone="nominal" label={`Student: ${principal.fullName}`} />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-[#F1EEFA] dark:bg-[#202844] animate-pulse"
            />
          ))}
        </div>
      ) : (
        data && (
          <>
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="col-span-2 sm:col-span-1 rounded-2xl bg-white dark:bg-[#171D34] border border-[#E5E7EF] dark:border-[#303A55] p-4 sm:p-5">
                <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
                  Attendance Rate
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-[#7552D9] dark:text-[#A78BFA] font-mono tabular-nums">
                  {data.summary.percentage === null ? 'N/A' : data.summary.displayPercentage}
                </p>
                <p className="mt-1.5 text-xs text-[#687086] dark:text-[#A6B0C3] font-mono tabular-nums">
                  {data.summary.eligibleDenominator > 0
                    ? `${data.summary.attendedCount} / ${data.summary.eligibleDenominator} attended`
                    : 'No eligible sessions'}
                </p>
              </div>

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
                <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                  {data.recentRecords.map((item) => (
                    <li
                      key={item.record.id}
                      className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                          {item.session.sessionDate}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-slate-100">
                          {item.subjectName}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
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
                    className="min-h-[40px] rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    aria-label="Filter to date"
                    className="min-h-[40px] rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                  />
                  <select
                    value={subjectFilter}
                    onChange={(e) => setSubjectFilter(e.target.value)}
                    aria-label="Filter by subject"
                    className="min-h-[40px] rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                  >
                    <option value="all">All Subjects</option>
                    {data.availableSubjects.map((s) => (
                      <option key={s.subjectId} value={s.subjectId}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={typeFilter}
                    onChange={(e) =>
                      setTypeFilter(e.target.value as 'all' | AttendanceSessionType)
                    }
                    aria-label="Filter by session type"
                    className="min-h-[40px] rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-[#101426] border border-[#E5E7EF] dark:border-[#303A55] text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                  >
                    <option value="all">Regular & Exam</option>
                    <option value="regular">Regular Class Only</option>
                    <option value="examination">Examination Only</option>
                  </select>
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="min-h-[40px] px-3 rounded-xl border border-[#E5E7EF] dark:border-[#303A55] text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Clear Filters</span>
                    </button>
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
                    <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-2">
                      <CalendarCheck2
                        className="w-5 h-5 text-[#687086] dark:text-[#A6B0C3] mx-auto"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                        No matching attendance records
                      </p>
                    </div>
                  ) : (
                    data.history.map((item) => (
                      <div
                        key={item.record.id}
                        className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] p-4 space-y-2 bg-white dark:bg-[#101426]/65"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                              {item.session.sessionDate} ·{' '}
                              {item.session.sessionType === 'examination'
                                ? `Exam (${item.session.examTitle ?? ''})`
                                : 'Regular'}
                            </p>
                            <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                              {item.subjectName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {item.className} · {item.batchName}
                            </p>
                          </div>
                          <AttendanceStatusBadge
                            status={item.record.status}
                            corrected={item.record.corrected}
                          />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
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
