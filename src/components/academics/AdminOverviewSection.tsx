import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  IndianRupee,
  Megaphone,
  Settings,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import {
  academicService,
  accountService,
  assessmentService,
  attendanceService,
  isFirebaseConnectedMode,
} from '../../services';
import type {
  AcademicOverviewStats,
  AccountOverviewStats,
  AdminAssessmentOverviewData,
  AdminAttendanceOverview,
} from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';

interface AdminOverviewSectionProps {
  mode: 'website' | 'webapp';
  variant?: 'home' | 'overview';
  onNavigate: (navId: string) => void;
}

export function AdminOverviewSection({
  mode,
  variant = 'home',
  onNavigate,
}: AdminOverviewSectionProps) {
  const { principal } = useAuth();
  const { branding, publicSettings } = useInterface();
  const [academicStats, setAcademicStats] = useState<AcademicOverviewStats | null>(null);
  const [accountStats, setAccountStats] = useState<AccountOverviewStats | null>(null);
  const [attendanceStats, setAttendanceStats] = useState<AdminAttendanceOverview | null>(null);
  const [assessmentStats, setAssessmentStats] = useState<AdminAssessmentOverviewData['stats'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!principal || principal.role !== 'admin') {
      setError('Admin authorization required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [acad, acct, att, assess] = await Promise.all([
        academicService.getAcademicOverview(principal),
        accountService.getAccountOverview(principal),
        attendanceService.getAdminAttendanceOverview(principal),
        assessmentService.getAdminAssessmentOverview(principal),
      ]);
      setAcademicStats(acad);
      setAccountStats(acct);
      setAttendanceStats(att);
      setAssessmentStats(assess.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to compute centre overview.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const accountsTarget = mode === 'website' ? 'accounts' : 'lookup';
  const noticesTarget = mode === 'website' ? 'announcements' : 'notices';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          variant === 'home'
            ? `${branding.centreName} · ${publicSettings.academicDefaults.academicYearDisplay} · Welcome, ${principal?.fullName ?? 'Admin'}`
            : `${branding.centreName} · ${publicSettings.academicDefaults.academicYearDisplay}`
        }
        title={
          variant === 'home'
            ? 'Centre Control Home'
            : 'Executive Academic & Operations Overview'
        }
        subtitle={
          variant === 'home'
            ? 'Quick actions, daily attendance pulse, and live centre metrics across classes, teachers, and students.'
            : 'Detailed breakdown of active classes, attendance percentages, assessments, and operational readiness.'
        }
        rightSlot={
          <StatusText
            tone="nominal"
            label={`${principal?.loginId ?? 'Admin'} · Live Local State`}
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

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-[#F1EEFA] dark:bg-[#202844]/70 animate-pulse"
            />
          ))}
        </div>
      ) : (
        academicStats &&
        accountStats && (
          <>
            {/* Top 4 Executive KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Total Students"
                value={accountStats.totalStudents}
                caption={`${academicStats.enrolledStudents} actively enrolled`}
                icon={<GraduationCap className="w-4 h-4" />}
              />
              <StatTile
                label="Total Teachers"
                value={accountStats.totalTeachers}
                caption={`${academicStats.activeAssignments} subject assignments`}
                icon={<Users className="w-4 h-4" />}
              />
              <StatTile
                label="Active Classes"
                value={academicStats.activeClasses}
                caption={`${academicStats.activeBatches} active batches`}
                icon={<BookOpen className="w-4 h-4" />}
              />
              <StatTile
                label="Overall Attendance"
                value={attendanceStats?.overallSummary.displayPercentage ?? 'Not available'}
                caption={
                  attendanceStats
                    ? `${attendanceStats.submittedSessions} submitted · ${attendanceStats.unreadNotificationCount} unread alerts`
                    : `${academicStats.activeTimetableSessions} weekly sessions`
                }
                icon={<ClipboardCheck className="w-4 h-4" />}
                accent
              />
            </div>

            {/* Quick Action Bar */}
            {variant === 'home' && (
              <Card
                title="Quick Management Actions"
                subtitle="Jump straight into core centre operations."
                padding="sm"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onNavigate('finance')}
                    iconLeft={<IndianRupee className="w-4 h-4" aria-hidden="true" />}
                  >
                    Fees & Salaries
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onNavigate(accountsTarget)}
                    iconLeft={<Users className="w-4 h-4" aria-hidden="true" />}
                  >
                    Accounts
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onNavigate('academics')}
                    iconLeft={<BookOpen className="w-4 h-4" aria-hidden="true" />}
                  >
                    Academics
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onNavigate('attendance')}
                    iconLeft={<ClipboardCheck className="w-4 h-4" aria-hidden="true" />}
                  >
                    Attendance
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onNavigate('assessments')}
                    iconLeft={<FileSpreadsheet className="w-4 h-4" aria-hidden="true" />}
                  >
                    Assessments
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => onNavigate(noticesTarget)}
                    iconLeft={<Megaphone className="w-4 h-4" aria-hidden="true" />}
                  >
                    Notices
                  </Button>
                </div>
              </Card>
            )}

            {/* Class Attendance Breakdown + Assessment Summary */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Card
                title="Class Attendance Breakdown"
                subtitle={
                  attendanceStats
                    ? `${attendanceStats.presentCount} present · ${attendanceStats.lateCount} late · ${attendanceStats.absentCount} absent`
                    : 'No attendance recorded yet'
                }
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('attendance')}
                  >
                    Monitor
                  </Button>
                }
              >
                {attendanceStats && attendanceStats.byClass.length > 0 ? (
                  <div className="space-y-3.5">
                    {attendanceStats.byClass.map((cls) => {
                      const pct = cls.summary.percentage ?? 0;
                      return (
                        <div key={cls.classId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                              {cls.className}
                            </span>
                            <span className="font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                              {cls.summary.displayPercentage} ({cls.submittedSessions} sessions)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-[#F1EEFA] dark:bg-[#202844] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#7552D9] dark:bg-[#8B5CF6] transition-[width] duration-300"
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                    Attendance percentages will appear here after teachers submit sessions.
                  </p>
                )}
              </Card>

              <Card
                title="Assessments & Notices Snapshot"
                subtitle="Live status across homework, online tests, exams & centre notices"
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate('assessments')}
                  >
                    Inspect
                  </Button>
                }
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5">
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">Homework Published</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                      {assessmentStats?.publishedHomework ?? 0}
                    </p>
                    <p className="text-[11px] text-[#687086] dark:text-[#A6B0C3] mt-0.5">
                      {assessmentStats?.pendingHomeworkSubmissions ?? 0} pending submissions
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5">
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">Online Tests</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                      {assessmentStats?.publishedTests ?? 0}
                    </p>
                    <p className="text-[11px] text-[#687086] dark:text-[#A6B0C3] mt-0.5">
                      {assessmentStats?.completedTestAttempts ?? 0} completed attempts
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5">
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">Examinations</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                      {(assessmentStats?.upcomingExaminations ?? 0) +
                        (assessmentStats?.completedExaminations ?? 0)}
                    </p>
                    <p className="text-[11px] text-[#687086] dark:text-[#A6B0C3] mt-0.5">
                      {assessmentStats?.pendingMarksEntry ?? 0} pending marks entry
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/60 p-3.5">
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">Live Notices</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                      {academicStats.publishedAnnouncements}
                    </p>
                    <p className="text-[11px] text-[#687086] dark:text-[#A6B0C3] mt-0.5">
                      {accountStats.activeAccounts} active accounts
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Module Navigation Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card
                title="Teacher & Student Accounts"
                subtitle={`${accountStats.activeAccounts} active · ${accountStats.inactiveAccounts} inactive`}
              >
                <div className="space-y-4">
                  <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                    Provision unique Teacher (TCH-xxxx) and Student (STU-xxxx) IDs, edit records, or toggle login eligibility.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onNavigate(accountsTarget)}
                    iconLeft={<Users className="w-4 h-4" aria-hidden="true" />}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>Open Accounts</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </Button>
                </div>
              </Card>

              <Card
                title="Academic Structure"
                subtitle={`${academicStats.totalClasses} classes · ${academicStats.totalBatches} batches · ${academicStats.totalSubjects} subjects`}
              >
                <div className="space-y-4">
                  <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                    Manage classes, batch cohorts, subjects, student enrolments, teacher assignments, and weekly timetables.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onNavigate('academics')}
                    iconLeft={<BookOpen className="w-4 h-4" aria-hidden="true" />}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>Open Academics</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </Button>
                </div>
              </Card>

              <Card
                title="Announcements"
                subtitle={`${academicStats.publishedAnnouncements} currently live`}
              >
                <div className="space-y-4">
                  <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                    Draft, publish, unpublish, or archive text-only announcements targeted to teachers, students, classes, or batches.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onNavigate(noticesTarget)}
                    iconLeft={<Megaphone className="w-4 h-4" aria-hidden="true" />}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>Manage Notices</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  </Button>
                </div>
              </Card>
            </div>

            <Card
              title="Active Centre Scope & Settings"
              subtitle={
                isFirebaseConnectedMode()
                  ? 'All Auth, Accounts, Academics, Attendance, Assessments, Finance/Salaries, Student Portal & Settings connected to Firebase academy-0007.'
                  : 'All ecosystem modules active in Explicit LOCAL_DEMO Development Mode.'
              }
              padding="sm"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigate('settings')}
                  iconLeft={<Settings className="w-3.5 h-3.5" aria-hidden="true" />}
                >
                  Open Settings
                </Button>
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#687086] dark:text-[#A6B0C3]">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4 text-[#7552D9] dark:text-[#A78BFA]" aria-hidden="true" />
                  <span>
                    Configure centre identity, dynamic app branding, theme defaults, academic session, and notification controls in Settings.
                  </span>
                </span>
                <span>
                  {isFirebaseConnectedMode()
                    ? 'Firebase: Connected (academy-0007)'
                    : 'Firebase: Local Demo Mode'}
                </span>
              </div>
            </Card>
          </>
        )
      )}
    </div>
  );
}
