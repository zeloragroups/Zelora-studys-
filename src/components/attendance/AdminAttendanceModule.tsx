import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye, History, Pencil, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AttendanceServiceError } from '../../services/contracts/attendanceService';
import {
  academicService,
  accountService,
  attendanceService,
  isFirebaseConnectedMode,
} from '../../services';
import {
  ATTENDANCE_STATUSES,
  type AbsenceNotification,
  type AccountRecord,
  type AdminAttendanceOverview,
  type AttendanceAuditEntry,
  type AttendanceRecord,
  type AttendanceSessionDetail,
  type AttendanceSessionType,
  type AttendanceStatus,
  type BatchRecord,
  type ClassRecord,
  type SubjectRecord,
} from '../../types';
import { formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { SearchInput } from '../ui/SearchInput';
import { Select } from '../ui/Select';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { Tabs } from '../ui/Tabs';
import { Textarea } from '../ui/Textarea';
import { AbsenceNotificationList } from './AbsenceNotificationList';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';

type AdminAttendanceTab = 'sessions' | 'notifications' | 'audit';

export function AdminAttendanceModule() {
  const { principal } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminAttendanceTab>('sessions');

  const [overview, setOverview] = useState<AdminAttendanceOverview | null>(null);
  const [sessions, setSessions] = useState<AttendanceSessionDetail[]>([]);
  const [auditEntries, setAuditEntries] = useState<AttendanceAuditEntry[]>([]);
  const [notifications, setNotifications] = useState<AbsenceNotification[]>([]);

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [teachers, setTeachers] = useState<AccountRecord[]>([]);

  // Filters
  const [dateFilter, setDateFilter] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | AttendanceSessionType>('all');
  const [studentSearch, setStudentSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Modals
  const [selectedSession, setSelectedSession] = useState<AttendanceSessionDetail | null>(
    null
  );
  const [correctionTarget, setCorrectionTarget] = useState<{
    session: AttendanceSessionDetail;
    record: AttendanceRecord;
    studentName: string;
  } | null>(null);
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('present');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    if (!principal || principal.role !== 'admin') {
      setError('Admin authorization required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        ovRes,
        sessRes,
        audRes,
        notifRes,
        clsRes,
        batRes,
        subRes,
        tchRes,
      ] = await Promise.all([
        attendanceService.getAdminAttendanceOverview(principal),
        attendanceService.listAdminAttendanceSessions(principal, {
          date: dateFilter || undefined,
          classId: classFilter,
          batchId: batchFilter,
          teacherId: teacherFilter,
          subjectId: subjectFilter,
          sessionType: typeFilter,
          studentIdSearch: studentSearch || undefined,
        }),
        attendanceService.listAttendanceAuditHistory(principal),
        attendanceService.listAdminAbsenceNotifications(principal),
        academicService.listClasses(principal),
        academicService.listBatches(principal),
        academicService.listSubjects(principal),
        accountService.listAccounts(principal, { role: 'teacher' }),
      ]);
      setOverview(ovRes);
      setSessions(sessRes);
      setAuditEntries(audRes);
      setNotifications(notifRes);
      setClasses(clsRes);
      setBatches(batRes);
      setSubjects(subRes);
      setTeachers(tchRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load attendance monitoring.');
    } finally {
      setLoading(false);
    }
  }, [
    principal,
    dateFilter,
    classFilter,
    batchFilter,
    teacherFilter,
    subjectFilter,
    typeFilter,
    studentSearch,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (!principal || principal.role !== 'admin') {
    return (
      <Alert tone="error" title="Access Restricted">
        Only authenticated Admin accounts can monitor and correct centre attendance.
      </Alert>
    );
  }

  const hasFilters =
    Boolean(dateFilter) ||
    classFilter !== 'all' ||
    batchFilter !== 'all' ||
    teacherFilter !== 'all' ||
    subjectFilter !== 'all' ||
    typeFilter !== 'all' ||
    studentSearch.trim().length > 0;

  const clearFilters = () => {
    setDateFilter('');
    setClassFilter('all');
    setBatchFilter('all');
    setTeacherFilter('all');
    setSubjectFilter('all');
    setTypeFilter('all');
    setStudentSearch('');
  };

  const openCorrectionModal = (
    session: AttendanceSessionDetail,
    record: AttendanceRecord,
    studentName: string
  ) => {
    setCorrectionTarget({ session, record, studentName });
    setNewStatus(record.status === 'absent' ? 'present' : 'absent');
    setCorrectionReason('');
    setCorrectionError(null);
  };

  const handleSubmitCorrection = async (e: FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;
    setSubmitting(true);
    setCorrectionError(null);
    try {
      const res = await attendanceService.correctAttendanceRecord(principal, {
        sessionId: correctionTarget.session.session.id,
        recordId: correctionTarget.record.id,
        newStatus,
        reason: correctionReason,
      });
      setSelectedSession(res.sessionDetail);
      setCorrectionTarget(null);
      showToast(
        `Corrected ${res.updatedRecord.studentId} to ${res.updatedRecord.status.toUpperCase()} with audit log.`
      );
      void loadData();
    } catch (err) {
      setCorrectionError(
        err instanceof AttendanceServiceError
          ? err.message
          : 'Unable to apply attendance correction.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    await attendanceService.markNotificationAsRead(principal, id);
    void loadData();
  };

  const handleMarkAllRead = async () => {
    await attendanceService.markAllNotificationsAsRead(principal);
    void loadData();
  };

  const sessionColumns: TableColumn<AttendanceSessionDetail>[] = [
    {
      key: 'id',
      header: 'Session',
      render: (row) => (
        <div>
          <p className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
            {row.session.id}
          </p>
          <p className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
            {row.session.sessionDate}
          </p>
        </div>
      ),
    },
    {
      key: 'cohort',
      header: 'Class & Subject',
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
      key: 'teacher',
      header: 'Teacher',
      render: (row) => (
        <span className="text-xs text-[#343C42] dark:text-[#D5E0DD]">
          {row.teacherName}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <div className="text-xs">
          <p className="capitalize text-[#171D21] dark:text-[#F4F7F6]">
            {row.session.sessionType === 'examination' ? 'Examination' : 'Regular'}
          </p>
          {row.session.examTitle && (
            <p className="text-[#68737C] dark:text-[#AAB6B4] truncate max-w-[140px]">
              {row.session.examTitle}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'counts',
      header: 'Counts (P / A / L / E)',
      render: (row) => (
        <span className="font-mono text-xs tabular-nums text-[#343C42] dark:text-[#D5E0DD]">
          {row.summary.presentCount} / {row.summary.absentCount} /{' '}
          {row.summary.lateCount} / {row.summary.excusedCount} (
          {row.summary.displayPercentage})
        </span>
      ),
    },
    {
      key: 'status',
      header: 'State',
      render: (row) => (
        <StatusText
          tone={
            row.session.status === 'submitted'
              ? 'nominal'
              : row.session.status === 'corrected'
                ? 'warning'
                : 'neutral'
          }
          label={
            row.session.status === 'submitted'
              ? 'Submitted'
              : row.session.status === 'corrected'
                ? 'Corrected'
                : 'Draft'
          }
        />
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSelectedSession(row)}
          iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
        >
          Review
        </Button>
      ),
    },
  ];

  const auditColumns: TableColumn<AttendanceAuditEntry>[] = [
    {
      key: 'id',
      header: 'Audit ID',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
          {row.id}
        </span>
      ),
    },
    {
      key: 'session',
      header: 'Session / Record',
      render: (row) => (
        <span className="font-mono text-xs text-[#343C42] dark:text-[#D5E0DD]">
          {row.attendanceSessionId}
          {row.attendanceRecordId ? ` · ${row.attendanceRecordId}` : ''}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <span className="text-xs font-medium capitalize text-[#171D21] dark:text-[#F4F7F6]">
          {row.action.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'change',
      header: 'Details / Status Change',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          {row.previousValue && row.newValue ? (
            <p className="font-mono text-[#171D21] dark:text-[#F4F7F6]">
              {row.previousValue} → {row.newValue}
            </p>
          ) : (
            <p className="text-[#68737C] dark:text-[#AAB6B4]">{row.newValue ?? '—'}</p>
          )}
          {row.reason && (
            <p className="text-[#68737C] dark:text-[#AAB6B4]">Reason: {row.reason}</p>
          )}
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => <span className="font-mono text-xs">{row.actorId}</span>,
    },
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (row) => (
        <span className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
          {formatShortDate(row.timestamp)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Admin Attendance Monitoring & Audit · ${isFirebaseConnectedMode() ? 'Firebase Connected' : 'Local Development Adapter'}`}
        title="Attendance Operations & Audit"
        subtitle="Monitor submitted sessions, absence alerts, and audited status corrections across every batch."
      />

      {toast && (
        <Alert tone="success" onDismiss={() => setToast(null)}>
          {toast}
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {overview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatTile
              label="Total Sessions"
              value={overview.totalSessions}
              caption={`${overview.correctedSessions} corrected`}
            />
            <StatTile
              label="Submitted"
              value={overview.submittedSessions}
              caption="Finalized sessions"
            />
            <StatTile
              label="Awaiting Submission"
              value={overview.draftSessions}
              caption="Saved drafts"
            />
            <StatTile
              label="Present"
              value={overview.presentCount}
              caption={`${overview.lateCount} late included in %`}
            />
            <StatTile
              label="Absent"
              value={overview.absentCount}
              caption={`${overview.excusedCount} excused`}
            />
            <StatTile
              label="Overall Rate"
              value={overview.overallSummary.displayPercentage}
              caption={`${overview.overallSummary.attendedCount} / ${overview.overallSummary.eligibleDenominator} eligible`}
              tone="mint"
            />
          </div>

          {overview.byClass.length > 0 && (
            <Card
              title="Attendance Overview by Class"
              subtitle="Calculated using consistent (Present + Late) / (Present + Absent + Late) formula."
              padding="sm"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[#E2E8E5] dark:divide-[#344047] text-xs sm:text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      <th className="py-2 pr-3 font-semibold">Class</th>
                      <th className="py-2 px-3 font-semibold text-right">Submitted</th>
                      <th className="py-2 px-3 font-semibold text-right">Present</th>
                      <th className="py-2 px-3 font-semibold text-right">Late</th>
                      <th className="py-2 px-3 font-semibold text-right">Absent</th>
                      <th className="py-2 px-3 font-semibold text-right">Excused</th>
                      <th className="py-2 pl-3 font-semibold text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
                    {overview.byClass.map((row) => (
                      <tr key={row.classId}>
                        <td className="py-2.5 pr-3 font-medium text-[#171D21] dark:text-[#F4F7F6]">
                          {row.className}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {row.submittedSessions}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {row.summary.presentCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {row.summary.lateCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {row.summary.absentCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {row.summary.excusedCount}
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-semibold">
                          {row.summary.displayPercentage}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <Tabs
        ariaLabel="Admin attendance tabs"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          {
            id: 'sessions',
            label: 'Sessions & Corrections',
            count: sessions.length,
          },
          {
            id: 'notifications',
            label: 'Absence Alerts',
            count: overview?.unreadNotificationCount ?? 0,
          },
          {
            id: 'audit',
            label: 'Audit History',
            count: auditEntries.length,
          },
        ]}
      />

      {activeTab === 'sessions' && (
        <Card
          title="Attendance Sessions"
          subtitle="Filter by date, class, batch, teacher, subject, session type, or student ID. Submitted sessions can be corrected only with a mandatory audit reason."
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <SearchInput
                value={studentSearch}
                onValueChange={setStudentSearch}
                placeholder="Search Student ID or name..."
                aria-label="Search attendance by student ID or name"
              />

              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                aria-label="Filter attendance by date"
                className="min-h-[44px] rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-[#151A1E] border border-[#E2E8E5] dark:border-[#344047] text-[#171D21] dark:text-[#F4F7F6] focus:border-[#18B985] dark:focus:border-[#42DDA9] focus:outline-2 focus:outline-[#35D6A0]/25 dark:focus:outline-[#42DDA9]/25 transition-colors duration-150"
              />

              <Select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                aria-label="Filter by class"
              >
                <option value="all">All Classes</option>
                {classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name}
                  </option>
                ))}
              </Select>

              <Select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                aria-label="Filter by batch"
              >
                <option value="all">All Batches</option>
                {batches.map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.name}
                  </option>
                ))}
              </Select>

              <Select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                aria-label="Filter by teacher"
              >
                <option value="all">All Teachers</option>
                {teachers.map((t) => (
                  <option key={t.accountId} value={t.accountId}>
                    {t.name} ({t.accountId})
                  </option>
                ))}
              </Select>

              <Select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                aria-label="Filter by subject"
              >
                <option value="all">All Subjects</option>
                {subjects.map((s) => (
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
                aria-label="Filter by attendance type"
              >
                <option value="all">Regular & Exam</option>
                <option value="regular">Regular Class</option>
                <option value="examination">Examination</option>
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
                columns={sessionColumns}
                rows={sessions}
                rowKey={(r) => r.session.id}
                loading={loading}
                emptyTitle="No attendance sessions found"
                emptyDescription="No sessions match the selected filters."
              />
            </div>

            <div className="md:hidden space-y-3">
              {sessions.length === 0 ? (
                <p className="text-sm text-[#68737C] dark:text-[#AAB6B4] text-center py-6">
                  No matching attendance sessions found.
                </p>
              ) : (
                sessions.map((row) => (
                  <div
                    key={row.session.id}
                    className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-4 space-y-2.5 bg-[#F7F9F8] dark:bg-[#151A1E]/75"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
                          {row.session.id} · {row.session.sessionDate}
                        </p>
                        <p className="font-semibold text-sm text-[#20262B] dark:text-[#F4F7F6]">
                          {row.subjectName}
                        </p>
                        <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                          {row.className} · {row.batchName} · {row.teacherName}
                        </p>
                      </div>
                      <StatusText
                        tone={
                          row.session.status === 'submitted'
                            ? 'nominal'
                            : row.session.status === 'corrected'
                              ? 'warning'
                              : 'neutral'
                        }
                        label={row.session.status}
                      />
                    </div>
                    <p className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
                      P:{row.summary.presentCount} A:{row.summary.absentCount} L:
                      {row.summary.lateCount} E:{row.summary.excusedCount} ·{' '}
                      {row.summary.displayPercentage}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedSession(row)}
                    >
                      Review & Correct
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <AbsenceNotificationList
          role="admin"
          notifications={notifications}
          unreadCount={overview?.unreadNotificationCount ?? 0}
          onMarkRead={(id) => void handleMarkNotificationRead(id)}
          onMarkAllRead={() => void handleMarkAllRead()}
        />
      )}

      {activeTab === 'audit' && (
        <Card
          title="Attendance Audit Ledger"
          subtitle="Immutable log of submissions, drafts, and Admin-mediated status corrections with reasons."
        >
          <div className="hidden md:block">
            <Table
              columns={auditColumns}
              rows={auditEntries}
              rowKey={(r) => r.id}
              loading={loading}
              emptyTitle="No audit events yet"
              emptyDescription="Audit events are automatically recorded on session creation, submission, and correction."
            />
          </div>

          <div className="md:hidden space-y-3">
            {auditEntries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3.5 space-y-1.5 bg-[#F7F9F8] dark:bg-[#151A1E]/75 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-[#168A63] dark:text-[#42DDA9]">
                    {entry.id}
                  </span>
                  <span className="font-mono text-[#68737C] dark:text-[#AAB6B4]">
                    {formatShortDate(entry.timestamp)}
                  </span>
                </div>
                <p className="font-medium capitalize text-[#171D21] dark:text-[#F4F7F6]">
                  {entry.action.replace(/_/g, ' ')} ({entry.attendanceSessionId})
                </p>
                {entry.previousValue && entry.newValue ? (
                  <p className="font-mono text-[#343C42] dark:text-[#D5E0DD]">
                    {entry.previousValue} → {entry.newValue}
                  </p>
                ) : (
                  <p className="text-[#68737C] dark:text-[#AAB6B4]">{entry.newValue}</p>
                )}
                {entry.reason && (
                  <p className="text-[#68737C] dark:text-[#AAB6B4]">Reason: {entry.reason}</p>
                )}
                <p className="font-mono text-[#68737C] dark:text-[#AAB6B4]">Actor: {entry.actorId}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Session Detail & Correction Modal */}
      <Modal
        open={selectedSession !== null}
        onClose={() => setSelectedSession(null)}
        title={`Attendance Session ${selectedSession?.session.id ?? ''}`}
        subtitle={
          selectedSession
            ? `${selectedSession.subjectName} · ${selectedSession.className} · ${selectedSession.batchName} (${selectedSession.session.sessionDate})`
            : undefined
        }
        maxWidthClass="max-w-2xl"
      >
        {selectedSession && (
          <div className="space-y-5">
            <div className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] p-3.5 bg-[#F0F4F2] dark:bg-[#151A1E] text-xs space-y-1 font-mono tabular-nums">
              <p>
                Teacher: {selectedSession.teacherName} ({selectedSession.session.teacherId}) ·
                Type:{' '}
                {selectedSession.session.sessionType === 'examination'
                  ? `Exam (${selectedSession.session.examTitle ?? ''})`
                  : 'Regular Class'}
              </p>
              <p>
                Attendance Rate: {selectedSession.summary.displayPercentage} (
                {selectedSession.summary.attendedCount}/
                {selectedSession.summary.eligibleDenominator} attended)
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                Student Roster ({selectedSession.records.length})
              </h3>
              <ul className="divide-y divide-[#E2E8E5] dark:divide-[#344047] max-h-64 overflow-y-auto">
                {selectedSession.records.map((item) => (
                  <li
                    key={item.record.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#20262B] dark:text-[#F4F7F6]">
                        {item.studentName}
                      </p>
                      <p className="font-mono text-xs text-[#68737C] dark:text-[#AAB6B4]">
                        {item.record.studentId}
                        {item.record.remarks ? ` · ${item.record.remarks}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <AttendanceStatusBadge
                        status={item.record.status}
                        corrected={item.record.corrected}
                      />
                      {selectedSession.session.status !== 'draft' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            openCorrectionModal(
                              selectedSession,
                              item.record,
                              item.studentName
                            )
                          }
                          iconLeft={<Pencil className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                          Correct
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {selectedSession.auditEntries.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-[#E2E8E5] dark:border-[#344047]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                  <History className="w-3.5 h-3.5 text-[#168A63] dark:text-[#42DDA9]" aria-hidden="true" />
                  <span>Session Audit Trail ({selectedSession.auditEntries.length})</span>
                </div>
                <ul className="space-y-1.5 text-xs text-[#68737C] dark:text-[#AAB6B4]">
                  {selectedSession.auditEntries.map((aud) => (
                    <li key={aud.id} className="font-mono">
                      [{formatShortDate(aud.timestamp)}] {aud.actorId} ·{' '}
                      {aud.action.replace(/_/g, ' ')}
                      {aud.previousValue && aud.newValue
                        ? `: ${aud.previousValue} -> ${aud.newValue}`
                        : `: ${aud.newValue ?? ''}`}
                      {aud.reason ? ` (${aud.reason})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Mandatory-Reason Record Correction Modal */}
      <Modal
        open={correctionTarget !== null}
        onClose={() => setCorrectionTarget(null)}
        title={`Correct Attendance (${correctionTarget?.record.studentId ?? ''})`}
        subtitle="Admin correction creates an immutable audit entry and updates any linked absence notification."
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSubmitCorrection} className="space-y-4">
          {correctionError && <Alert tone="error">{correctionError}</Alert>}

          <div className="text-xs text-[#68737C] dark:text-[#AAB6B4] space-y-1">
            <p className="font-semibold text-[#171D21] dark:text-[#F4F7F6]">
              {correctionTarget?.studentName} ({correctionTarget?.record.studentId})
            </p>
            <p>
              Current status:{' '}
              <span className="font-semibold capitalize">
                {correctionTarget?.record.status}
              </span>
            </p>
          </div>

          <Select
            label="New Attendance Status"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as AttendanceStatus)}
          >
            {ATTENDANCE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st.charAt(0).toUpperCase() + st.slice(1)}
              </option>
            ))}
          </Select>

          <Textarea
            label="Mandatory Correction Reason"
            rows={3}
            value={correctionReason}
            onChange={(e) => setCorrectionReason(e.target.value)}
            placeholder="Explain why this submitted record is being changed (minimum 5 characters)..."
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCorrectionTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Apply Audited Correction
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
