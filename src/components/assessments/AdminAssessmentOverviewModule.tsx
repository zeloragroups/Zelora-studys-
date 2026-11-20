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
import { formatDateTime, formatShortDate } from '../../utils/formatters';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { SearchInput } from '../ui/SearchInput';
import { Select } from '../ui/Select';
import { StatTile } from '../ui/StatTile';
import { StatusText } from '../ui/StatusText';
import { Table } from '../ui/Table';
import { Tabs } from '../ui/Tabs';

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
      <Alert tone="error" title="Access Restricted">
        Assessment oversight and audited corrections are restricted to Admin accounts.
      </Alert>
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
      <PageHeader
        eyebrow="Admin Oversight · Centre-Wide Assessments, Marks & Audit Logs"
        title="Academic Assessment Overview"
        rightSlot={<StatusText tone="nominal" label="Admin Audit Mode Active" />}
      />

      {banner && (
        <Alert tone="success" onDismiss={() => setBanner(null)}>
          {banner}
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

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
          <Select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
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
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
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
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
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
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            aria-label="Filter by teacher"
          >
            <option value="all">All Teachers</option>
            {teachers.map((t) => (
              <option key={t.accountId} value={t.accountId}>
                {t.name} ({t.accountId})
              </option>
            ))}
          </Select>

          <SearchInput
            value={studentSearch}
            onValueChange={setStudentSearch}
            placeholder="Student ID or Name..."
            aria-label="Search student ID or name"
          />

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter by date"
            className="min-h-[44px] rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-white dark:bg-[#151A1E] px-3.5 text-sm text-[#171D21] dark:text-[#F4F7F6] focus:border-[#18B985] dark:focus:border-[#42DDA9] focus:outline-2 focus:outline-[#35D6A0]/25 dark:focus:outline-[#42DDA9]/25 transition-colors duration-150"
          />

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </Select>

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

        <Tabs
          ariaLabel="Admin assessment categories"
          className="mb-5"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'homework', label: 'Homework', count: overview?.homework.length ?? 0 },
            { id: 'tests', label: 'Objective Tests', count: overview?.tests.length ?? 0 },
            {
              id: 'examinations',
              label: 'Examinations',
              count: overview?.examinations.length ?? 0,
            },
            {
              id: 'audit',
              label: 'Audit Logs',
              count:
                (overview?.marksAuditEntries.length ?? 0) +
                (overview?.homeworkAuditEntries.length ?? 0),
            },
          ]}
        />

        {overview && tab === 'homework' && (
          <Table
            rows={overview.homework}
            rowKey={(r) => r.homework.id}
            loading={loading}
            mobileCardRender={(r) => (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
                      {r.homework.id} · {r.homework.teacherId}
                    </p>
                    <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                      {r.homework.title}
                    </p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                  <StatusText tone="neutral" label={r.indicator.toUpperCase()} />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
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
                    <p className="font-mono text-xs text-[#168A63] dark:text-[#42DDA9] font-semibold">
                      {r.homework.id} · {r.homework.teacherId}
                    </p>
                    <p className="font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                      {r.homework.title}
                    </p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                ),
              },
              {
                key: 'counts',
                header: 'Submissions',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-[#20262B] dark:text-[#F4F7F6]">
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
                    <p className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
                      {r.test.id} · {r.test.teacherId}
                    </p>
                    <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                      {r.test.title}
                    </p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                  <StatusText
                    tone={r.effectiveStatus === 'active' ? 'nominal' : 'neutral'}
                    label={r.effectiveStatus.toUpperCase()}
                  />
                </div>
                <p className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
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
                    <p className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
                      {r.test.id} · {r.test.teacherId}
                    </p>
                    <p className="font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                      {r.test.title}
                    </p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                ),
              },
              {
                key: 'meta',
                header: 'Config & Attempts',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-[#20262B] dark:text-[#F4F7F6]">
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
                    <p className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
                      {r.examination.id} · {r.teacherName}
                    </p>
                    <p className="text-sm font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                      {r.examination.title}
                    </p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                  <StatusText
                    tone={r.examination.resultsReleased ? 'nominal' : 'warning'}
                    label={r.examination.resultsReleased ? 'Released' : 'Not Released'}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
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
                    <p className="font-mono text-xs font-semibold text-[#168A63] dark:text-[#42DDA9]">
                      {r.examination.id} · {r.teacherName}
                    </p>
                    <p className="font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                      {r.examination.title}
                    </p>
                    <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                      {r.className} · {r.batchName} · {r.subjectName}
                    </p>
                  </div>
                ),
              },
              {
                key: 'date',
                header: 'Date & Marks',
                render: (r) => (
                  <span className="font-mono text-xs tabular-nums text-[#20262B] dark:text-[#F4F7F6]">
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
              <h3 className="text-xs font-semibold text-[#68737C] dark:text-[#AAB6B4] mb-2">
                Examination Marks Audit Trail ({overview.marksAuditEntries.length})
              </h3>
              {overview.marksAuditEntries.length === 0 ? (
                <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                  No marks corrections recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#E2E8E5] dark:divide-[#344047] text-xs">
                  {overview.marksAuditEntries.map((aud) => (
                    <li key={aud.id} className="py-2 text-[#20262B] dark:text-[#F4F7F6]">
                      <span className="font-mono font-semibold text-[#168A63] dark:text-[#42DDA9]">
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
              <h3 className="text-xs font-semibold text-[#68737C] dark:text-[#AAB6B4] mb-2">
                Homework Review Audit Trail ({overview.homeworkAuditEntries.length})
              </h3>
              {overview.homeworkAuditEntries.length === 0 ? (
                <p className="text-xs text-[#68737C] dark:text-[#AAB6B4]">
                  No homework review audits recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#E2E8E5] dark:divide-[#344047] text-xs">
                  {overview.homeworkAuditEntries.map((aud) => (
                    <li key={aud.id} className="py-2 text-[#20262B] dark:text-[#F4F7F6]">
                      <span className="font-mono font-semibold text-[#168A63] dark:text-[#42DDA9]">
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
            <p className="text-sm text-[#68737C] dark:text-[#AAB6B4] whitespace-pre-line">
              {hwInspect.homework.instructions}
            </p>
            <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
              {hwInspect.submissions.length === 0 ? (
                <p className="text-xs text-[#68737C] dark:text-[#AAB6B4] py-4">
                  No student submissions yet.
                </p>
              ) : (
                hwInspect.submissions.map((item) => (
                  <div key={item.submission.id} className="py-3 space-y-1 text-xs">
                    <p className="font-semibold text-[#20262B] dark:text-[#F4F7F6]">
                      {item.studentName} ({item.submission.studentId}) ·{' '}
                      {item.submission.status.replace(/_/g, ' ')}
                      {item.submission.marksAwarded !== undefined
                        ? ` · Marks: ${item.submission.marksAwarded}`
                        : ''}
                    </p>
                    <p className="text-[#20262B] dark:text-[#F4F7F6]">
                      {item.submission.responseText}
                    </p>
                    {item.submission.privateTeacherNote && (
                      <p className="text-[#A67317] dark:text-[#E5B04D]">
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
            {correctionError && <Alert tone="error">{correctionError}</Alert>}
            {examInspect.marks.length === 0 ? (
              <p className="text-sm text-[#68737C] dark:text-[#AAB6B4]">
                No marks recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-[#E2E8E5] dark:divide-[#344047]">
                {examInspect.marks.map((m) => (
                  <div
                    key={m.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                        {m.studentName} ({m.studentId})
                      </p>
                      <p className="font-mono text-xs tabular-nums text-[#68737C] dark:text-[#AAB6B4]">
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
                className="rounded-xl border border-[#E2E8E5] dark:border-[#344047] bg-[#F7F9F8] dark:bg-[#151A1E]/65 p-4 space-y-3"
              >
                <p className="text-xs font-semibold text-[#171D21] dark:text-[#F4F7F6]">
                  Audited Correction for {correctingMark.studentName} (Current:{' '}
                  {correctingMark.marksObtained})
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    label="New Marks"
                    type="number"
                    min={0}
                    max={examInspect.examination.maximumMarks}
                    step="0.5"
                    value={correctMarksValue}
                    onChange={(e) => setCorrectMarksValue(e.target.value)}
                    className="tabular-nums"
                    required
                  />
                  <div className="sm:col-span-2">
                    <Input
                      label="Audit Reason"
                      type="text"
                      value={correctReason}
                      onChange={(e) => setCorrectReason(e.target.value)}
                      required
                      placeholder="Mandatory Admin audit reason..."
                    />
                  </div>
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
