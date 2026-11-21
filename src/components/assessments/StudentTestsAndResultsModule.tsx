import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  Play,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { assessmentService } from '../../services';
import { examinationService } from '../../services';
import { testService } from '../../services';
import type {
  StudentExaminationItem,
  StudentObjectiveQuestionView,
  StudentObjectiveTestSummary,
  StudentResultsDashboardData,
  StudentSafeTestAttempt,
  SubjectPerformanceAvailability,
} from '../../types';
import { cn } from '../../utils/cn';
import { formatDateTime, formatShortDate } from '../../utils/formatters';
import { ComparisonBarChart } from '../charts/AnalyticsCharts';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { PageHeader } from '../ui/PageHeader';
import { Select } from '../ui/Select';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';
import { Tabs } from '../ui/Tabs';

type StudentSubTab = 'tests' | 'examinations' | 'results';
type TestStatusFilter =
  | 'all'
  | 'upcoming'
  | 'available'
  | 'in_progress'
  | 'submitted'
  | 'results_available'
  | 'closed';
type ExamStatusFilter = 'all' | 'upcoming' | 'released' | 'pending_release';

const TEST_FILTER_TABS: Array<{ id: TestStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'available', label: 'Available' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'results_available', label: 'Results Available' },
  { id: 'closed', label: 'Closed' },
];

const EXAM_FILTER_TABS: Array<{ id: ExamStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'pending_release', label: 'Awaiting Release' },
  { id: 'released', label: 'Results Released' },
];

function matchesTestFilter(
  test: StudentObjectiveTestSummary,
  filter: TestStatusFilter
): boolean {
  if (filter === 'all') return true;
  if (filter === 'upcoming') return test.effectiveStatus === 'published';
  if (filter === 'available') {
    return (
      test.effectiveStatus === 'active' &&
      test.attemptsRemaining > 0 &&
      !test.inProgressAttempt
    );
  }
  if (filter === 'in_progress') return Boolean(test.inProgressAttempt);
  if (filter === 'submitted') {
    return test.completedAttempts.some((a) => !a.resultsVisible);
  }
  if (filter === 'results_available') {
    return test.completedAttempts.some((a) => a.resultsVisible);
  }
  if (filter === 'closed') {
    return test.effectiveStatus === 'completed' && !test.inProgressAttempt;
  }
  return true;
}

function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

const SUBJECT_AVAILABILITY_META: Record<
  SubjectPerformanceAvailability,
  { label: string; tone: SemanticTone }
> = {
  no_assessment_yet: { label: 'No assessment yet', tone: 'neutral' },
  assessment_pending: { label: 'Assessment pending', tone: 'warning' },
  result_not_released: { label: 'Result not released', tone: 'warning' },
  result_available: { label: 'Result available', tone: 'nominal' },
};

interface StudentTestsAndResultsModuleProps {
  initialSubTab?: StudentSubTab;
}

