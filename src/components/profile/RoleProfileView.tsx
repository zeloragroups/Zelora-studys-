import { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  CalendarCheck2,
  ClipboardCheck,
  GraduationCap,
  IndianRupee,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInterface } from '../../context/InterfaceContext';
import {
  academicService,
  assessmentService,
  attendanceService,
  examinationService,
  financialReportService,
  homeworkService,
  studentPortalService,
  testService,
} from '../../services';
import type { StudentDashboardSummary } from '../../services/contracts/studentPortalService';
import type {
  AcademicOverviewStats,
  AdminAssessmentOverviewData,
  AdminAttendanceOverview,
  AdminFinancialDashboardData,
  ExaminationDetailView,
  StudentResultsDashboardData,
  TeacherHomeworkSummaryItem,
  TeacherObjectiveTestSummary,
  TeacherWorkspaceData,
  AttendanceSessionDetail,
} from '../../types';
import { formatCurrency, formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';

interface RoleProfileViewProps {
  roleLabel: string;
}

interface TeacherPerformanceState {
  workspace: TeacherWorkspaceData;
  sessions: AttendanceSessionDetail[];
  homework: TeacherHomeworkSummaryItem[];
  tests: TeacherObjectiveTestSummary[];
  exams: ExaminationDetailView[];
}

interface AdminPerformanceState {
  academic: AcademicOverviewStats;
  attendance: AdminAttendanceOverview;
  assessments: AdminAssessmentOverviewData;
  finance: AdminFinancialDashboardData;
}

/**
 * Simplified Profile View displaying strictly two sections:
 * 1. Name (authenticated user's profile identity header)
 * 2. Performance (genuine, role-scoped metrics from authorized services)
 *
 * Account sign-out, theme controls, and password forms are intentionally excluded from Profile.
 */
export function RoleProfileView({ roleLabel }: RoleProfileViewProps) {
  const { principal } = useAuth();
  const { branding } = useInterface();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [studentDash, setStudentDash] = useState<StudentDashboardSummary | null>(null);
  const [studentResults, setStudentResults] = useState<StudentResultsDashboardData | null>(null);
  const [teacherPerf, setTeacherPerf] = useState<TeacherPerformanceState | null>(null);
  const [adminPerf, setAdminPerf] = useState<AdminPerformanceState | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!principal) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const loadRolePerformance = async () => {
      try {
        if (principal.role === 'student') {
          const [dash, results] = await Promise.all([
            studentPortalService.getMyStudentDashboard(principal),
            assessmentService.getStudentResultsDashboard(principal),
          ]);
          if (!cancelled) {
            setStudentDash(dash);
            setStudentResults(results);
          }
        } else if (principal.role === 'teacher') {
          const [workspace, sessions, homework, tests, exams] = await Promise.all([
            academicService.getMyTeacherWorkspace(principal),
            attendanceService.listMyTeacherSessions(principal),
            homeworkService.listTeacherHomework(principal),
            testService.listTeacherTests(principal),
            examinationService.listTeacherExaminations(principal),
          ]);
          if (!cancelled) {
            setTeacherPerf({ workspace, sessions, homework, tests, exams });
          }
        } else if (principal.role === 'admin') {
          const [academic, attendance, assessments, finance] = await Promise.all([
            academicService.getAcademicOverview(principal),
            attendanceService.getAdminAttendanceOverview(principal),
            assessmentService.getAdminAssessmentOverview(principal),
            financialReportService.getAdminFinancialDashboard(principal),
          ]);
          if (!cancelled) {
            setAdminPerf({ academic, attendance, assessments, finance });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to load profile performance details.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadRolePerformance();
    return () => {
      cancelled = true;
    };
  }, [principal]);

  if (!principal) {
    return null;
  }

  const studentBatchSummary =
    principal.role === 'student' && studentDash?.profile.enrolmentStatus === 'active'
      ? `${studentDash.profile.className ?? studentDash.profile.classId} · ${studentDash.profile.batchName ?? studentDash.profile.batchId}`
      : null;

  const studentAssessedSummary = (() => {
    if (!studentResults || studentResults.results.length === 0) {
      return { display: 'Not available', caption: 'No released marks yet' };
    }
    const totals = studentResults.results.reduce(
      (acc, r) => ({
        obtained: acc.obtained + r.marksObtained,
        maximum: acc.maximum + r.maximumMarks,
      }),
      { obtained: 0, maximum: 0 }
    );
    if (totals.maximum <= 0) {
      return { display: 'Not available', caption: 'No scored marks recorded' };
    }
    const pct = Math.round((totals.obtained / totals.maximum) * 1000) / 10;
    return {
      display: `${pct}%`,
      caption: `${totals.obtained} / ${totals.maximum} across ${studentResults.results.length} released item(s)`,
    };
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${branding.centreName} · ${branding.academicYearLabel}`}
        title="Profile"
        subtitle="Your authenticated identity and verified role performance."
      />

      {/* Section 1: Name */}
      <section aria-labelledby="profile-name-heading">
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-[#20262B] dark:bg-[#244B3E] text-[#35D6A0] dark:text-[#42DDA9] flex items-center justify-center shrink-0 border border-[#343C42] dark:border-[#316453]">
                <UserCircle2 className="w-7 h-7" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#68737C] dark:text-[#AAB6B4]">
                  Name
                </p>
                <h2
                  id="profile-name-heading"
                  className="mt-0.5 text-xl sm:text-2xl font-semibold tracking-tight text-[#171D21] dark:text-[#F4F7F6] truncate"
                >
                  {principal.fullName}
                </h2>
                <p className="mt-1 text-xs text-[#68737C] dark:text-[#AAB6B4] flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono font-medium text-[#343C42] dark:text-[#D4DDDC]">
                    {principal.loginId}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{roleLabel}</span>
                  {studentBatchSummary && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{studentBatchSummary}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="shrink-0 self-start sm:self-center">
              <StatusText
                tone={principal.status === 'active' ? 'nominal' : 'danger'}
                label={principal.status === 'active' ? 'Active' : 'Deactivated'}
              />
            </div>
          </div>
        </Card>
      </section>

      {/* Section 2: Performance */}
      <section aria-labelledby="profile-performance-heading" className="space-y-4">
        <div>
          <h2
            id="profile-performance-heading"
            className="text-base sm:text-lg font-semibold tracking-tight text-[#171D21] dark:text-[#F4F7F6]"
          >
            Performance
          </h2>
          <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] mt-0.5">
            {principal.role === 'student'
              ? 'Academic attendance, subject progress, and released assessment results.'
              : principal.role === 'teacher'
                ? 'Teaching workload, attendance sessions, homework reviews, and assessments delivered.'
                : 'Centre-wide academic, attendance, assessment, and verified collection metrics.'}
          </p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="h-28 rounded-2xl bg-[#F0F4F2] dark:bg-[#252E33]/70 animate-pulse"
              />
            ))}
          </div>
        ) : null}

        {/* Student Performance */}
        {!loading && principal.role === 'student' && studentDash && studentResults && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatTile
                label="Attendance Rate"
                value={studentDash.attendanceSummary.displayPercentage}
                caption={
                  studentDash.attendanceSummary.eligibleDenominator > 0
                    ? `${studentDash.attendanceSummary.attendedCount} attended of ${studentDash.attendanceSummary.eligibleDenominator} eligible`
                    : 'No attendance sessions recorded yet'
                }
                icon={<CalendarCheck2 className="w-4 h-4" strokeWidth={1.75} />}
                tone="mint"
              />
              <StatTile
                label="Overall Assessed Score"
                value={studentAssessedSummary.display}
                caption={studentAssessedSummary.caption}
                icon={<Award className="w-4 h-4" strokeWidth={1.75} />}
              />
              <StatTile
                label="Released Results"
                value={studentResults.releasedCount}
                caption={
                  studentResults.unreleasedPendingCount > 0
                    ? `${studentResults.unreleasedPendingCount} pending release`
                    : 'All completed marks released'
                }
                icon={<ClipboardCheck className="w-4 h-4" strokeWidth={1.75} />}
              />
            </div>

            <Card
              title="Subject Academic Progress"
              subtitle="Verified marks and availability across your enrolled subjects."
            >
              {studentResults.subjectSummaries.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="w-5 h-5" strokeWidth={1.75} />}
                  title="No subject performance data yet"
                  description="Subject scores appear here once assessments or examinations are released for your batch."
                />
              ) : (
                <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
                  {studentResults.subjectSummaries.map((sub) => (
                    <div
                      key={sub.subjectId}
                      className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                          {sub.subjectName}
                        </p>
                        <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                          {sub.availability === 'result_available'
                            ? `${sub.releasedAssessmentsCount} released · ${sub.totalMarksObtained} / ${sub.totalMaximumMarks} marks`
                            : sub.availability === 'result_not_released'
                              ? `${sub.pendingAssessmentsCount} assessment(s) awaiting mark release`
                              : sub.availability === 'assessment_pending'
                                ? `${sub.pendingAssessmentsCount} assessment(s) scheduled or in progress`
                                : 'No assessments recorded yet'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-sm font-semibold tabular-nums text-[#171D21] dark:text-[#F4F7F6]">
                          {sub.displayPercentage}
                        </span>
                        <StatusText
                          tone={
                            sub.availability === 'result_available'
                              ? 'nominal'
                              : sub.availability === 'result_not_released'
                                ? 'warning'
                                : 'neutral'
                          }
                          label={
                            sub.availability === 'result_available'
                              ? 'Available'
                              : sub.availability === 'result_not_released'
                                ? 'Pending Release'
                                : sub.availability === 'assessment_pending'
                                  ? 'Scheduled'
                                  : 'No Data'
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {studentResults.results.length > 0 && (
              <Card
                title="Recent Released Results"
                subtitle="Latest verified examination, test, and homework marks."
              >
                <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
                  {studentResults.results.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                          {item.title}
                        </p>
                        <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] tabular-nums">
                          {item.subjectName} · {formatShortDate(item.assessmentDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-xs sm:text-sm font-semibold tabular-nums text-[#171D21] dark:text-[#F4F7F6]">
                          {item.marksObtained} / {item.maximumMarks} ({item.percentage}%)
                        </span>
                        <StatusText
                          tone={
                            item.resultStatus === 'pass'
                              ? 'nominal'
                              : item.resultStatus === 'fail'
                                ? 'danger'
                                : 'info'
                          }
                          label={
                            item.resultStatus === 'pass'
                              ? 'Pass'
                              : item.resultStatus === 'fail'
                                ? 'Needs Focus'
                                : 'Recorded'
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Teacher Performance */}
        {!loading && principal.role === 'teacher' && teacherPerf && (
          <div className="space-y-5">
            {(() => {
              const submittedSessions = teacherPerf.sessions.filter(
                (s) => s.session.status !== 'draft'
              );
              const draftSessions = teacherPerf.sessions.filter(
                (s) => s.session.status === 'draft'
              );
              const publishedHomework = teacherPerf.homework.filter(
                (h) => h.homework.status === 'published'
              );
              const totalReviewedSubmissions = teacherPerf.homework.reduce(
                (acc, h) => acc + h.reviewedCount,
                0
              );
              const publishedTests = teacherPerf.tests.filter(
                (t) => t.test.status === 'published'
              );
              const totalTestAttempts = teacherPerf.tests.reduce(
                (acc, t) => acc + t.attemptCount,
                0
              );
              const releasedExams = teacherPerf.exams.filter(
                (e) => e.examination.resultsReleased
              ).length;

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatTile
                      label="Assigned Batches"
                      value={teacherPerf.workspace.assignments.length}
                      caption={`${teacherPerf.workspace.timetable.length} weekly session(s)`}
                      icon={<GraduationCap className="w-4 h-4" strokeWidth={1.75} />}
                      tone="mint"
                    />
                    <StatTile
                      label="Attendance Submitted"
                      value={submittedSessions.length}
                      caption={
                        draftSessions.length > 0
                          ? `${draftSessions.length} draft session(s) pending`
                          : 'No pending drafts'
                      }
                      icon={<CalendarCheck2 className="w-4 h-4" strokeWidth={1.75} />}
                    />
                    <StatTile
                      label="Published Homework"
                      value={publishedHomework.length}
                      caption={`${totalReviewedSubmissions} submission(s) reviewed`}
                      icon={<BookOpen className="w-4 h-4" strokeWidth={1.75} />}
                    />
                    <StatTile
                      label="Tests & Exams"
                      value={publishedTests.length + teacherPerf.exams.length}
                      caption={`${totalTestAttempts} test attempt(s) · ${releasedExams} exam(s) released`}
                      icon={<ClipboardCheck className="w-4 h-4" strokeWidth={1.75} />}
                    />
                  </div>

                  <Card
                    title="Assigned Teaching Scope"
                    subtitle="Classes, batches, and subjects assigned to your account."
                  >
                    {teacherPerf.workspace.assignments.length === 0 ? (
                      <EmptyState
                        icon={<GraduationCap className="w-5 h-5" strokeWidth={1.75} />}
                        title="No batch assignments yet"
                        description="Assigned classes, batches, and subjects appear here once configured by your Administrator."
                      />
                    ) : (
                      <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
                        {teacherPerf.workspace.assignments.map((item) => (
                          <div
                            key={item.assignment.id}
                            className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                                {item.subjectRecord.name}
                              </p>
                              <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                                {item.classRecord.name} · {item.batchRecord.name}
                              </p>
                            </div>
                            <StatusText tone="nominal" label="Assigned" />
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </>
              );
            })()}
          </div>
        )}

        {/* Admin Performance */}
        {!loading && principal.role === 'admin' && adminPerf && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Centre Attendance"
                value={adminPerf.attendance.overallSummary.displayPercentage}
                caption={`${adminPerf.attendance.submittedSessions} submitted · ${adminPerf.attendance.draftSessions} draft`}
                icon={<CalendarCheck2 className="w-4 h-4" strokeWidth={1.75} />}
                tone="mint"
              />
              <StatTile
                label="Enrolled Students"
                value={adminPerf.academic.enrolledStudents}
                caption={`${adminPerf.academic.activeClasses} active classes · ${adminPerf.academic.activeBatches} batches`}
                icon={<GraduationCap className="w-4 h-4" strokeWidth={1.75} />}
              />
              <StatTile
                label="Released Assessments"
                value={adminPerf.assessments.stats.releasedResults}
                caption={`${adminPerf.assessments.stats.publishedTests} active tests · ${adminPerf.assessments.stats.pendingMarksEntry} pending marks`}
                icon={<ClipboardCheck className="w-4 h-4" strokeWidth={1.75} />}
              />
              <StatTile
                label="Verified Collections"
                value={formatCurrency(
                  Math.round(adminPerf.finance.totalVerifiedCollectionsPaise / 100)
                )}
                caption={`${adminPerf.finance.pendingPaymentClaimsCount} pending claim verification(s)`}
                icon={<IndianRupee className="w-4 h-4" strokeWidth={1.75} />}
              />
            </div>

            <Card
              title="Class Attendance Performance"
              subtitle="Submitted session attendance averages by active class."
            >
              {adminPerf.attendance.byClass.length === 0 ? (
                <EmptyState
                  icon={<CalendarCheck2 className="w-5 h-5" strokeWidth={1.75} />}
                  title="No class attendance sessions yet"
                  description="Class-level attendance performance will appear after teachers submit attendance sessions."
                />
              ) : (
                <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
                  {adminPerf.attendance.byClass.map((cls) => (
                    <div
                      key={cls.classId}
                      className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6] truncate">
                          {cls.className}
                        </p>
                        <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] tabular-nums">
                          {cls.submittedSessions} submitted of {cls.totalSessions} session(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono text-sm font-semibold tabular-nums text-[#171D21] dark:text-[#F4F7F6]">
                          {cls.summary.displayPercentage}
                        </span>
                        <StatusText
                          tone={
                            cls.summary.percentage === null
                              ? 'neutral'
                              : cls.summary.percentage >= 75
                                ? 'nominal'
                                : 'warning'
                          }
                          label={
                            cls.summary.percentage === null
                              ? 'Pending'
                              : cls.summary.percentage >= 75
                                ? 'Healthy'
                                : 'Attention'
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
