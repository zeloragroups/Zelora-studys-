import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardEdit,
  Eye,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type {
  ObjectiveQuestionDraftInput,
  TeacherScopeResources,
} from '../../services/contracts/assessmentService';
import { assessmentService } from '../../services';
import { examinationService } from '../../services';
import { homeworkService } from '../../services';
import { testService } from '../../services';
import type {
  ExaminationDetailView,
  ExaminationMarks,
  ExaminationRecord,
  MarksAuditEntry,
  ObjectiveTest,
  TeacherEligibleStudent,
  TeacherObjectiveTestSummary,
  TeacherResultsWorkspaceData,
  TestAttempt,
  TestResultReleaseMode,
} from '../../types';
import { cn } from '../../utils/cn';
import { formatDateTime, formatShortDate } from '../../utils/formatters';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { StatusText } from '../ui/StatusText';
import { Table, type TableColumn } from '../ui/Table';

type TeacherAssessmentSubTab = 'tests' | 'examinations' | 'results';

function emptyQuestionDraft(): ObjectiveQuestionDraftInput {
  return {
    questionText: '',
    options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
    correctOptionIndex: 0,
    marks: 2,
    explanation: '',
  };
}

function toDateTimeLocalValue(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '2026-11-20T09:00';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
    dt.getHours()
  )}:${pad(dt.getMinutes())}`;
}

export function TeacherTestsExaminationsModule() {
  const { principal } = useAuth();
  const [subTab, setSubTab] = useState<TeacherAssessmentSubTab>('tests');

  const [scope, setScope] = useState<TeacherScopeResources | null>(null);
  const [tests, setTests] = useState<TeacherObjectiveTestSummary[]>([]);
  const [exams, setExams] = useState<ExaminationDetailView[]>([]);
  const [resultsWorkspace, setResultsWorkspace] =
    useState<TeacherResultsWorkspaceData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Objective Test Editor Modal
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<ObjectiveTest | null>(null);
  const [testTitle, setTestTitle] = useState('');
  const [testInstructions, setTestInstructions] = useState('');
  const [testClassId, setTestClassId] = useState('');
  const [testBatchId, setTestBatchId] = useState('');
  const [testSubjectId, setTestSubjectId] = useState('');
  const [testDuration, setTestDuration] = useState('20');
  const [testStartsAt, setTestStartsAt] = useState('2026-11-16T08:00');
  const [testEndsAt, setTestEndsAt] = useState('2026-12-31T23:59');
  const [testMaxAttempts, setTestMaxAttempts] = useState('1');
  const [testReleaseMode, setTestReleaseMode] =
    useState<TestResultReleaseMode>('auto_after_submission');
  const [testScheduledRelease, setTestScheduledRelease] = useState('2026-12-31T23:59');
  const [testShowAnswers, setTestShowAnswers] = useState(true);
  const [testPublishNow, setTestPublishNow] = useState(true);
  const [testQuestions, setTestQuestions] = useState<ObjectiveQuestionDraftInput[]>([
    emptyQuestionDraft(),
  ]);
  const [testSaving, setTestSaving] = useState(false);
  const [testFormError, setTestFormError] = useState<string | null>(null);

  // Preview Test & Attempts Modal
  const [previewTest, setPreviewTest] = useState<TeacherObjectiveTestSummary | null>(null);
  const [attemptsModalTest, setAttemptsModalTest] = useState<ObjectiveTest | null>(null);
  const [testAttempts, setTestAttempts] = useState<
    Array<TestAttempt & { studentName: string }>
  >([]);

  // Examination Create / Edit Modal
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExaminationRecord | null>(null);
  const [examTitle, setExamTitle] = useState('');
  const [examClassId, setExamClassId] = useState('');
  const [examBatchId, setExamBatchId] = useState('');
  const [examSubjectId, setExamSubjectId] = useState('');
  const [examDate, setExamDate] = useState('2026-11-30');
  const [examStartsAt, setExamStartsAt] = useState('10:00');
  const [examEndsAt, setExamEndsAt] = useState('11:30');
  const [examMaxMarks, setExamMaxMarks] = useState('50');
  const [examPassingMarks, setExamPassingMarks] = useState('20');
  const [examInstructions, setExamInstructions] = useState('');
  const [examPublishNow, setExamPublishNow] = useState(true);
  const [examSaving, setExamSaving] = useState(false);
  const [examFormError, setExamFormError] = useState<string | null>(null);

  // Marks Roster, Bulk Entry & Correction Modal
  const [marksModalOpen, setMarksModalOpen] = useState(false);
  const [marksRoster, setMarksRoster] = useState<{
    examination: ExaminationRecord;
    eligibleStudents: TeacherEligibleStudent[];
    marks: Array<ExaminationMarks & { studentName: string }>;
    auditEntries: MarksAuditEntry[];
  } | null>(null);
  const [bulkMarksMap, setBulkMarksMap] = useState<Record<string, string>>({});
  const [bulkReviewStep, setBulkReviewStep] = useState(false);
  const [bulkReleaseNow, setBulkReleaseNow] = useState(false);
  const [marksSaving, setMarksSaving] = useState(false);
  const [marksError, setMarksError] = useState<string | null>(null);

  // Correct single mark state
  const [correctingMark, setCorrectingMark] = useState<
    (ExaminationMarks & { studentName: string }) | null
  >(null);
  const [correctNewMarks, setCorrectNewMarks] = useState('');
  const [correctReason, setCorrectReason] = useState('');

  const loadAll = useCallback(async () => {
    if (!principal || principal.role !== 'teacher') {
      setError('Teacher authentication is required.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [sc, tst, exm, ws] = await Promise.all([
        homeworkService.getTeacherScopeResources(principal),
        testService.listTeacherTests(principal),
        examinationService.listTeacherExaminations(principal),
        assessmentService.getTeacherResultsWorkspace(principal),
      ]);
      setScope(sc);
      setTests(tst);
      setExams(exm);
      setResultsWorkspace(ws);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assessments.');
    } finally {
      setLoading(false);
    }
  }, [principal]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const assignments = useMemo(() => scope?.assignments ?? [], [scope]);

  const getBatchesFor = (classId: string) => {
    if (!scope || !classId) return [];
    const allowed = new Set(
      assignments.filter((a) => a.classId === classId).map((a) => a.batchId)
    );
    return scope.batches.filter((b) => b.classId === classId && allowed.has(b.batchId));
  };

  const getSubjectsFor = (classId: string, batchId: string) => {
    if (!scope || !classId || !batchId) return [];
    const allowed = new Set(
      assignments
        .filter((a) => a.classId === classId && a.batchId === batchId)
        .map((a) => a.subjectId)
    );
    return scope.subjects.filter((s) => allowed.has(s.subjectId));
  };

  if (!principal || principal.role !== 'teacher') {
    return (
      <Card title="Access Restricted">
        <p className="text-sm text-[#D94C5C] dark:text-[#F16B75]">
          Tests, examinations, and marks entry are restricted to active Teacher accounts.
        </p>
      </Card>
    );
  }

  // -------------------- TEST BUILDER ACTIONS --------------------

  const openCreateTest = () => {
    const first = assignments[0];
    setEditingTest(null);
    setTestTitle('');
    setTestInstructions('Select the single best option for each question.');
    setTestClassId(first?.classId ?? '');
    setTestBatchId(first?.batchId ?? '');
    setTestSubjectId(first?.subjectId ?? '');
    setTestDuration('20');
    setTestStartsAt('2026-11-16T08:00');
    setTestEndsAt('2026-12-31T23:59');
    setTestMaxAttempts('1');
    setTestReleaseMode('auto_after_submission');
    setTestScheduledRelease('2026-12-31T23:59');
    setTestShowAnswers(true);
    setTestPublishNow(true);
    setTestQuestions([emptyQuestionDraft()]);
    setTestFormError(null);
    setTestModalOpen(true);
  };

  const openEditTest = (test: ObjectiveTest) => {
    setEditingTest(test);
    setTestTitle(test.title);
    setTestInstructions(test.instructions);
    setTestClassId(test.classId);
    setTestBatchId(test.batchId);
    setTestSubjectId(test.subjectId);
    setTestDuration(String(test.durationMinutes));
    setTestStartsAt(toDateTimeLocalValue(test.startsAt));
    setTestEndsAt(toDateTimeLocalValue(test.endsAt));
    setTestMaxAttempts(String(test.maximumAttempts));
    setTestReleaseMode(test.resultReleaseMode);
    setTestScheduledRelease(
      toDateTimeLocalValue(test.scheduledReleaseAt ?? test.endsAt)
    );
    setTestShowAnswers(test.showCorrectAnswersOnRelease);
    setTestPublishNow(test.status !== 'draft');
    setTestQuestions(
      test.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
        correctOptionIndex: Math.max(
          0,
          q.options.findIndex((o) => o.id === q.correctOptionId)
        ),
        marks: q.marks,
        explanation: q.explanation ?? '',
      }))
    );
    setTestFormError(null);
    setTestModalOpen(true);
  };

  const updateQuestion = (
    idx: number,
    updater: (prev: ObjectiveQuestionDraftInput) => ObjectiveQuestionDraftInput
  ) => {
    setTestQuestions((prev) => prev.map((q, i) => (i === idx ? updater(q) : q)));
  };

  const moveQuestion = (idx: number, delta: -1 | 1) => {
    setTestQuestions((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const moveOption = (qIdx: number, oIdx: number, delta: -1 | 1) => {
    updateQuestion(qIdx, (q) => {
      const target = oIdx + delta;
      if (target < 0 || target >= q.options.length) return q;
      const opts = [...q.options];
      const [item] = opts.splice(oIdx, 1);
      opts.splice(target, 0, item);
      let nextCorrect = q.correctOptionIndex;
      if (q.correctOptionIndex === oIdx) nextCorrect = target;
      else if (q.correctOptionIndex === target) nextCorrect = oIdx;
      return { ...q, options: opts, correctOptionIndex: nextCorrect };
    });
  };

  const handleSaveTest = async (e: FormEvent) => {
    e.preventDefault();
    setTestFormError(null);
    setTestSaving(true);
    try {
      if (editingTest) {
        await testService.updateObjectiveTest(principal, editingTest.id, {
          title: testTitle,
          instructions: testInstructions,
          durationMinutes: Number(testDuration),
          startsAt: testStartsAt,
          endsAt: testEndsAt,
          maximumAttempts: Number(testMaxAttempts),
          resultReleaseMode: testReleaseMode,
          scheduledReleaseAt:
            testReleaseMode === 'scheduled_after_end' ? testScheduledRelease : undefined,
          showCorrectAnswersOnRelease: testShowAnswers,
          questions: testQuestions,
        });
        setBanner(`Updated test ${editingTest.id}.`);
      } else {
        const created = await testService.createObjectiveTest(principal, {
          title: testTitle,
          instructions: testInstructions,
          classId: testClassId,
          batchId: testBatchId,
          subjectId: testSubjectId,
          durationMinutes: Number(testDuration),
          startsAt: testStartsAt,
          endsAt: testEndsAt,
          maximumAttempts: Number(testMaxAttempts),
          resultReleaseMode: testReleaseMode,
          scheduledReleaseAt:
            testReleaseMode === 'scheduled_after_end' ? testScheduledRelease : undefined,
          showCorrectAnswersOnRelease: testShowAnswers,
          questions: testQuestions,
          publishImmediately: testPublishNow,
        });
        setBanner(`Created objective test ${created.id} (${created.totalMarks} marks).`);
      }
      setTestModalOpen(false);
      await loadAll();
    } catch (err) {
      setTestFormError(err instanceof Error ? err.message : 'Unable to save objective test.');
    } finally {
      setTestSaving(false);
    }
  };

  const openAttemptsModal = async (test: ObjectiveTest) => {
    setAttemptsModalTest(test);
    try {
      const list = await testService.listTestAttemptsForTeacher(principal, test.id);
      setTestAttempts(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load attempts.');
    }
  };

  const handleReleaseTestResults = async (testId: string) => {
    try {
      await testService.releaseTestResults(principal, testId);
      setBanner(`Released results for test ${testId}.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to release results.');
    }
  };

  // -------------------- EXAMINATION & MARKS ACTIONS --------------------

  const openCreateExam = () => {
    const first = assignments[0];
    setEditingExam(null);
    setExamTitle('');
    setExamClassId(first?.classId ?? '');
    setExamBatchId(first?.batchId ?? '');
    setExamSubjectId(first?.subjectId ?? '');
    setExamDate('2026-11-30');
    setExamStartsAt('10:00');
    setExamEndsAt('11:30');
    setExamMaxMarks('50');
    setExamPassingMarks('20');
    setExamInstructions('All questions are compulsory. Show neat written working.');
    setExamPublishNow(true);
    setExamFormError(null);
    setExamModalOpen(true);
  };

  const openEditExam = (exam: ExaminationRecord) => {
    setEditingExam(exam);
    setExamTitle(exam.title);
    setExamClassId(exam.classId);
    setExamBatchId(exam.batchId);
    setExamSubjectId(exam.subjectId);
    setExamDate(exam.examDate);
    setExamStartsAt(exam.startsAt);
    setExamEndsAt(exam.endsAt);
    setExamMaxMarks(String(exam.maximumMarks));
    setExamPassingMarks(exam.passingMarks !== undefined ? String(exam.passingMarks) : '');
    setExamInstructions(exam.instructions);
    setExamPublishNow(exam.status !== 'draft');
    setExamFormError(null);
    setExamModalOpen(true);
  };

  const handleSaveExam = async (e: FormEvent) => {
    e.preventDefault();
    setExamFormError(null);
    setExamSaving(true);
    try {
      const parsedPass = examPassingMarks.trim()
        ? Number(examPassingMarks.trim())
        : undefined;
      if (editingExam) {
        await examinationService.updateExamination(principal, editingExam.id, {
          title: examTitle,
          examDate,
          startsAt: examStartsAt,
          endsAt: examEndsAt,
          maximumMarks: Number(examMaxMarks),
          passingMarks: parsedPass ?? null,
          instructions: examInstructions,
        });
        setBanner(`Updated examination ${editingExam.id}.`);
      } else {
        const created = await examinationService.createExamination(principal, {
          title: examTitle,
          classId: examClassId,
          batchId: examBatchId,
          subjectId: examSubjectId,
          examDate,
          startsAt: examStartsAt,
          endsAt: examEndsAt,
          maximumMarks: Number(examMaxMarks),
          passingMarks: parsedPass,
          instructions: examInstructions,
          publishImmediately: examPublishNow,
        });
        setBanner(`Created examination ${created.id}.`);
      }
      setExamModalOpen(false);
      await loadAll();
    } catch (err) {
      setExamFormError(err instanceof Error ? err.message : 'Unable to save examination.');
    } finally {
      setExamSaving(false);
    }
  };

  const openMarksRoster = async (examId: string) => {
    setMarksModalOpen(true);
    setMarksError(null);
    setBulkReviewStep(false);
    setCorrectingMark(null);
    try {
      const roster = await examinationService.getExaminationMarksRoster(
        principal,
        examId
      );
      setMarksRoster(roster);
      const initMap: Record<string, string> = {};
      for (const stu of roster.eligibleStudents) {
        initMap[stu.studentId] = '';
      }
      setBulkMarksMap(initMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load marks roster.');
      setMarksModalOpen(false);
    }
  };

  const handleBulkMarksConfirm = async () => {
    if (!marksRoster) return;
    setMarksError(null);
    setMarksSaving(true);
    try {
      const entries = marksRoster.eligibleStudents.map((stu) => ({
        studentId: stu.studentId,
        marksObtained: Number(bulkMarksMap[stu.studentId]),
      }));
      await examinationService.submitBulkExaminationMarks(principal, {
        examinationId: marksRoster.examination.id,
        entries,
        releaseImmediately: bulkReleaseNow,
      });
      setBanner(
        `Saved marks for ${entries.length} student(s) on ${marksRoster.examination.id}.`
      );
      const refreshed = await examinationService.getExaminationMarksRoster(
        principal,
        marksRoster.examination.id
      );
      setMarksRoster(refreshed);
      setBulkReviewStep(false);
      await loadAll();
    } catch (err) {
      setMarksError(err instanceof Error ? err.message : 'Unable to save marks.');
    } finally {
      setMarksSaving(false);
    }
  };

  const handleSaveMarkCorrection = async (e: FormEvent) => {
    e.preventDefault();
    if (!correctingMark || !marksRoster) return;
    setMarksError(null);
    setMarksSaving(true);
    try {
      await examinationService.correctExaminationMarks(principal, {
        marksRecordId: correctingMark.id,
        newMarksObtained: Number(correctNewMarks),
        reason: correctReason,
      });
      setBanner(
        `Corrected marks for ${correctingMark.studentName} with audit log entry.`
      );
      const refreshed = await examinationService.getExaminationMarksRoster(
        principal,
        marksRoster.examination.id
      );
      setMarksRoster(refreshed);
      setCorrectingMark(null);
      setCorrectReason('');
      await loadAll();
    } catch (err) {
      setMarksError(err instanceof Error ? err.message : 'Unable to correct marks.');
    } finally {
      setMarksSaving(false);
    }
  };

  const handleReleaseExamResults = async (examId: string) => {
    try {
      await examinationService.releaseExaminationResults(principal, examId);
      setBanner(`Examination results released for ${examId}.`);
      if (marksRoster?.examination.id === examId) {
        const refreshed = await examinationService.getExaminationMarksRoster(
          principal,
          examId
        );
        setMarksRoster(refreshed);
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to release exam results.');
    }
  };

  const liveTestTotalMarks = testQuestions.reduce(
    (sum, q) => sum + (Number.isFinite(q.marks) && q.marks > 0 ? q.marks : 0),
    0
  );

  const testColumns: TableColumn<TeacherObjectiveTestSummary>[] = [
    {
      key: 'test',
      header: 'Objective Test',
      render: (row) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
            <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
              {row.test.id}
            </span>
            <span aria-hidden="true">·</span>
            <span>{row.subjectName}</span>
          </div>
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
            {row.test.title}
          </p>
          <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
            {row.className} · {row.batchName}
          </p>
        </div>
      ),
    },
    {
      key: 'config',
      header: 'Questions & Window',
      render: (row) => (
        <div className="text-xs space-y-0.5">
          <p className="font-mono tabular-nums text-[#17172B] dark:text-[#F8FAFC]">
            {row.test.questions.length} MCQs · {row.test.totalMarks} marks ·{' '}
            {row.test.durationMinutes} min
          </p>
          <p className="text-[#687086] dark:text-[#A6B0C3] tabular-nums">
            {formatShortDate(row.test.startsAt)} – {formatShortDate(row.test.endsAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status & Attempts',
      render: (row) => (
        <div className="space-y-1">
          <StatusText
            tone={
              row.effectiveStatus === 'active'
                ? 'nominal'
                : row.effectiveStatus === 'published'
                  ? 'warning'
                  : 'neutral'
            }
            label={row.effectiveStatus.toUpperCase()}
          />
          <p className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
            {row.attemptCount} attempts ·{' '}
            {row.test.manualResultsReleased ||
            row.test.resultReleaseMode === 'auto_after_submission'
              ? 'Results Released'
              : 'Results Held'}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void openAttemptsModal(row.test)}
          >
            Attempts
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewTest(row)}
            iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
          >
            Preview
          </Button>
          {row.attemptCount === 0 && (
            <Button variant="ghost" size="sm" onClick={() => openEditTest(row.test)}>
              Edit
            </Button>
          )}
          {row.test.status === 'draft' && (
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                await testService.setObjectiveTestStatus(
                  principal,
                  row.test.id,
                  'published'
                );
                setBanner(`Published ${row.test.id}.`);
                await loadAll();
              }}
              iconLeft={<Send className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              Publish
            </Button>
          )}
          {!row.test.manualResultsReleased &&
            row.test.resultReleaseMode === 'manual_teacher_release' &&
            row.evaluatedCount > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleReleaseTestResults(row.test.id)}
              >
                Release Results
              </Button>
            )}
        </div>
      ),
    },
  ];

  const examColumns: TableColumn<ExaminationDetailView>[] = [
    {
      key: 'exam',
      header: 'Examination',
      render: (row) => (
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs text-[#687086] dark:text-[#A6B0C3]">
            <span className="font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
              {row.examination.id}
            </span>
            <span aria-hidden="true">·</span>
            <span>{row.subjectName}</span>
          </div>
          <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
            {row.examination.title}
          </p>
          <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
            {row.className} · {row.batchName}
          </p>
        </div>
      ),
    },
    {
      key: 'schedule',
      header: 'Schedule & Marks',
      render: (row) => (
        <div className="text-xs space-y-0.5 font-mono tabular-nums">
          <p className="text-[#17172B] dark:text-[#F8FAFC]">
            {formatShortDate(row.examination.examDate)} · {row.examination.startsAt}–
            {row.examination.endsAt}
          </p>
          <p className="text-[#687086] dark:text-[#A6B0C3]">
            Max {row.examination.maximumMarks}
            {row.examination.passingMarks !== undefined
              ? ` · Pass ${row.examination.passingMarks}`
              : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'marksStatus',
      header: 'Status',
      render: (row) => (
        <div className="space-y-1">
          <StatusText
            tone={
              row.examination.resultsReleased
                ? 'nominal'
                : row.examination.status === 'published'
                  ? 'warning'
                  : 'neutral'
            }
            label={
              row.examination.resultsReleased
                ? 'Marks Released'
                : row.examination.status === 'completed'
                  ? 'Marks Entered (Unreleased)'
                  : row.examination.status.toUpperCase()
            }
          />
          <p className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
            {row.marksEnteredCount} / {row.eligibleStudentCount} marks recorded
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {row.examination.status !== 'draft' &&
            row.examination.status !== 'archived' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void openMarksRoster(row.examination.id)}
                iconLeft={<ClipboardEdit className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                {row.marksEnteredCount > 0 ? 'Manage / Correct Marks' : 'Enter Marks'}
              </Button>
            )}
          <Button variant="ghost" size="sm" onClick={() => openEditExam(row.examination)}>
            Edit
          </Button>
          {row.examination.status === 'draft' && (
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                await examinationService.setExaminationStatus(
                  principal,
                  row.examination.id,
                  'published'
                );
                setBanner(`Published ${row.examination.id}.`);
                await loadAll();
              }}
            >
              Publish
            </Button>
          )}
          {row.marksEnteredCount > 0 && !row.examination.resultsReleased && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleReleaseExamResults(row.examination.id)}
            >
              Release Results
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#687086] dark:text-[#A6B0C3]">
            Teacher Assessments · Objective Auto-Evaluation & Written Exams
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17172B] dark:text-[#F8FAFC] text-balance">
            Online Tests, Examinations & Marks
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={openCreateExam}
            disabled={assignments.length === 0}
            iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            Schedule Exam
          </Button>
          <Button
            variant="primary"
            onClick={openCreateTest}
            disabled={assignments.length === 0}
            iconLeft={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            Create Online Test
          </Button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex overflow-x-auto gap-1 rounded-xl bg-[#F1EEFA] dark:bg-[#202844] p-1">
        {(
          [
            { id: 'tests', label: `Objective Tests (${tests.length})` },
            { id: 'examinations', label: `Examinations & Marks (${exams.length})` },
            { id: 'results', label: 'Results Workspace' },
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
          title="Online Objective Tests (MCQ Only)"
          subtitle="Build multiple-choice tests with automated deterministic scoring and configurable result release."
        >
          <Table
            columns={testColumns}
            rows={tests}
            rowKey={(r) => r.test.id}
            loading={loading}
            emptyTitle="No objective tests created"
            emptyDescription="Create an MCQ test for your assigned classes and batches."
            mobileCardRender={(row) => (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {row.test.id} · {row.subjectName}
                    </p>
                    <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {row.test.title}
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {row.className} · {row.batchName}
                    </p>
                  </div>
                  <StatusText
                    tone={
                      row.effectiveStatus === 'active'
                        ? 'nominal'
                        : row.effectiveStatus === 'published'
                          ? 'warning'
                          : 'neutral'
                    }
                    label={row.effectiveStatus.toUpperCase()}
                  />
                </div>
                <p className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                  {row.test.questions.length} MCQs · {row.test.totalMarks} marks ·{' '}
                  {row.test.durationMinutes} min · {row.attemptCount} attempts
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void openAttemptsModal(row.test)}
                  >
                    Attempts
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewTest(row)}
                    iconLeft={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    Preview
                  </Button>
                  {row.attemptCount === 0 && (
                    <Button variant="ghost" size="sm" onClick={() => openEditTest(row.test)}>
                      Edit
                    </Button>
                  )}
                  {!row.test.manualResultsReleased &&
                    row.test.resultReleaseMode === 'manual_teacher_release' &&
                    row.evaluatedCount > 0 && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleReleaseTestResults(row.test.id)}
                      >
                        Release Results
                      </Button>
                    )}
                </div>
              </div>
            )}
          />
        </Card>
      )}

      {subTab === 'examinations' && (
        <Card
          title="Scheduled Examinations & Manual Marks"
          subtitle="Schedule written or offline exams, record bulk marks for eligible batch students, and release marks with audit history."
        >
          <Table
            columns={examColumns}
            rows={exams}
            rowKey={(r) => r.examination.id}
            loading={loading}
            emptyTitle="No examinations scheduled"
            emptyDescription="Schedule an examination for your assigned classes and batches."
            mobileCardRender={(row) => (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono font-semibold text-[#7552D9] dark:text-[#A78BFA]">
                      {row.examination.id} · {row.subjectName}
                    </p>
                    <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {row.examination.title}
                    </p>
                    <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {row.className} · {row.batchName}
                    </p>
                  </div>
                  <StatusText
                    tone={
                      row.examination.resultsReleased
                        ? 'nominal'
                        : row.examination.status === 'published'
                          ? 'warning'
                          : 'neutral'
                    }
                    label={
                      row.examination.resultsReleased
                        ? 'Marks Released'
                        : row.examination.status === 'completed'
                          ? 'Entered'
                          : row.examination.status.toUpperCase()
                    }
                  />
                </div>
                <p className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                  {formatShortDate(row.examination.examDate)} · {row.examination.startsAt}–
                  {row.examination.endsAt} · {row.marksEnteredCount}/{row.eligibleStudentCount} marks
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {row.examination.status !== 'draft' &&
                    row.examination.status !== 'archived' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void openMarksRoster(row.examination.id)}
                        iconLeft={<ClipboardEdit className="w-3.5 h-3.5" aria-hidden="true" />}
                      >
                        {row.marksEnteredCount > 0 ? 'Manage Marks' : 'Enter Marks'}
                      </Button>
                    )}
                  <Button variant="ghost" size="sm" onClick={() => openEditExam(row.examination)}>
                    Edit
                  </Button>
                  {row.marksEnteredCount > 0 && !row.examination.resultsReleased && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleReleaseExamResults(row.examination.id)}
                    >
                      Release Results
                    </Button>
                  )}
                </div>
              </div>
            )}
          />
        </Card>
      )}

      {subTab === 'results' && resultsWorkspace && (
        <div className="space-y-6">
          <Card
            title="Test Attempts & Scores"
            subtitle="Evaluated online test attempts across your assigned batches."
          >
            {resultsWorkspace.testResults.every((t) => t.attempts.length === 0) ? (
              <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                No student test attempts recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
                {resultsWorkspace.testResults.map((group) => (
                  <div key={group.test.id} className="py-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        {group.test.title} ({group.subjectName} · {group.batchName})
                      </p>
                      <span className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                        {group.attempts.length} attempt(s)
                      </span>
                    </div>
                    {group.attempts.length > 0 && (
                      <ul className="space-y-1 text-xs text-[#687086] dark:text-[#A6B0C3]">
                        {group.attempts.map((a) => (
                          <li key={a.id} className="font-mono tabular-nums">
                            {a.studentName} ({a.studentId}) · Attempt #{a.attemptNumber} ·{' '}
                            {a.status === 'evaluated'
                              ? `${a.marksObtained}/${a.totalMarks} (${a.percentage}%)`
                              : 'In Progress'}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Examination Marks Summary"
            subtitle="Marks recorded and pending student counts per examination."
          >
            <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
              {resultsWorkspace.examinationResults.map((group) => (
                <div key={group.examination.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      {group.examination.title} ({group.subjectName} · {group.batchName})
                    </p>
                    <span className="text-xs font-mono tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                      Recorded: {group.marks.length} · Pending: {group.pendingStudentCount} ·{' '}
                      {group.examination.resultsReleased ? 'Released' : 'Not Released'}
                    </span>
                  </div>
                  {group.marks.length > 0 && (
                    <ul className="space-y-1 text-xs text-[#687086] dark:text-[#A6B0C3]">
                      {group.marks.map((m) => (
                        <li key={m.id} className="font-mono tabular-nums">
                          {m.studentName} ({m.studentId}): {m.marksObtained}/
                          {m.maximumMarks} ({m.percentage}% · {m.resultStatus.toUpperCase()})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Objective Test Builder Modal */}
      <Modal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        title={editingTest ? `Edit Test ${editingTest.id}` : 'Create Online Objective Test'}
        subtitle="Strict MCQ validation: minimum 2 unique options, 1 correct answer, positive marks."
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSaveTest} className="space-y-4">
          {testFormError && (
            <div
              role="alert"
              className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/30 bg-[#D94C5C]/10 dark:bg-[#F16B75]/15 p-3 text-xs text-[#D94C5C] dark:text-[#F16B75]"
            >
              {testFormError}
            </div>
          )}

          {!editingTest && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                  Class
                </label>
                <select
                  value={testClassId}
                  onChange={(e) => {
                    const nextC = e.target.value;
                    setTestClassId(nextC);
                    const match = assignments.find((a) => a.classId === nextC);
                    setTestBatchId(match?.batchId ?? '');
                    setTestSubjectId(match?.subjectId ?? '');
                  }}
                  className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-2.5 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                >
                  {(scope?.classes ?? []).map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                  Batch
                </label>
                <select
                  value={testBatchId}
                  onChange={(e) => {
                    const nextB = e.target.value;
                    setTestBatchId(nextB);
                    const match = assignments.find(
                      (a) => a.classId === testClassId && a.batchId === nextB
                    );
                    setTestSubjectId(match?.subjectId ?? '');
                  }}
                  className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-2.5 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                >
                  {getBatchesFor(testClassId).map((b) => (
                    <option key={b.batchId} value={b.batchId}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                  Subject
                </label>
                <select
                  value={testSubjectId}
                  onChange={(e) => setTestSubjectId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-2.5 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                >
                  {getSubjectsFor(testClassId, testBatchId).map((s) => (
                    <option key={s.subjectId} value={s.subjectId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Test Title
              </label>
              <input
                type="text"
                value={testTitle}
                onChange={(e) => setTestTitle(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Result Release Mode
              </label>
              <select
                value={testReleaseMode}
                onChange={(e) =>
                  setTestReleaseMode(e.target.value as TestResultReleaseMode)
                }
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              >
                <option value="auto_after_submission">Auto Immediately After Submission</option>
                <option value="manual_teacher_release">Manual Teacher Release</option>
                <option value="scheduled_after_end">Scheduled After End Time</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
              Instructions
            </label>
            <textarea
              rows={2}
              value={testInstructions}
              onChange={(e) => setTestInstructions(e.target.value)}
              required
              className="w-full rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] p-2.5 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Duration (Mins)
              </label>
              <input
                type="number"
                min={1}
                value={testDuration}
                onChange={(e) => setTestDuration(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Max Attempts
              </label>
              <input
                type="number"
                min={1}
                value={testMaxAttempts}
                onChange={(e) => setTestMaxAttempts(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Window Opens
              </label>
              <input
                type="datetime-local"
                value={testStartsAt}
                onChange={(e) => setTestStartsAt(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-2.5 text-xs text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Window Closes
              </label>
              <input
                type="datetime-local"
                value={testEndsAt}
                onChange={(e) => setTestEndsAt(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-2.5 text-xs text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
          </div>

          {testReleaseMode === 'scheduled_after_end' && (
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Scheduled Result Release Date & Time
              </label>
              <input
                type="datetime-local"
                value={testScheduledRelease}
                onChange={(e) => setTestScheduledRelease(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs text-[#17172B] dark:text-[#F8FAFC]">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={testShowAnswers}
                onChange={(e) => setTestShowAnswers(e.target.checked)}
                className="w-4 h-4 accent-[#7552D9] dark:accent-[#8B5CF6]"
              />
              <span>Show correct answers & explanations after result release</span>
            </label>
            {!editingTest && (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={testPublishNow}
                  onChange={(e) => setTestPublishNow(e.target.checked)}
                  className="w-4 h-4 accent-[#7552D9] dark:accent-[#8B5CF6]"
                />
                <span>Publish immediately</span>
              </label>
            )}
          </div>

          {/* Question List Builder */}
          <div className="border-t border-[#E5E7EF] dark:border-[#303A55] pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                MCQ Questions ({testQuestions.length}) · Auto Total Marks:{' '}
                <span className="font-mono tabular-nums">{liveTestTotalMarks}</span>
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTestQuestions((prev) => [...prev, emptyQuestionDraft()])}
                iconLeft={<Plus className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                Add Question
              </Button>
            </div>

            <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55]">
              {testQuestions.map((q, qIdx) => (
                <div key={qIdx} className="py-4 first:pt-0 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-[#7552D9] dark:text-[#C4B5FD]">
                      Question {qIdx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveQuestion(qIdx, -1)}
                        disabled={qIdx === 0}
                        aria-label={`Move question ${qIdx + 1} up`}
                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[#687086] dark:text-[#A6B0C3] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] disabled:opacity-40 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(qIdx, 1)}
                        disabled={qIdx === testQuestions.length - 1}
                        aria-label={`Move question ${qIdx + 1} down`}
                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[#687086] dark:text-[#A6B0C3] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] disabled:opacity-40 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setTestQuestions((prev) =>
                            prev.length > 1 ? prev.filter((_, i) => i !== qIdx) : prev
                          )
                        }
                        disabled={testQuestions.length <= 1}
                        aria-label={`Remove question ${qIdx + 1}`}
                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[#D94C5C] dark:text-[#F16B75] hover:bg-[#D94C5C]/10 dark:hover:bg-[#F16B75]/15 disabled:opacity-40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-3">
                      <input
                        type="text"
                        value={q.questionText}
                        onChange={(e) =>
                          updateQuestion(qIdx, (prev) => ({
                            ...prev,
                            questionText: e.target.value,
                          }))
                        }
                        placeholder="Enter question text..."
                        required
                        className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                      />
                    </div>
                    <div>
                      <input
                        type="number"
                        min={1}
                        step="1"
                        value={q.marks}
                        onChange={(e) =>
                          updateQuestion(qIdx, (prev) => ({
                            ...prev,
                            marks: Number(e.target.value),
                          }))
                        }
                        placeholder="Marks"
                        required
                        className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm tabular-nums text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-[#687086] dark:text-[#A6B0C3]">
                      <span>Options (Select radio button for the 1 correct answer)</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQuestion(qIdx, (prev) => ({
                            ...prev,
                            options: [...prev.options, { text: '' }],
                          }))
                        }
                        className="text-[#7552D9] dark:text-[#C4B5FD] font-medium underline cursor-pointer"
                      >
                        + Add Option
                      </button>
                    </div>
                    {q.options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${qIdx}`}
                          checked={q.correctOptionIndex === oIdx}
                          onChange={() =>
                            updateQuestion(qIdx, (prev) => ({
                              ...prev,
                              correctOptionIndex: oIdx,
                            }))
                          }
                          aria-label={`Mark option ${oIdx + 1} correct`}
                          className="w-4 h-4 accent-[#7552D9] dark:accent-[#8B5CF6]"
                        />
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) =>
                            updateQuestion(qIdx, (prev) => ({
                              ...prev,
                              options: prev.options.map((o, idx2) =>
                                idx2 === oIdx ? { ...o, text: e.target.value } : o
                              ),
                            }))
                          }
                          placeholder={`Option ${oIdx + 1}`}
                          required
                          className="flex-1 min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                        />
                        <button
                          type="button"
                          onClick={() => moveOption(qIdx, oIdx, -1)}
                          disabled={oIdx === 0}
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[#687086] dark:text-[#A6B0C3] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] disabled:opacity-30 cursor-pointer"
                          aria-label="Move option up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveOption(qIdx, oIdx, 1)}
                          disabled={oIdx === q.options.length - 1}
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[#687086] dark:text-[#A6B0C3] hover:bg-[#F1EEFA] dark:hover:bg-[#202844] disabled:opacity-30 cursor-pointer"
                          aria-label="Move option down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuestion(qIdx, (prev) => {
                              if (prev.options.length <= 2) return prev;
                              const nextOpts = prev.options.filter((_, i) => i !== oIdx);
                              const nextCorrect =
                                prev.correctOptionIndex >= nextOpts.length
                                  ? 0
                                  : prev.correctOptionIndex;
                              return {
                                ...prev,
                                options: nextOpts,
                                correctOptionIndex: nextCorrect,
                              };
                            })
                          }
                          disabled={q.options.length <= 2}
                          className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[#D94C5C] dark:text-[#F16B75] hover:bg-[#D94C5C]/10 dark:hover:bg-[#F16B75]/15 disabled:opacity-30 cursor-pointer"
                          aria-label="Remove option"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={q.explanation ?? ''}
                    onChange={(e) =>
                      updateQuestion(qIdx, (prev) => ({
                        ...prev,
                        explanation: e.target.value,
                      }))
                    }
                    placeholder="Optional answer explanation (shown after result release)"
                    className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-xs text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTestModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={testSaving}>
              {editingTest ? 'Save Test' : testPublishNow ? 'Create & Publish Test' : 'Save Draft'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Preview Test Modal */}
      <Modal
        open={Boolean(previewTest)}
        onClose={() => setPreviewTest(null)}
        title={previewTest ? `Test Preview: ${previewTest.test.title}` : ''}
        subtitle={
          previewTest
            ? `${previewTest.test.questions.length} MCQs · ${previewTest.test.totalMarks} Total Marks · ${previewTest.test.durationMinutes} mins`
            : ''
        }
        maxWidthClass="max-w-2xl"
      >
        {previewTest && (
          <div className="space-y-4">
            <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
              {previewTest.test.instructions}
            </p>
            <ol className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] space-y-3">
              {previewTest.test.questions.map((q, idx) => (
                <li key={q.id} className="pt-3 first:pt-0 space-y-1.5">
                  <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                    Q{idx + 1}. {q.questionText}{' '}
                    <span className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3] tabular-nums">
                      ({q.marks} marks)
                    </span>
                  </p>
                  <ul className="space-y-1 pl-4 text-xs text-[#687086] dark:text-[#A6B0C3]">
                    {q.options.map((opt) => (
                      <li
                        key={opt.id}
                        className={
                          opt.id === q.correctOptionId
                            ? 'font-semibold text-[#168A62] dark:text-[#22C58B]'
                            : ''
                        }
                      >
                        • {opt.text}
                        {opt.id === q.correctOptionId ? ' (Correct Answer)' : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Modal>

      {/* Test Attempts Modal */}
      <Modal
        open={Boolean(attemptsModalTest)}
        onClose={() => setAttemptsModalTest(null)}
        title={
          attemptsModalTest ? `Attempts: ${attemptsModalTest.title}` : 'Attempts'
        }
        maxWidthClass="max-w-2xl"
      >
        {attemptsModalTest && (
          <div className="space-y-4">
            {testAttempts.length === 0 ? (
              <p className="text-sm text-[#687086] dark:text-[#A6B0C3]">
                No student has attempted this test yet.
              </p>
            ) : (
              <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] text-sm">
                {testAttempts.map((a) => (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                        {a.studentName} ({a.studentId})
                      </p>
                      <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                        Attempt #{a.attemptNumber} · Started {formatDateTime(a.startedAt)}
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums text-xs">
                      {a.status === 'evaluated' ? (
                        <p className="font-semibold text-[#168A62] dark:text-[#22C58B]">
                          {a.marksObtained} / {a.totalMarks} ({a.percentage}%)
                        </p>
                      ) : (
                        <p className="text-[#B7791F] dark:text-[#F5B942]">In Progress</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      {/* Create / Edit Examination Modal */}
      <Modal
        open={examModalOpen}
        onClose={() => setExamModalOpen(false)}
        title={
          editingExam
            ? `Edit Examination ${editingExam.id}`
            : 'Schedule New Examination'
        }
        subtitle="Separate scheduling & manual marks workflow for written/offline assessments."
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveExam} className="space-y-4">
          {examFormError && (
            <div
              role="alert"
              className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/30 bg-[#D94C5C]/10 dark:bg-[#F16B75]/15 p-3 text-xs text-[#D94C5C] dark:text-[#F16B75]"
            >
              {examFormError}
            </div>
          )}

          {!editingExam && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                  Class
                </label>
                <select
                  value={examClassId}
                  onChange={(e) => {
                    const nextC = e.target.value;
                    setExamClassId(nextC);
                    const match = assignments.find((a) => a.classId === nextC);
                    setExamBatchId(match?.batchId ?? '');
                    setExamSubjectId(match?.subjectId ?? '');
                  }}
                  className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-2.5 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                >
                  {(scope?.classes ?? []).map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                  Batch
                </label>
                <select
                  value={examBatchId}
                  onChange={(e) => {
                    const nextB = e.target.value;
                    setExamBatchId(nextB);
                    const match = assignments.find(
                      (a) => a.classId === examClassId && a.batchId === nextB
                    );
                    setExamSubjectId(match?.subjectId ?? '');
                  }}
                  className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-2.5 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                >
                  {getBatchesFor(examClassId).map((b) => (
                    <option key={b.batchId} value={b.batchId}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                  Subject
                </label>
                <select
                  value={examSubjectId}
                  onChange={(e) => setExamSubjectId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-2.5 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                >
                  {getSubjectsFor(examClassId, examBatchId).map((s) => (
                    <option key={s.subjectId} value={s.subjectId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
              Examination Title
            </label>
            <input
              type="text"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              required
              placeholder="e.g., Unit Test 2 — Written Paper"
              className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Exam Date
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Start Time (HH:MM)
              </label>
              <input
                type="time"
                value={examStartsAt}
                onChange={(e) => setExamStartsAt(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                End Time (HH:MM)
              </label>
              <input
                type="time"
                value={examEndsAt}
                onChange={(e) => setExamEndsAt(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Maximum Marks
              </label>
              <input
                type="number"
                min={1}
                value={examMaxMarks}
                onChange={(e) => setExamMaxMarks(e.target.value)}
                required
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm tabular-nums text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                Passing Marks (Optional)
              </label>
              <input
                type="number"
                min={0}
                value={examPassingMarks}
                onChange={(e) => setExamPassingMarks(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm tabular-nums text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
              Instructions / Syllabus Scope
            </label>
            <textarea
              rows={3}
              value={examInstructions}
              onChange={(e) => setExamInstructions(e.target.value)}
              required
              className="w-full rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] p-3 text-sm text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
            />
          </div>

          {!editingExam && (
            <label className="inline-flex items-center gap-2 text-sm text-[#17172B] dark:text-[#F8FAFC] cursor-pointer">
              <input
                type="checkbox"
                checked={examPublishNow}
                onChange={(e) => setExamPublishNow(e.target.checked)}
                className="w-4 h-4 accent-[#7552D9] dark:accent-[#8B5CF6]"
              />
              <span>Publish exam schedule immediately</span>
            </label>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setExamModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={examSaving}>
              {editingExam ? 'Save Changes' : 'Schedule Examination'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk Manual Marks Entry & Audited Correction Modal */}
      <Modal
        open={marksModalOpen}
        onClose={() => setMarksModalOpen(false)}
        title={
          marksRoster
            ? `Examination Marks: ${marksRoster.examination.title}`
            : 'Loading Roster'
        }
        subtitle={
          marksRoster
            ? `${marksRoster.examination.id} · Maximum Marks: ${marksRoster.examination.maximumMarks}${
                marksRoster.examination.passingMarks !== undefined
                  ? ` · Passing: ${marksRoster.examination.passingMarks}`
                  : ''
              }`
            : ''
        }
        maxWidthClass="max-w-3xl"
      >
        {marksRoster && (
          <div className="space-y-5">
            {marksError && (
              <div
                role="alert"
                className="rounded-xl border border-[#D94C5C]/30 dark:border-[#F16B75]/30 bg-[#D94C5C]/10 dark:bg-[#F16B75]/15 p-3 text-xs text-[#D94C5C] dark:text-[#F16B75]"
              >
                {marksError}
              </div>
            )}

            {marksRoster.marks.length === 0 ? (
              <div className="space-y-4">
                <p className="text-xs text-[#687086] dark:text-[#A6B0C3]">
                  Enter marks for every eligible batch student ({marksRoster.eligibleStudents.length} active student(s)).
                </p>

                <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] border-t border-b border-[#E5E7EF] dark:border-[#303A55]">
                  {marksRoster.eligibleStudents.map((stu) => (
                    <div
                      key={stu.studentId}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                          {stu.studentName}
                        </p>
                        <p className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                          {stu.studentId} · {stu.enrolmentId}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={marksRoster.examination.maximumMarks}
                          step="0.5"
                          value={bulkMarksMap[stu.studentId] ?? ''}
                          onChange={(e) =>
                            setBulkMarksMap((prev) => ({
                              ...prev,
                              [stu.studentId]: e.target.value,
                            }))
                          }
                          disabled={bulkReviewStep}
                          placeholder={`0–${marksRoster.examination.maximumMarks}`}
                          aria-label={`Marks for ${stu.studentName}`}
                          className="w-28 min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm tabular-nums font-mono text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                        />
                        <span className="text-xs font-mono text-[#687086] dark:text-[#A6B0C3] tabular-nums">
                          / {marksRoster.examination.maximumMarks}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-[#17172B] dark:text-[#F8FAFC] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkReleaseNow}
                    onChange={(e) => setBulkReleaseNow(e.target.checked)}
                    disabled={bulkReviewStep}
                    className="w-4 h-4 accent-[#7552D9] dark:accent-[#8B5CF6]"
                  />
                  <span>Release marks immediately to students & parents</span>
                </label>

                {!bulkReviewStep ? (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="primary"
                      onClick={() => {
                        for (const stu of marksRoster.eligibleStudents) {
                          const raw = bulkMarksMap[stu.studentId];
                          const num = Number(raw);
                          if (
                            raw === undefined ||
                            raw.trim() === '' ||
                            !Number.isFinite(num) ||
                            num < 0 ||
                            num > marksRoster.examination.maximumMarks
                          ) {
                            setMarksError(
                              `Enter valid marks (0–${marksRoster.examination.maximumMarks}) for ${stu.studentName} (${stu.studentId}).`
                            );
                            return;
                          }
                        }
                        setMarksError(null);
                        setBulkReviewStep(true);
                      }}
                    >
                      Review Before Saving
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#B7791F]/30 dark:border-[#F5B942]/30 bg-[#B7791F]/10 dark:bg-[#F5B942]/15 p-3.5 space-y-3">
                    <p className="text-xs font-semibold text-[#B7791F] dark:text-[#F5B942]">
                      Confirm marks submission for {marksRoster.eligibleStudents.length} student(s). Subsequent edits require a mandatory audit reason.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setBulkReviewStep(false)}
                      >
                        Back to Edit
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={marksSaving}
                        onClick={() => void handleBulkMarksConfirm()}
                        iconLeft={<CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
                      >
                        Confirm & Submit Marks
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusText
                    tone={marksRoster.examination.resultsReleased ? 'nominal' : 'warning'}
                    label={
                      marksRoster.examination.resultsReleased
                        ? 'Results Released to Students'
                        : 'Marks Recorded — Pending Release'
                    }
                  />
                  {!marksRoster.examination.resultsReleased && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        void handleReleaseExamResults(marksRoster.examination.id)
                      }
                    >
                      Release Results Now
                    </Button>
                  )}
                </div>

                <div className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] border-t border-b border-[#E5E7EF] dark:border-[#303A55]">
                  {marksRoster.marks.map((m) => (
                    <div
                      key={m.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                          {m.studentName}{' '}
                          <span className="font-mono text-xs text-[#687086] dark:text-[#A6B0C3]">
                            ({m.studentId})
                          </span>
                        </p>
                        <p className="font-mono text-xs tabular-nums text-[#687086] dark:text-[#A6B0C3]">
                          {m.marksObtained} / {m.maximumMarks} ({m.percentage}% ·{' '}
                          {m.resultStatus.toUpperCase()})
                          {m.corrected ? ' · Corrected' : ''}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setCorrectingMark(m);
                          setCorrectNewMarks(String(m.marksObtained));
                          setCorrectReason('');
                          setMarksError(null);
                        }}
                      >
                        Correct Marks
                      </Button>
                    </div>
                  ))}
                </div>

                {correctingMark && (
                  <form
                    onSubmit={handleSaveMarkCorrection}
                    className="rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-[#F8F9FC] dark:bg-[#101426]/65 p-4 space-y-3"
                  >
                    <p className="text-xs font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                      Audited Marks Correction: {correctingMark.studentName} (Current:{' '}
                      {correctingMark.marksObtained})
                    </p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                          Corrected Marks (0–{marksRoster.examination.maximumMarks})
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={marksRoster.examination.maximumMarks}
                          step="0.5"
                          value={correctNewMarks}
                          onChange={(e) => setCorrectNewMarks(e.target.value)}
                          required
                          className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm tabular-nums text-[#17172B] dark:text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-[#17172B] dark:text-[#F8FAFC] mb-1">
                          Mandatory Correction Reason (Min 5 characters)
                        </label>
                        <input
                          type="text"
                          value={correctReason}
                          onChange={(e) => setCorrectReason(e.target.value)}
                          required
                          placeholder="e.g., Rechecked Question 3 totaling error"
                          className="w-full min-h-[44px] rounded-xl border border-[#E5E7EF] dark:border-[#303A55] bg-white dark:bg-[#101426] px-3 text-sm text-[#17172B] dark:text-[#F8FAFC] placeholder:text-[#687086] dark:placeholder:text-[#A6B0C3] focus:outline-none focus:ring-2 focus:ring-[#7552D9]/35 dark:focus:ring-[#8B5CF6]/45"
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
                      <Button type="submit" variant="primary" size="sm" loading={marksSaving}>
                        Save Audited Correction
                      </Button>
                    </div>
                  </form>
                )}

                {marksRoster.auditEntries.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-[#687086] dark:text-[#A6B0C3] mb-1.5">
                      Marks Audit Trail ({marksRoster.auditEntries.length})
                    </h4>
                    <ul className="divide-y divide-[#E5E7EF] dark:divide-[#303A55] text-xs">
                      {marksRoster.auditEntries.map((aud) => (
                        <li key={aud.id} className="py-1.5 text-[#687086] dark:text-[#A6B0C3]">
                          <span className="font-mono font-semibold text-[#17172B] dark:text-[#F8FAFC]">
                            {aud.id}
                          </span>{' '}
                          · {aud.studentId}: {aud.previousMarks} → {aud.newMarks} by{' '}
                          {aud.actorId} on {formatDateTime(aud.timestamp)} — {aud.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