export function StudentTestsAndResultsModule({
  initialSubTab = 'tests',
}: StudentTestsAndResultsModuleProps) {
  const { principal } = useAuth();
  const [subTab, setSubTab] = useState<StudentSubTab>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const [tests, setTests] = useState<StudentObjectiveTestSummary[]>([]);
  const [exams, setExams] = useState<StudentExaminationItem[]>([]);
  const [resultsDash, setResultsDash] = useState<StudentResultsDashboardData | null>(null);
  const [allReleasedForOptions, setAllReleasedForOptions] = useState<
    StudentResultsDashboardData['results']
  >([]);

  const [testFilter, setTestFilter] = useState<TestStatusFilter>('all');
  const [examFilter, setExamFilter] = useState<ExamStatusFilter>('all');
  const [preStartTestModal, setPreStartTestModal] =
    useState<StudentObjectiveTestSummary | null>(null);

  // Result filters
  const [filterSubjectId, setFilterSubjectId] = useState('all');
  const [filterSourceType, setFilterSourceType] = useState<
    'all' | 'examination' | 'objective_test' | 'homework'
  >('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pass' | 'fail' | 'recorded'>(
    'all'
  );
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterYear, setFilterYear] = useState('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Active Test Runner State
  const [activeRunner, setActiveRunner] = useState<{
    test: StudentObjectiveTestSummary;
    attempt: StudentSafeTestAttempt;
    questions: StudentObjectiveQuestionView[];
  } | null>(null);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [reviewScreenOpen, setReviewScreenOpen] = useState(false);
  const [confirmSubmitModal, setConfirmSubmitModal] = useState(false);
  const [nowTickMs, setNowTickMs] = useState(() => Date.now());
  const [submittingAttempt, setSubmittingAttempt] = useState(false);

  // Post-submit or attempt detail viewer
  const [reviewDetailModal, setReviewDetailModal] = useState<{
    test: StudentObjectiveTestSummary;
    attempt: StudentSafeTestAttempt;
    questions: StudentObjectiveQuestionView[];
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!principal || principal.role !== 'student') {
      setError('Student authentication is required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tList, eList, rDash, rAll] = await Promise.all([
        testService.listStudentAvailableTests(principal),
        examinationService.listStudentExaminations(principal),
        assessmentService.getStudentResultsDashboard(principal, {
          subjectId: filterSubjectId,
          sourceType: filterSourceType,
          resultStatus: filterStatus,
          month: filterMonth,
          year: filterYear,
        }),
        assessmentService.getStudentResultsDashboard(principal),
      ]);
      setTests(tList);
      setExams(eList);
      setResultsDash(rDash);
      setAllReleasedForOptions(rAll.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tests and results.');
    } finally {
      setLoading(false);
    }
  }, [
    principal,
    filterSubjectId,
    filterSourceType,
    filterStatus,
    filterMonth,
    filterYear,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Live countdown ticker only while an in-progress attempt is open
  useEffect(() => {
    if (!activeRunner || activeRunner.attempt.status !== 'in_progress') {
      return;
    }
    const timer = window.setInterval(() => {
      setNowTickMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeRunner]);

  const remainingMs = useMemo(() => {
    if (!activeRunner) return 0;
    return Math.max(
      0,
      new Date(activeRunner.attempt.expiresAt).getTime() - nowTickMs
    );
  }, [activeRunner, nowTickMs]);

  if (!principal || principal.role !== 'student') {
    return (
      <Alert tone="error" title="Access Restricted">
        Tests and results are accessible only with Student / Parent credentials.
      </Alert>
    );
  }

  const handleStartOrResume = async (testId: string) => {
    setError(null);
    try {
      const started = await testService.startOrResumeTestAttempt(principal, testId);
      setPreStartTestModal(null);
      setActiveRunner(started);
      setCurrentQIdx(0);
      setReviewScreenOpen(false);
      setConfirmSubmitModal(false);
      setNowTickMs(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start test attempt.');
    }
  };

  const handleSelectOption = async (questionId: string, optionId: string) => {
    if (!activeRunner) return;
    try {
      const updated = await testService.saveTestAttemptAnswer(
        principal,
        activeRunner.attempt.id,
        questionId,
        optionId
      );
      setActiveRunner((prev) => (prev ? { ...prev, attempt: updated } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save answer.');
    }
  };

  const handleConfirmFinalSubmit = async () => {
    if (!activeRunner) return;
    setSubmittingAttempt(true);
    setError(null);
    try {
      const result = await testService.submitAndEvaluateTestAttempt(
        principal,
        activeRunner.attempt.id
      );
      const testMeta = activeRunner.test;
      setConfirmSubmitModal(false);
      setActiveRunner(null);
      setReviewDetailModal({
        test: testMeta,
        attempt: result.attempt,
        questions: result.questions,
      });
      setBanner(
        result.attempt.resultsVisible
          ? `Test submitted and auto-scored: ${result.attempt.marksObtained} / ${result.attempt.totalMarks} (${result.attempt.percentage}%).`
          : 'Test submitted successfully. Results will appear once released by your teacher.'
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit test.');
    } finally {
      setSubmittingAttempt(false);
    }
  };

  const handleOpenAttemptDetail = async (attemptId: string) => {
    try {
      const detail = await testService.getStudentAttemptReviewDetail(
        principal,
        attemptId
      );
      setReviewDetailModal(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load attempt detail.');
    }
  };

  // -------------------- DISTRACTION-FREE TEST RUNNER --------------------
  if (activeRunner) {
    const { test, attempt, questions } = activeRunner;
    const currentQuestion = questions[currentQIdx] ?? questions[0];
    const answeredCount = questions.filter((q) => Boolean(attempt.answers[q.id])).length;
    const unansweredCount = questions.length - answeredCount;
    const isLowTime = remainingMs > 0 && remainingMs <= 120_000;
    const isExpired = remainingMs <= 0;

    return (
      <div className="space-y-5">
        <Card
          title={test.title}
          subtitle={`${test.subjectName} · Attempt #${attempt.attemptNumber} of ${test.maximumAttempts} · ${test.totalMarks} Total Marks`}
          action={
            <div className="text-right space-y-1">
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 font-mono text-base font-bold tabular-nums',
                  isExpired
                    ? 'text-[var(--error)]'
                    : isLowTime
                      ? 'text-[var(--warning)]'
                      : 'text-[var(--accent-text)]'
                )}
              >
                <Clock className="w-4 h-4" aria-hidden="true" />
                <span>{formatCountdown(remainingMs)}</span>
              </div>
              <p className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                Answered {answeredCount} / {questions.length} · Unanswered {unansweredCount}
              </p>
            </div>
          }
        >
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3.5 py-2.5 text-xs text-[var(--text-muted)] flex items-center justify-between gap-3 mb-5">
            <span>
              Countdown timer is enforced in-browser on the Spark free plan; server-side deadline enforcement requires Cloud Functions.
            </span>
            <button
              type="button"
              onClick={() => {
                setActiveRunner(null);
                void loadData();
              }}
              className="text-[var(--accent-text)] font-medium underline shrink-0 cursor-pointer"
            >
              Pause & Exit (Progress Saved)
            </button>
          </div>

          {error && (
            <Alert tone="error" className="mb-4">
              {error}
            </Alert>
          )}

          {/* Question Navigator Grid */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">
              Question Navigator
            </p>
            <div className="flex flex-wrap gap-2">
              {questions.map((q, idx) => {
                const answered = Boolean(attempt.answers[q.id]);
                const active = !reviewScreenOpen && idx === currentQIdx;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setReviewScreenOpen(false);
                      setCurrentQIdx(idx);
                    }}
                    className={cn(
                      'min-w-[44px] min-h-[44px] px-2.5 rounded-xl text-xs font-mono font-semibold border cursor-pointer transition-colors',
                      active
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]'
                        : answered
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] border-[var(--accent-border)]'
                          : 'bg-[var(--surface)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--surface-secondary)]'
                    )}
                  >
                    {idx + 1}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setReviewScreenOpen(true)}
                className={cn(
                  'min-h-[44px] px-3.5 rounded-xl text-xs font-medium border cursor-pointer whitespace-nowrap transition-colors',
                  reviewScreenOpen
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)] font-semibold'
                    : 'bg-[var(--surface)] text-[var(--text-primary)] border-[var(--border)] hover:bg-[var(--surface-secondary)]'
                )}
              >
                Review All Questions
              </button>
            </div>
          </div>

          {reviewScreenOpen ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Pre-Submission Review Summary
                </h2>
                <span className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                  {answeredCount} answered · {unansweredCount} unanswered
                </span>
              </div>
              <div className="divide-y divide-[var(--border)] border-t border-b border-[var(--border)]">
                {questions.map((q, idx) => {
                  const chosenId = attempt.answers[q.id];
                  const chosenText = q.options.find((o) => o.id === chosenId)?.text;
                  return (
                    <div
                      key={q.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          Q{idx + 1}. {q.questionText}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {chosenText ? `Selected: ${chosenText}` : 'Not answered yet'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StatusText
                          tone={chosenText ? 'nominal' : 'warning'}
                          label={chosenText ? 'Answered' : 'Unanswered'}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReviewScreenOpen(false);
                            setCurrentQIdx(idx);
                          }}
                        >
                          Jump
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setReviewScreenOpen(false)}
                >
                  Back to Questions
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setConfirmSubmitModal(true)}
                  iconLeft={<FileCheck2 className="w-4 h-4" aria-hidden="true" />}
                >
                  Submit Test
                </Button>
              </div>
            </div>
          ) : (
            currentQuestion && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span className="font-mono font-semibold text-[var(--accent-text)]">
                      Question {currentQIdx + 1} of {questions.length}
                    </span>
                    <span className="font-mono tabular-nums">
                      {currentQuestion.marks} mark(s)
                    </span>
                  </div>
                  <p className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
                    {currentQuestion.questionText}
                  </p>
                </div>

                <div className="space-y-2.5" role="radiogroup" aria-label="Question options">
                  {currentQuestion.options.map((opt) => {
                    const checked = attempt.answers[currentQuestion.id] === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors min-h-[44px]',
                          checked
                            ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                            : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-secondary)]'
                        )}
                      >
                        <input
                          type="radio"
                          name={`q-${currentQuestion.id}`}
                          checked={checked}
                          disabled={isExpired}
                          onChange={() =>
                            void handleSelectOption(currentQuestion.id, opt.id)
                          }
                          className="w-4 h-4 shrink-0 accent-[var(--accent)]"
                        />
                        <span className="text-sm text-[var(--text-primary)]">
                          {opt.text}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentQIdx === 0}
                      onClick={() => setCurrentQIdx((i) => Math.max(0, i - 1))}
                      iconLeft={<ChevronLeft className="w-4 h-4" aria-hidden="true" />}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentQIdx >= questions.length - 1}
                      onClick={() =>
                        setCurrentQIdx((i) => Math.min(questions.length - 1, i + 1))
                      }
                      iconLeft={<ChevronRight className="w-4 h-4" aria-hidden="true" />}
                    >
                      Next
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setReviewScreenOpen(true)}
                    >
                      Review ({answeredCount}/{questions.length})
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setConfirmSubmitModal(true)}
                    >
                      Submit Test
                    </Button>
                  </div>
                </div>
              </div>
            )
          )}
        </Card>

        {/* Confirm Submit Modal */}
        <Modal
          open={confirmSubmitModal}
          onClose={() => setConfirmSubmitModal(false)}
          title="Confirm Final Test Submission"
          subtitle="Once submitted, this attempt is locked and evaluated automatically."
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5 text-sm space-y-1">
              <p className="font-mono tabular-nums text-[var(--text-primary)]">
                Answered Questions: {answeredCount} / {questions.length}
              </p>
              {unansweredCount > 0 && (
                <p className="text-xs text-[var(--warning)]">
                  {unansweredCount} question(s) are currently unanswered and will score 0 marks.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmSubmitModal(false)}
              >
                Return to Test
              </Button>
              <Button
                variant="primary"
                loading={submittingAttempt}
                onClick={() => void handleConfirmFinalSubmit()}
                iconLeft={<CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
              >
                Confirm & Submit
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  const resultColumns: TableColumn<
    StudentResultsDashboardData['results'][number]
  >[] = [
    {
      key: 'assessment',
      header: 'Assessment',
      render: (row) => (
        <div className="space-y-0.5">
          <p className="text-xs text-[var(--text-muted)] capitalize">
            {row.sourceType.replace(/_/g, ' ')} · {row.subjectName}
          </p>
          <p className="font-semibold text-[var(--text-primary)]">
            {row.title}
          </p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date & Released',
      render: (row) => (
        <div className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
          <p>{formatShortDate(row.assessmentDate)}</p>
          <p>Released {formatShortDate(row.releasedAt)}</p>
        </div>
      ),
    },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      render: (row) => (
        <div className="space-y-0.5">
          <p className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
            {row.marksObtained} / {row.maximumMarks}
          </p>
          <p className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
            {row.percentage}%
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Outcome',
      render: (row) => (
        <StatusText
          tone={
            row.resultStatus === 'pass'
              ? 'nominal'
              : row.resultStatus === 'fail'
                ? 'danger'
                : 'neutral'
          }
          label={row.resultStatus.toUpperCase()}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Student & Parent Portal · Shared ID (${principal.loginId})`}
        title="Online Tests, Examinations & Results"
        rightSlot={<StatusText tone="nominal" label={`Student: ${principal.fullName}`} />}
      />

      <Tabs
        ariaLabel="Student assessment sections"
        value={subTab}
        onChange={setSubTab}
        items={[
          { id: 'tests', label: 'Online Tests', count: tests.length },
          { id: 'examinations', label: 'Examinations', count: exams.length },
          {
            id: 'results',
            label: 'Results & Performance',
            count: resultsDash?.releasedCount ?? 0,
          },
        ]}
      />

      {banner && (
        <Alert tone="success" onDismiss={() => setBanner(null)}>
          {banner}
        </Alert>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {subTab === 'tests' && (
        <Card
          title="Available Online Objective Tests"
          subtitle="Tests scoped to your active enrolled class and batch. Open test details before starting an attempt."
        >
          <div className="space-y-4">
            <Tabs
              ariaLabel="Filter online tests"
              value={testFilter}
              onChange={setTestFilter}
              items={TEST_FILTER_TABS.map((tab) => ({
                id: tab.id,
                label: tab.label,
                count: tests.filter((t) => matchesTestFilter(t, tab.id)).length,
              }))}
            />

            {loading ? (
              <div className="h-24 rounded-xl bg-[var(--surface-secondary)] animate-pulse" />
            ) : tests.filter((t) => matchesTestFilter(t, testFilter)).length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center space-y-2">
                <p className="text-sm text-[var(--text-muted)]">
                  {tests.length === 0
                    ? 'No online tests published for your batch right now.'
                    : 'No online tests match this status filter.'}
                </p>
                {testFilter !== 'all' && tests.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setTestFilter('all')}
                  >
                    Show All Tests
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {tests
                  .filter((t) => matchesTestFilter(t, testFilter))
                  .map((test) => {
                    const canStartOrResume =
                      Boolean(test.inProgressAttempt) ||
                      (test.effectiveStatus === 'active' && test.attemptsRemaining > 0);
                    return (
                      <div
                        key={test.id}
                        className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                      >
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                            <span className="font-mono font-semibold text-[var(--accent-text)]">
                              {test.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{test.subjectName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {test.questionCount} MCQs · {test.totalMarks} marks ·{' '}
                              {test.durationMinutes} min
                            </span>
                          </div>
                          <h2 className="text-base font-semibold text-[var(--text-primary)]">
                            {test.title}
                          </h2>
                          <p className="text-xs text-[var(--text-muted)]">
                            Window: {formatDateTime(test.startsAt)} –{' '}
                            {formatDateTime(test.endsAt)} · Attempts:{' '}
                            <span className="font-mono tabular-nums">
                              {test.attemptsUsed} / {test.maximumAttempts}
                            </span>
                          </p>

                          {test.completedAttempts.length > 0 && (
                            <div className="pt-1 flex flex-wrap gap-3 text-xs">
                              {test.completedAttempts.map((att) => (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() => void handleOpenAttemptDetail(att.id)}
                                  className="text-[var(--accent-text)] font-mono tabular-nums underline cursor-pointer"
                                >
                                  Attempt #{att.attemptNumber}:{' '}
                                  {att.resultsVisible
                                    ? `${att.marksObtained}/${att.totalMarks} (${att.percentage}%)`
                                    : 'Submitted — Result Pending Release'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                          <StatusText
                            tone={
                              test.effectiveStatus === 'active'
                                ? 'nominal'
                                : test.effectiveStatus === 'published'
                                  ? 'warning'
                                  : 'neutral'
                            }
                            label={
                              test.inProgressAttempt
                                ? 'In Progress — Resume Available'
                                : test.effectiveStatus === 'active'
                                  ? 'Window Open'
                                  : test.effectiveStatus === 'published'
                                    ? 'Upcoming'
                                    : 'Closed'
                            }
                          />
                          {canStartOrResume ? (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setPreStartTestModal(test)}
                              iconLeft={<Play className="w-3.5 h-3.5" aria-hidden="true" />}
                            >
                              {test.inProgressAttempt ? 'Resume Attempt' : 'Start Test'}
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setPreStartTestModal(test)}
                            >
                              Test Instructions
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </Card>
      )}

      {subTab === 'examinations' && (
        <Card
          title="Scheduled & Completed Examinations"
          subtitle="Written and offline examinations for your active class and batch. Unreleased marks stay masked until published."
        >
          <div className="space-y-4">
            <Tabs
              ariaLabel="Filter examinations"
              value={examFilter}
              onChange={setExamFilter}
              items={EXAM_FILTER_TABS.map((tab) => ({
                id: tab.id,
                label: tab.label,
                count: exams.filter((item) => {
                  if (tab.id === 'all') return true;
                  if (tab.id === 'released') return Boolean(item.myMarks);
                  if (tab.id === 'pending_release') {
                    return !item.myMarks && item.marksEnteredPendingRelease;
                  }
                  return !item.myMarks && !item.marksEnteredPendingRelease;
                }).length,
              }))}
            />

            {exams.filter((item) => {
              if (examFilter === 'all') return true;
              if (examFilter === 'released') return Boolean(item.myMarks);
              if (examFilter === 'pending_release') {
                return !item.myMarks && item.marksEnteredPendingRelease;
              }
              return !item.myMarks && !item.marksEnteredPendingRelease;
            }).length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                {exams.length === 0
                  ? 'No examinations scheduled for your batch right now.'
                  : 'No examinations match this status filter.'}
              </p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {exams
                  .filter((item) => {
                    if (examFilter === 'all') return true;
                    if (examFilter === 'released') return Boolean(item.myMarks);
                    if (examFilter === 'pending_release') {
                      return !item.myMarks && item.marksEnteredPendingRelease;
                    }
                    return !item.myMarks && !item.marksEnteredPendingRelease;
                  })
                  .map((item) => (
                    <div
                      key={item.examination.id}
                      className="py-4 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                          <span className="font-mono font-semibold text-[var(--accent-text)]">
                            {item.examination.id}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.subjectName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatShortDate(item.examination.examDate)} ·{' '}
                            {item.examination.startsAt}–{item.examination.endsAt}
                          </span>
                          {item.examination.passingMarks !== undefined && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                Pass: {item.examination.passingMarks}/{item.examination.maximumMarks}
                              </span>
                            </>
                          )}
                        </div>
                        <h2 className="text-base font-semibold text-[var(--text-primary)]">
                          {item.examination.title}
                        </h2>
                        <p className="text-xs text-[var(--text-muted)]">
                          {item.examination.instructions}
                        </p>
                      </div>

                      <div className="text-left sm:text-right shrink-0 space-y-1">
                        {item.myMarks ? (
                          <>
                            <p className="font-mono text-sm font-bold tabular-nums text-[var(--accent-text)]">
                              {item.myMarks.marksObtained} / {item.myMarks.maximumMarks} (
                              {item.myMarks.percentage}%)
                            </p>
                            <StatusText
                              tone={item.myMarks.resultStatus === 'fail' ? 'danger' : 'nominal'}
                              label={`Released · ${item.myMarks.resultStatus.toUpperCase()}`}
                            />
                          </>
                        ) : item.marksEnteredPendingRelease ? (
                          <StatusText tone="warning" label="Result Not Released Yet" />
                        ) : (
                          <StatusText
                            tone="neutral"
                            label={`Max ${item.examination.maximumMarks} Marks · Scheduled`}
                          />
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {subTab === 'results' && resultsDash && (
        <div className="space-y-6">
          {/* Subject-wise Performance */}
          <Card
            title="Subject-Wise Performance Summary"
            subtitle="Average percentage = (Total marks obtained ÷ Total maximum marks) × 100 across released scores only."
          >
            {resultsDash.subjectSummaries.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No active subjects found for your batch enrolment.
              </p>
            ) : (
              <div className="space-y-5">
                {resultsDash.subjectSummaries.some(
                  (sub) => sub.availability === 'result_available' && sub.percentage !== null
                ) && (
                  <div className="pb-4 border-b border-[var(--border)]">
                    <ComparisonBarChart
                      data={resultsDash.subjectSummaries
                        .filter(
                          (sub) =>
                            sub.availability === 'result_available' &&
                            sub.percentage !== null
                        )
                        .map((sub) => {
                          const pct = sub.percentage ?? 0;
                          return {
                            id: sub.subjectId,
                            label: sub.subjectName,
                            value: pct,
                            maxValue: 100,
                            displayValue: sub.displayPercentage,
                            helperText: `${sub.totalMarksObtained}/${sub.totalMaximumMarks}`,
                            tone: pct >= 75 ? 'mint' : pct >= 40 ? 'charcoal' : 'danger',
                          };
                        })}
                      ariaLabel="Subject-wise average percentage"
                    />
                  </div>
                )}

                <div className="divide-y divide-[var(--border)]">
                  {resultsDash.subjectSummaries.map((sub) => {
                    const meta = SUBJECT_AVAILABILITY_META[sub.availability];
                    return (
                      <div
                        key={sub.subjectId}
                        className="py-3.5 first:pt-1 last:pb-1 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {sub.subjectName}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] tabular-nums">
                            Released: {sub.releasedAssessmentsCount} · Pending:{' '}
                            {sub.pendingAssessmentsCount}
                          </p>
                          {sub.latestResultTitle && sub.latestResultDisplay && (
                            <p className="text-xs text-[var(--text-secondary)]">
                              Latest: {sub.latestResultTitle} —{' '}
                              <span className="font-mono font-semibold tabular-nums">
                                {sub.latestResultDisplay}
                              </span>
                            </p>
                          )}
                        </div>
                        <div className="text-right space-y-0.5">
                          <p className="font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
                            {sub.displayPercentage}
                            {sub.availability === 'result_available' && (
                              <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                                ({sub.totalMarksObtained}/{sub.totalMaximumMarks})
                              </span>
                            )}
                          </p>
                          <StatusText tone={meta.tone} label={meta.label} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* Filterable Unified Released Results */}
          <Card
            title="Released Results Ledger"
            subtitle={
              resultsDash.unreleasedPendingCount > 0
                ? `${resultsDash.unreleasedPendingCount} assessment(s) are pending attempt or awaiting teacher release.`
                : 'All completed assessments released so far.'
            }
          >
            {(() => {
              const availableMonths = Array.from(
                new Set(allReleasedForOptions.map((r) => r.assessmentDate.slice(0, 7)))
              ).sort((a, b) => b.localeCompare(a));
              const availableYears = Array.from(
                new Set(allReleasedForOptions.map((r) => r.assessmentDate.slice(0, 4)))
              ).sort((a, b) => b.localeCompare(a));
              const hasResultFilters =
                filterSubjectId !== 'all' ||
                filterSourceType !== 'all' ||
                filterStatus !== 'all' ||
                filterMonth !== 'all' ||
                filterYear !== 'all';

              return (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-5">
                    <Select
                      value={filterSubjectId}
                      onChange={(e) => setFilterSubjectId(e.target.value)}
                      aria-label="Filter results by subject"
                    >
                      <option value="all">All Subjects</option>
                      {resultsDash.subjectSummaries.map((s) => (
                        <option key={s.subjectId} value={s.subjectId}>
                          {s.subjectName}
                        </option>
                      ))}
                    </Select>

                    <Select
                      value={filterSourceType}
                      onChange={(e) =>
                        setFilterSourceType(
                          e.target.value as
                            | 'all'
                            | 'examination'
                            | 'objective_test'
                            | 'homework'
                        )
                      }
                      aria-label="Filter by assessment type"
                    >
                      <option value="all">All Assessment Types</option>
                      <option value="examination">Examinations</option>
                      <option value="objective_test">Online Objective Tests</option>
                      <option value="homework">Graded Homework</option>
                    </Select>

                    <Select
                      value={filterStatus}
                      onChange={(e) =>
                        setFilterStatus(
                          e.target.value as 'all' | 'pass' | 'fail' | 'recorded'
                        )
                      }
                      aria-label="Filter by result outcome"
                    >
                      <option value="all">All Outcomes</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                      <option value="recorded">Recorded</option>
                    </Select>

                    <Select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      aria-label="Filter results by month"
                    >
                      <option value="all">All Months</option>
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>

                    <Select
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                      aria-label="Filter results by year"
                    >
                      <option value="all">All Years</option>
                      {availableYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {hasResultFilters && (
                    <div className="mb-4 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFilterSubjectId('all');
                          setFilterSourceType('all');
                          setFilterStatus('all');
                          setFilterMonth('all');
                          setFilterYear('all');
                        }}
                      >
                        Clear Result Filters
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}

            <Table
              columns={resultColumns}
              rows={resultsDash.results}
              rowKey={(r) => r.id}
              loading={loading}
              emptyTitle="No released results match your filters"
              emptyDescription="Results appear here automatically after evaluations are released by your teacher."
              mobileCardRender={(row) => (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-[var(--text-muted)] capitalize">
                        {row.sourceType.replace(/_/g, ' ')} · {row.subjectName}
                      </p>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {row.title}
                      </p>
                    </div>
                    <StatusText
                      tone={
                        row.resultStatus === 'pass'
                          ? 'nominal'
                          : row.resultStatus === 'fail'
                            ? 'danger'
                            : 'neutral'
                      }
                      label={row.resultStatus.toUpperCase()}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums">
                    <span className="text-[var(--text-muted)]">
                      {formatShortDate(row.assessmentDate)} · Released{' '}
                      {formatShortDate(row.releasedAt)}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {row.marksObtained} / {row.maximumMarks} ({row.percentage}%)
                    </span>
                  </div>
                </div>
              )}
            />
          </Card>
        </div>
      )}

      {/* Pre-Start Test Details & Instructions Modal */}
      <Modal
        open={Boolean(preStartTestModal)}
        onClose={() => setPreStartTestModal(null)}
        title={preStartTestModal ? preStartTestModal.title : ''}
        subtitle={
          preStartTestModal
            ? `${preStartTestModal.id} · ${preStartTestModal.subjectName} · Teacher: ${preStartTestModal.teacherName}`
            : ''
        }
        maxWidthClass="max-w-xl"
      >
        {preStartTestModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
                <p className="text-[var(--text-muted)]">Duration</p>
                <p className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  {preStartTestModal.durationMinutes} min
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
                <p className="text-[var(--text-muted)]">Questions</p>
                <p className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  {preStartTestModal.questionCount} MCQs
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
                <p className="text-[var(--text-muted)]">Total Marks</p>
                <p className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  {preStartTestModal.totalMarks}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
                <p className="text-[var(--text-muted)]">Attempts</p>
                <p className="mt-1 font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  {preStartTestModal.attemptsUsed} / {preStartTestModal.maximumAttempts}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5 space-y-1.5 text-xs">
              <p className="font-semibold text-[var(--text-primary)]">
                Instructions & Rules
              </p>
              <p className="text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
                {preStartTestModal.instructions}
              </p>
              <p className="pt-1 text-[var(--text-muted)]">
                Window: {formatDateTime(preStartTestModal.startsAt)} –{' '}
                {formatDateTime(preStartTestModal.endsAt)}
              </p>
              <p className="text-[var(--text-muted)]">
                Result Policy:{' '}
                {preStartTestModal.resultReleaseMode === 'auto_after_submission'
                  ? 'Score released immediately after submission.'
                  : preStartTestModal.resultReleaseMode === 'scheduled_after_end'
                    ? 'Score released automatically after the test window closes.'
                    : 'Score released manually by your teacher after evaluation.'}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setPreStartTestModal(null)}
              >
                Close
              </Button>
              {(Boolean(preStartTestModal.inProgressAttempt) ||
                (preStartTestModal.effectiveStatus === 'active' &&
                  preStartTestModal.attemptsRemaining > 0)) && (
                <Button
                  variant="primary"
                  onClick={() => void handleStartOrResume(preStartTestModal.id)}
                  iconLeft={<Play className="w-3.5 h-3.5" aria-hidden="true" />}
                >
                  {preStartTestModal.inProgressAttempt
                    ? 'Resume Active Attempt'
                    : 'Begin Test Now'}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Attempt Review Modal */}
      <Modal
        open={Boolean(reviewDetailModal)}
        onClose={() => setReviewDetailModal(null)}
        title={
          reviewDetailModal
            ? `Attempt #${reviewDetailModal.attempt.attemptNumber}: ${reviewDetailModal.test.title}`
            : ''
        }
        subtitle={
          reviewDetailModal
            ? reviewDetailModal.attempt.resultsVisible
              ? `Score: ${reviewDetailModal.attempt.marksObtained} / ${reviewDetailModal.attempt.totalMarks} (${reviewDetailModal.attempt.percentage}%)`
              : 'Submitted — awaiting result release by teacher'
            : ''
        }
        maxWidthClass="max-w-2xl"
      >
        {reviewDetailModal && (
          <div className="space-y-4">
            {!reviewDetailModal.attempt.resultsVisible ? (
              <div className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning)] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Your attempt is locked and recorded. Scores and answer keys remain hidden until released under the test schedule.
                </span>
              </div>
            ) : (
              <ol className="divide-y divide-[var(--border)] space-y-3">
                {reviewDetailModal.questions.map((q, idx) => {
                  const chosenId = reviewDetailModal.attempt.answers[q.id];
                  const isCorrect = q.correctOptionId && chosenId === q.correctOptionId;
                  return (
                    <li key={q.id} className="pt-3 first:pt-0 space-y-1.5 text-sm">
                      <p className="font-semibold text-[var(--text-primary)]">
                        Q{idx + 1}. {q.questionText}{' '}
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          ({q.marks}m)
                        </span>
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Your Answer:{' '}
                        <span
                          className={
                            q.correctOptionId
                              ? isCorrect
                                ? 'font-semibold text-[var(--accent-text)]'
                                : 'font-semibold text-[var(--error)]'
                              : ''
                          }
                        >
                          {q.options.find((o) => o.id === chosenId)?.text ?? 'Unanswered'}
                        </span>
                      </p>
                      {q.correctOptionId && !isCorrect && (
                        <p className="text-xs text-[var(--accent-text)]">
                          Correct Answer:{' '}
                          {q.options.find((o) => o.id === q.correctOptionId)?.text}
                        </p>
                      )}
                      {q.explanation && (
                        <p className="text-xs text-[var(--text-muted)]">
                          Explanation: {q.explanation}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
