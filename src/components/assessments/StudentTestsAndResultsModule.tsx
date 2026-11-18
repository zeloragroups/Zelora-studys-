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
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { StatusText, type SemanticTone } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

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
      <Card title="Access Restricted">
        <p className="text-sm text-[#D94C5C] dark:text-[#F16B75]">
          Tests and results are accessible only with Student / Parent credentials.
        </p>
      </Card>
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
                    ? 'text-[#D94C5C] dark:text-[#F16B75]'
                    : isLowTime
                      ? 'text-[#B7791F] dark:text-[#F5B942]'
                      : 'text-[#7552D9] dark:text-[#A78BFA]'
                )}
              >
                <Clock className="w-4 h-4" aria-hidden="true" />
                <span>{formatCountdown(remainingMs)}</span>
              </div>
              <p className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                Answered {answeredCount} / {questions.length} · Unanswered {unansweredCount}
              </p>
            </div>
          }
        >
          <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 px-3.5 py-2.5 text-xs text-[#687086] dark:text-[#A6B0C3] flex items-center justify-between gap-3 mb-5">
            <span>
              Browser timer shown for local development convenience — production anti-cheat enforcement requires server-side deadline validation.
            </span>
            <button
              type="button"
              onClick={() => {
                setActiveRunner(null);
                void loadData();
              }}
              className="text-[#7552D9] dark:text-[#A78BFA] font-medium underline shrink-0 cursor-pointer"
            >
              Pause & Exit (Progress Saved)
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/30 bg-[#D94C5C]/10 dark:bg-[#F16B75]/15 p-3 text-xs text-[#D94C5C] dark:text-[#F16B75]"
            >
              {error}
            </div>
          )}

          {/* Question Navigator Grid */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3] mb-2">
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
                        ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white border-[#7552D9] dark:border-[#8B5CF6]'
                        : answered
                          ? 'bg-[#168A62]/10 dark:bg-[#22C58B]/15 text-[#168A62] dark:text-[#22C58B] border-[#168A62]/40 dark:border-[#22C58B]/40'
                          : 'bg-white dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] border-[#E5E7EF] dark:border-[#303A55] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
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
                    ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white border-[#7552D9] dark:border-[#8B5CF6]'
                    : 'bg-white dark:bg-[#101426] text-[#17172B] dark:text-[#F8FAFC] border-[#E5E7EF] dark:border-[#303A55] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
                )}
              >
                Review All Questions
              </button>
            </div>
          </div>

          {reviewScreenOpen ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                  Pre-Submission Review Summary
                </h2>
                <span className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                  {answeredCount} answered · {unansweredCount} unanswered
                </span>
              </div>
              <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] border-t border-b border-[#E5E7EF] dark:border-[#303A55]">
                {questions.map((q, idx) => {
                  const chosenId = attempt.answers[q.id];
                  const chosenText = q.options.find((o) => o.id === chosenId)?.text;
                  return (
                    <div
                      key={q.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#17172B] dark:text-[#F8FAFC]">
                          Q{idx + 1}. {q.questionText}
                        </p>
                        <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
                  <div className="flex items-center justify-between text-xs text-[#687086] dark:text-[#A6B0C3]">
                    <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      Question {currentQIdx + 1} of {questions.length}
                    </span>
                    <span className="font-mono tabular-nums">
                      {currentQuestion.marks} mark(s)
                    </span>
                  </div>
                  <p className="text-base sm:text-lg font-semibold text-[#17172B] dark:text-[#F8FAFC]">
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
                            ? 'border-[#7552D9] bg-[#F1EEFA]/75 dark:border-[#8B5CF6] dark:bg-[#8B5CF6]/15'
                            : 'border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426]/65 hover:bg-[#F1EEFA]/45 dark:hover:bg-[#202844]/60'
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
                          className="w-4 h-4 shrink-0 accent-[#7552D9] dark:accent-[#8B5CF6]"
                        />
                        <span className="text-sm text-[#17172B] dark:text-[#F8FAFC]">
                          {opt.text}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="pt-3 border-t border-[#E5E7EF] dark:border-[#303A55] flex flex-wrap items-center justify-between gap-3">
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
            <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-3.5 text-sm space-y-1">
              <p className="font-mono tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                Answered Questions: {answeredCount} / {questions.length}
              </p>
              {unansweredCount > 0 && (
                <p className="text-xs text-[#B7791F] dark:text-[#F5B942]">
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
          <p className="text-xs text-[#687086] dark:text-[#A6B0C3] capitalize">
            {row.sourceType.replace(/_/g, ' ')} · {row.subjectName}
          </p>
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
            {row.title}
          </p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date & Released',
      render: (row) => (
        <div className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
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
          <p className="font-mono font-semibold tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
            {row.marksObtained} / {row.maximumMarks}
          </p>
          <p className="font-mono text-xs tabular-nums text-[#687086] dark:text-[#A6B0C3]">
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
            Student & Parent Portal · Shared ID ({principal.loginId})
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] text-balance">
            Online Tests, Examinations & Results
          </h1>
        </div>
        <StatusText tone="nominal" label={`Student: ${principal.fullName}`} />
      </div>

      <div className="flex overflow-x-auto gap-1 rounded-xl bg-[#F1EEFA] dark:bg-[#202844] p-1">
        {(
          [
            { id: 'tests', label: `Online Tests (${tests.length})` },
            { id: 'examinations', label: `Examinations (${exams.length})` },
            {
              id: 'results',
              label: `Results & Performance (${resultsDash?.releasedCount ?? 0})`,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={cn(
              'min-h-[40px] px-4 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors',
              subTab === tab.id
                ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white shadow-xs'
                : 'text-[#687086] dark:text-[#A6B0C3] hover:text-[#17172B] dark:hover:text-[#F8FAFC]'
            )}
          >
            {tab.label}
          </button>
        ))}
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

      {subTab === 'tests' && (
        <Card
          title="Available Online Objective Tests"
          subtitle="Tests scoped to your active enrolled class and batch. Open test details before starting an attempt."
        >
          <div className="space-y-4">
            <div className="flex overflow-x-auto gap-1.5 pb-1">
              {TEST_FILTER_TABS.map((tab) => {
                const count = tests.filter((t) => matchesTestFilter(t, tab.id)).length;
                const active = testFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTestFilter(tab.id)}
                    className={cn(
                      'min-h-[40px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer border transition-colors',
                      active
                        ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white border-[#7552D9] dark:border-[#8B5CF6]'
                        : 'bg-[#F8F9FC] dark:bg-[#101426] text-[#434960] dark:text-[#A6B0C3] border-[#E5E7EF] dark:border-[#303A55] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
                    )}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="h-24 rounded-xl bg-[#F1EEFA] dark:bg-[#202844] animate-pulse" />
            ) : tests.filter((t) => matchesTestFilter(t, testFilter)).length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E5E7EF] dark:border-[#303A55] p-6 text-center space-y-2">
                <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
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
              <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
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
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                            <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
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
                          <h2 className="text-base font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                            {test.title}
                          </h2>
                          <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
                                  className="text-[#7552D9] dark:text-[#A78BFA] font-mono tabular-nums underline cursor-pointer"
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
            <div className="flex overflow-x-auto gap-1.5 pb-1">
              {EXAM_FILTER_TABS.map((tab) => {
                const count = exams.filter((item) => {
                  if (tab.id === 'all') return true;
                  if (tab.id === 'released') return Boolean(item.myMarks);
                  if (tab.id === 'pending_release') {
                    return !item.myMarks && item.marksEnteredPendingRelease;
                  }
                  return !item.myMarks && !item.marksEnteredPendingRelease;
                }).length;
                const active = examFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setExamFilter(tab.id)}
                    className={cn(
                      'min-h-[40px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer border transition-colors',
                      active
                        ? 'bg-[#7552D9] dark:bg-[#8B5CF6] text-white border-[#7552D9] dark:border-[#8B5CF6]'
                        : 'bg-[#F8F9FC] dark:bg-[#101426] text-[#434960] dark:text-[#A6B0C3] border-[#E5E7EF] dark:border-[#303A55] hover:bg-[#F1EEFA] dark:hover:bg-[#202844]'
                    )}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>

            {exams.filter((item) => {
              if (examFilter === 'all') return true;
              if (examFilter === 'released') return Boolean(item.myMarks);
              if (examFilter === 'pending_release') {
                return !item.myMarks && item.marksEnteredPendingRelease;
              }
              return !item.myMarks && !item.marksEnteredPendingRelease;
            }).length === 0 ? (
              <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                {exams.length === 0
                  ? 'No examinations scheduled for your batch right now.'
                  : 'No examinations match this status filter.'}
              </p>
            ) : (
              <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
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
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
                          <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
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
                        <h2 className="text-base font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                          {item.examination.title}
                        </h2>
                        <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                          {item.examination.instructions}
                        </p>
                      </div>

                      <div className="text-left sm:text-right shrink-0 space-y-1">
                        {item.myMarks ? (
                          <>
                            <p className="font-mono text-sm font-bold tabular-nums text-[#168A62] dark:text-[#22C58B]">
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
              <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                No active subjects found for your batch enrolment.
              </p>
            ) : (
              <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                {resultsDash.subjectSummaries.map((sub) => {
                  const meta = SUBJECT_AVAILABILITY_META[sub.availability];
                  return (
                    <div
                      key={sub.subjectId}
                      className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                          {sub.subjectName}
                        </p>
                        <p className="text-xs text-[#687086] dark:text-[#A6B0C3] tabular-nums">
                          Released: {sub.releasedAssessmentsCount} · Pending:{' '}
                          {sub.pendingAssessmentsCount}
                        </p>
                        {sub.latestResultTitle && sub.latestResultDisplay && (
                          <p className="text-xs text-[#434960] dark:text-[#D4DCEB]">
                            Latest: {sub.latestResultTitle} —{' '}
                            <span className="font-mono font-semibold tabular-nums">
                              {sub.latestResultDisplay}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="text-right space-y-0.5">
                        <p className="font-mono text-base font-bold tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
                          {sub.displayPercentage}
                          {sub.availability === 'result_available' && (
                            <span className="ml-2 text-xs font-normal text-[#687086] dark:text-[#A6B0C3]">
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
                    <select
                      value={filterSubjectId}
                      onChange={(e) => setFilterSubjectId(e.target.value)}
                      aria-label="Filter results by subject"
                      className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                    >
                      <option value="all">All Subjects</option>
                      {resultsDash.subjectSummaries.map((s) => (
                        <option key={s.subjectId} value={s.subjectId}>
                          {s.subjectName}
                        </option>
                      ))}
                    </select>

                    <select
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
                      className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                    >
                      <option value="all">All Assessment Types</option>
                      <option value="examination">Examinations</option>
                      <option value="objective_test">Online Objective Tests</option>
                      <option value="homework">Graded Homework</option>
                    </select>

                    <select
                      value={filterStatus}
                      onChange={(e) =>
                        setFilterStatus(
                          e.target.value as 'all' | 'pass' | 'fail' | 'recorded'
                        )
                      }
                      aria-label="Filter by result outcome"
                      className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                    >
                      <option value="all">All Outcomes</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                      <option value="recorded">Recorded</option>
                    </select>

                    <select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(e.target.value)}
                      aria-label="Filter results by month"
                      className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                    >
                      <option value="all">All Months</option>
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(e.target.value)}
                      aria-label="Filter results by year"
                      className="min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                    >
                      <option value="all">All Years</option>
                      {availableYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
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
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3] capitalize">
                        {row.sourceType.replace(/_/g, ' ')} · {row.subjectName}
                      </p>
                      <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
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
                    <span className="text-[#687086] dark:text-[#A6B0C3]">
                      {formatShortDate(row.assessmentDate)} · Released{' '}
                      {formatShortDate(row.releasedAt)}
                    </span>
                    <span className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {row.marksObtained} / {row.maximumMarks} ({row.percentage}%)
                    </span>
                  </div>
                </div>
              )}
            />
          </Card>
        </div>
      )}

      {/* Pre-Start Test Details & Instructions Modal (§18) */}
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
              <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-3">
                <p className="text-[#687086] dark:text-[#A6B0C3]">Duration</p>
                <p className="mt-1 font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC] tabular-nums">
                  {preStartTestModal.durationMinutes} min
                </p>
              </div>
              <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-3">
                <p className="text-[#687086] dark:text-[#A6B0C3]">Questions</p>
                <p className="mt-1 font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC] tabular-nums">
                  {preStartTestModal.questionCount} MCQs
                </p>
              </div>
              <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-3">
                <p className="text-[#687086] dark:text-[#A6B0C3]">Total Marks</p>
                <p className="mt-1 font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC] tabular-nums">
                  {preStartTestModal.totalMarks}
                </p>
              </div>
              <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-3">
                <p className="text-[#687086] dark:text-[#A6B0C3]">Attempts</p>
                <p className="mt-1 font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC] tabular-nums">
                  {preStartTestModal.attemptsUsed} / {preStartTestModal.maximumAttempts}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-3.5 space-y-1.5 text-xs">
              <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                Instructions & Rules
              </p>
              <p className="text-[#434960] dark:text-[#D4DCEB] whitespace-pre-line leading-relaxed">
                {preStartTestModal.instructions}
              </p>
              <p className="pt-1 text-[#687086] dark:text-[#A6B0C3]">
                Window: {formatDateTime(preStartTestModal.startsAt)} –{' '}
                {formatDateTime(preStartTestModal.endsAt)}
              </p>
              <p className="text-[#687086] dark:text-[#A6B0C3]">
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
              <div className="rounded-xl border border-[#B7791F]/30 dark:border-[#F5B942]/30 bg-[#B7791F]/10 dark:bg-[#F5B942]/15 p-4 text-sm text-[#B7791F] dark:text-[#F5B942] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  Your attempt is locked and recorded. Scores and answer keys remain hidden until released under the test schedule.
                </span>
              </div>
            ) : (
              <ol className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] space-y-3">
                {reviewDetailModal.questions.map((q, idx) => {
                  const chosenId = reviewDetailModal.attempt.answers[q.id];
                  const isCorrect = q.correctOptionId && chosenId === q.correctOptionId;
                  return (
                    <li key={q.id} className="pt-3 first:pt-0 space-y-1.5 text-sm">
                      <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        Q{idx + 1}. {q.questionText}{' '}
                        <span className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                          ({q.marks}m)
                        </span>
                      </p>
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                        Your Answer:{' '}
                        <span
                          className={
                            q.correctOptionId
                              ? isCorrect
                                ? 'font-semibold text-[#168A62] dark:text-[#22C58B]'
                                : 'font-semibold text-[#D94C5C] dark:text-[#F16B75]'
                              : ''
                          }
                        >
                          {q.options.find((o) => o.id === chosenId)?.text ?? 'Unanswered'}
                        </span>
                      </p>
                      {q.correctOptionId && !isCorrect && (
                        <p className="text-xs text-[#168A62] dark:text-[#22C58B]">
                          Correct Answer:{' '}
                          {q.options.find((o) => o.id === q.correctOptionId)?.text}
                        </p>
                      )}
                      {q.explanation && (
                        <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
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
