import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { academicService } from '../../services';
import { accountService } from '../../services';
import { assessmentService } from '../../services';
import { examinationService } from '../../services';
import { homeworkService } from '../../services';
import type {
  AccountRecord,
  AdminAssessmentOverviewData,
  BatchRecord,
  ClassRecord,
  ExaminationMarks,
  ExaminationRecord,
  HomeworkRecord,
  SubjectRecord,
  TeacherSubmissionViewItem,
} from '../../types';
import { cn } from '../../utils/cn';
import { formatDateTime, formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';
import { Table } from '../ui/Table';

type AdminTab = 'homework' | 'tests' | 'examinations' | 'audit';

export function AdminAssessmentOverviewModule() {
  const { principal } = useAuth();
  const [tab, setTab] = useState<AdminTab>('homework');

  const [overview, setOverview] = useState<AdminAssessmentOverviewData | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [teachers, setTeachers] = useState<AccountRecord[]>([]);

  // Filters
  const [classId, setClassId] = useState('all');
  const [batchId, setBatchId] = useState('all');
  const [subjectId, setSubjectId] = useState('all');
  const [teacherId, setTeacherId] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Admin Homework Inspection Modal
  const [hwInspect, setHwInspect] = useState<{
    homework: HomeworkRecord;
    submissions: TeacherSubmissionViewItem[];
  } | null>(null);

  // Admin Exam Marks & Correction Modal
  const [examInspect, setExamInspect] = useState<{
    examination: ExaminationRecord;
    marks: Array<ExaminationMarks & { studentName: string }>;
  } | null>(null);
  const [correctingMark, setCorrectingMark] = useState<
    (ExaminationMarks & { studentName: string }) | null
  >(null);
  const [correctMarksValue, setCorrectMarksValue] = useState('');
  const [correctReason, setCorrectReason] = useState('');
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!principal || principal.role !== 'admin') {
      setError('Admin authorization required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ov, cls, bat, sub, acct] = await Promise.all([
        assessmentService.getAdminAssessmentOverview(principal, {
          classId,
          batchId,
          subjectId,
          teacherId,
          studentIdSearch: studentSearch,
          date: dateFilter || undefined,
          status: statusFilter,
        }),
        academicService.listClasses(principal),
        academicService.listBatches(principal),
        academicService.listSubjects(principal),
        accountService.listAccounts(principal, { role: 'teacher' }),
      ]);
      setOverview(ov);
      setClasses(cls);
      setBatches(bat);
      setSubjects(sub);
      setTeachers(acct);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load assessment overview.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    principal,
    classId,
    batchId,
    subjectId,
    teacherId,
    studentSearch,
    dateFilter,
    statusFilter,
  ]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  if (!principal || principal.role !== 'admin') {
    return (
      <Card title="Access Restricted">
        <p className="text-sm text-[#D94C5C] dark:text-[#F16B75]">
          Assessment oversight and audited corrections are restricted to Admin accounts.
        </p>
      </Card>
    );
  }

  const openHwInspect = async (hwId: string) => {
    try {
      const detail = await homeworkService.getTeacherHomeworkRosterAndSubmissions(
        principal,
        hwId
      );
      setHwInspect({
        homework: detail.homework,
        submissions: detail.submissions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to inspect homework.');
    }
  };

  const openExamInspect = async (examId: string) => {
    try {
      const roster = await examinationService.getExaminationMarksRoster(
        principal,
        examId
      );
      setExamInspect({
        examination: roster.examination,
        marks: roster.marks,
      });
      setCorrectingMark(null);
      setCorrectionError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to inspect exam marks.');
    }
  };

  const handleAdminMarkCorrection = async (e: FormEvent) => {
    e.preventDefault();
    if (!correctingMark || !examInspect) return;
    setCorrectionSaving(true);
    setCorrectionError(null);
    try {
      await examinationService.correctExaminationMarks(principal, {
        marksRecordId: correctingMark.id,
        newMarksObtained: Number(correctMarksValue),
        reason: correctReason,
      });
      setBanner(
        `Admin audited marks correction recorded for ${correctingMark.studentName} (${correctingMark.studentId}).`
      );
      const refreshed = await examinationService.getExaminationMarksRoster(
        principal,
        examInspect.examination.id
      );
      setExamInspect({
        examination: refreshed.examination,
        marks: refreshed.marks,
      });
      setCorrectingMark(null);
      setCorrectReason('');
      await loadOverview();
    } catch (err) {
      setCorrectionError(
        err instanceof Error ? err.message : 'Unable to apply marks correction.'
      );
    } finally {
      setCorrectionSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
            Admin Oversight · Centre-Wide Assessments, Marks & Audit Logs
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] text-balance">
            Academic Assessment Overview
          </h1>
        </div>
        <StatusText tone="nominal" label="Admin Audit Mode Active" />
      </div>

      {banner && (
        <div
          role="status"
          className="rounded-xl border border-[#168A62]/30 dark:border-[#22C58B]/30 bg-[#168A62]/10 dark:bg-[#22C58B]/15 p-3.5 text-sm text-[#168A62] dark:text-[#22C58B] flex items-center justify-between gap-3"
        >
          <span>{banner}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs font-medium underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/30 bg-[#D94C5C]/10 dark:bg-[#F16B75]/15 p-3.5 text-sm text-[#D94C5C] dark:text-[#F16B75]"
        >
          {error}
        </div>
      )}

      {/* 11 Admin Assessment KPIs */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile
            label="Total Homework"
            value={overview.stats.totalHomeworkCreated}
            caption={`${overview.stats.publishedHomework} published`}
          />
          <StatTile
            label="Homework Pending"
            value={overview.stats.pendingHomeworkSubmissions}
            caption={`${overview.stats.reviewedHomeworkSubmissions} reviewed`}
          />
          <StatTile
            label="Objective Tests"
            value={overview.stats.totalObjectiveTests}
            caption={`${overview.stats.publishedTests} published/active`}
          />
          <StatTile
            label="Test Attempts"
            value={overview.stats.completedTestAttempts}
            caption="Evaluated submissions"
          />
          <StatTile
            label="Examinations"
            value={overview.stats.upcomingExaminations + overview.stats.completedExaminations}
            caption={`${overview.stats.upcomingExaminations} upcoming · ${overview.stats.completedExaminations} done`}
          />
          <StatTile
            label="Marks & Releases"
            value={overview.stats.releasedResults}
            caption={`${overview.stats.pendingMarksEntry} pending marks entry`}
          />
        </div>
      )}

      {/* Multi-Field Filter Bar */}
      <Card
        title="Filter Centre Assessments"
        subtitle="Filter homework, online tests, and examinations across classes, batches, subjects, teachers, and students."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            aria-label="Filter by class"
            className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
          >
            <option value="all">All Classes</option>
            {classes.map((c) => (
              <option key={c.classId} value={c.classId}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            aria-label="Filter by batch"
            className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
          >
            <option value="all">All Batches</option>
            {batches.map((b) => (
              <option key={b.batchId} value={b.batchId}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            aria-label="Filter by subject"
            className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
          >
            <option value="all">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            aria-label="Filter by teacher"
            className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
          >
            <option value="all">All Teachers</option>
            {teachers.map((t) => (
              <option key={t.accountId} value={t.accountId}>
                {t.name} ({t.accountId})
              </option>
            ))}
          </select>

          <input
            type="search"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            placeholder="Student ID or Name..."
            aria-label="Search student ID or name"
            className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
          />

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter by date"
            className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>

          <Button
            variant="secondary"
            onClick={() => {
              setClassId('all');
              setBatchId('all');
              setSubjectId('all');
              setTeacherId('all');
              setStudentSearch('');
              setDateFilter('');
              setStatusFilter('all');
            }}
          >
            Reset Filters
          </Button>
        </div>

        {/* Sub-Tabs */}
        <div className="flex overflow-x-auto gap-1 rounded-xl bg-[#F1EEFA] dark:bg-[#202844] p-1 mb-5">
          {(
            [
              { id: 'homework', label: `Homework (${overview?.homework.length ?? 0})` },
              { id: 'tests', label: `Objective Tests (${overview?.tests.length ?? 0})` },
              {
                id: 'examinations',
                label: `Examinations (${overview?.examinations.length ?? 0})`,
              },
              {
                id: 'audit',
                label: `Audit Logs (${
                  (overview?.marksAuditEntries.length ?? 0) +
                  (overview?.homeworkAuditEntries.length ?? 0)
                })`,
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'min-h-[40px] px-3.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors',
                tab === item.id
                  ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white shadow-xs'
                  : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {overview && tab === 'homework' && (
          <Table
            rows={overview.homework}
            rowKey={(r) => r.homework.id}
            loading={loading}
            mobileCardRender={(r) => (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {r.homework.id} · {r.homework.teacherId}
                    </p>
                    <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {r.homework.title}
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                  <StatusText tone="neutral" label={r.indicator.toUpperCase()} />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-mono text-xs tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                    {r.submittedCount}/{r.totalAssignedStudents} submitted ({r.reviewedCount} reviewed)
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void openHwInspect(r.homework.id)}
                    iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    Submissions
                  </Button>
                </div>
              </div>
            )}
            columns={[
              {
                key: 'hw',
                header: 'Homework',
                render: (r) => (
                  <div>
                    <p className="font-mono text-xs text-[#7552D9] dark:text-[#A78BFA] font-semibold">
                      {r.homework.id} · {r.homework.teacherId}
                    </p>
                    <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {r.homework.title}
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                ),
              },
              {
                key: 'counts',
                header: 'Submissions',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                    {r.submittedCount}/{r.totalAssignedStudents} submitted ({r.reviewedCount}{' '}
                    reviewed)
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StatusText tone="neutral" label={r.indicator.toUpperCase()} />,
              },
              {
                key: 'inspect',
                header: 'Inspect',
                render: (r) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void openHwInspect(r.homework.id)}
                    iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    Submissions
                  </Button>
                ),
              },
            ]}
          />
        )}

        {overview && tab === 'tests' && (
          <Table
            rows={overview.tests}
            rowKey={(r) => r.test.id}
            loading={loading}
            mobileCardRender={(r) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {r.test.id} · {r.test.teacherId}
                    </p>
                    <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {r.test.title}
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                  <StatusText
                    tone={r.effectiveStatus === 'active' ? 'nominal' : 'neutral'}
                    label={r.effectiveStatus.toUpperCase()}
                  />
                </div>
                <p className="font-mono text-xs tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                  {r.test.questions.length} MCQs · {r.test.totalMarks}m · {r.attemptCount} attempts ({r.evaluatedCount} evaluated)
                </p>
              </div>
            )}
            columns={[
              {
                key: 'test',
                header: 'Objective Test',
                render: (r) => (
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {r.test.id} · {r.test.teacherId}
                    </p>
                    <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {r.test.title}
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                ),
              },
              {
                key: 'meta',
                header: 'Config & Attempts',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                    {r.test.questions.length} MCQs · {r.test.totalMarks}m · {r.attemptCount}{' '}
                    attempts ({r.evaluatedCount} evaluated)
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => (
                  <StatusText
                    tone={r.effectiveStatus === 'active' ? 'nominal' : 'neutral'}
                    label={r.effectiveStatus.toUpperCase()}
                  />
                ),
              },
            ]}
          />
        )}

        {overview && tab === 'examinations' && (
          <Table
            rows={overview.examinations}
            rowKey={(r) => r.examination.id}
            loading={loading}
            mobileCardRender={(r) => (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {r.examination.id} · {r.teacherName}
                    </p>
                    <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {r.examination.title}
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                  <StatusText
                    tone={r.examination.resultsReleased ? 'nominal' : 'warning'}
                    label={r.examination.resultsReleased ? 'Released' : 'Not Released'}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-mono text-xs tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                    {formatShortDate(r.examination.examDate)} · {r.marksEnteredCount}/{r.eligibleStudentCount} marks
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void openExamInspect(r.examination.id)}
                  >
                    Inspect Marks
                  </Button>
                </div>
              </div>
            )}
            columns={[
              {
                key: 'exam',
                header: 'Examination',
                render: (r) => (
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {r.examination.id} · {r.teacherName}
                    </p>
                    <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {r.examination.title}
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                ),
              },
              {
                key: 'date',
                header: 'Date & Marks',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                    {formatShortDate(r.examination.examDate)} · {r.marksEnteredCount}/
                    {r.eligibleStudentCount} marks recorded
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Release State',
                render: (r) => (
                  <StatusText
                    tone={r.examination.resultsReleased ? 'nominal' : 'warning'}
                    label={r.examination.resultsReleased ? 'Released' : 'Not Released'}
                  />
                ),
              },
              {
                key: 'actions',
                header: 'Inspect / Correct',
                render: (r) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void openExamInspect(r.examination.id)}
                  >
                    Inspect Marks
                  </Button>
                ),
              },
            ]}
          />
        )}

        {overview && tab === 'audit' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3] mb-2">
                Examination Marks Audit Trail ({overview.marksAuditEntries.length})
              </h3>
              {overview.marksAuditEntries.length === 0 ? (
                <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                  No marks corrections recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] text-xs">
                  {overview.marksAuditEntries.map((aud) => (
                    <li key={aud.id} className="py-2 text-[#17172B] dark:text-[#F8FAFC]">
                      <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                        {aud.id}
                      </span>{' '}
                      · Exam {aud.examinationId} · Student {aud.studentId}:{' '}
                      <span className="font-mono tabular-nums">
                        {aud.previousMarks} → {aud.newMarks}
                      </span>{' '}
                      by {aud.actorId} on {formatDateTime(aud.timestamp)} — Reason:{' '}
                      {aud.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3] mb-2">
                Homework Review Audit Trail ({overview.homeworkAuditEntries.length})
              </h3>
              {overview.homeworkAuditEntries.length === 0 ? (
                <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                  No homework review audits recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] text-xs">
                  {overview.homeworkAuditEntries.map((aud) => (
                    <li key={aud.id} className="py-2 text-[#17172B] dark:text-[#F8FAFC]">
                      <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                        {aud.id}
                      </span>{' '}
                      · Homework {aud.homeworkId} · {aud.action.replace(/_/g, ' ')} by{' '}
                      {aud.actorId} on {formatDateTime(aud.timestamp)}
                      {aud.reason ? ` — ${aud.reason}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Homework Inspection Modal */}
      <Modal
        open={Boolean(hwInspect)}
        onClose={() => setHwInspect(null)}
        title={hwInspect ? `Homework Inspection: ${hwInspect.homework.title}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {hwInspect && (
          <div className="space-y-4">
            <p className="text-sm text-[#687086] dark:text-[#A6B0C3] whitespace-pre-line">
              {hwInspect.homework.instructions}
            </p>
            <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
              {hwInspect.submissions.length === 0 ? (
                <p className="text-xs text-[#687086] dark:text-[#A6B0C3] py-4">
                  No student submissions yet.
                </p>
              ) : (
                hwInspect.submissions.map((item) => (
                  <div key={item.submission.id} className="py-3 space-y-1 text-xs">
                    <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {item.studentName} ({item.submission.studentId}) ·{' '}
                      {item.submission.status.replace(/_/g, ' ')}
                      {item.submission.marksAwarded !== undefined
                        ? ` · Marks: ${item.submission.marksAwarded}`
                        : ''}
                    </p>
                    <p className="text-[#17172B] dark:text-[#F8FAFC]">
                      {item.submission.responseText}
                    </p>
                    {item.submission.privateTeacherNote && (
                      <p className="text-[#B7791F] dark:text-[#F5B942]">
                        Private Teacher Note: {item.submission.privateTeacherNote}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Examination Marks Inspection & Admin Audited Correction Modal */}
      <Modal
        open={Boolean(examInspect)}
        onClose={() => setExamInspect(null)}
        title={examInspect ? `Marks Ledger: ${examInspect.examination.title}` : ''}
        subtitle={
          examInspect
            ? `${examInspect.examination.id} · Maximum Marks: ${examInspect.examination.maximumMarks}`
            : ''
        }
        maxWidthClass="max-w-2xl"
      >
        {examInspect && (
          <div className="space-y-4">
            {correctionError && (
              <div
                role="alert"
                className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/30 bg-[#D94C5C]/10 dark:bg-[#F16B75]/15 p-3 text-xs text-[#D94C5C] dark:text-[#F16B75]"
              >
                {correctionError}
              </div>
            )}
            {examInspect.marks.length === 0 ? (
              <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                No marks recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                {examInspect.marks.map((m) => (
                  <div
                    key={m.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        {m.studentName} ({m.studentId})
                      </p>
                      <p className="font-mono text-xs tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                        {m.marksObtained} / {m.maximumMarks} ({m.percentage}% ·{' '}
                        {m.resultStatus.toUpperCase()})
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setCorrectingMark(m);
                        setCorrectMarksValue(String(m.marksObtained));
                        setCorrectReason('');
                        setCorrectionError(null);
                      }}
                    >
                      Admin Correct
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {correctingMark && (
              <form
                onSubmit={handleAdminMarkCorrection}
                className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-4 space-y-3"
              >
                <p className="text-xs font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                  Audited Correction for {correctingMark.studentName} (Current:{' '}
                  {correctingMark.marksObtained})
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    type="number"
                    min={0}
                    max={examInspect.examination.maximumMarks}
                    step="0.5"
                    value={correctMarksValue}
                    onChange={(e) => setCorrectMarksValue(e.target.value)}
                    required
                    className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                  />
                  <input
                    type="text"
                    value={correctReason}
                    onChange={(e) => setCorrectReason(e.target.value)}
                    required
                    placeholder="Mandatory Admin audit reason..."
                    className="sm:col-span-2 min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCorrectingMark(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" loading={correctionSaving}>
                    Apply Admin Correction
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
