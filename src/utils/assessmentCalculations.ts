import type {
  HomeworkComputedIndicator,
  HomeworkRecord,
  ObjectiveQuestion,
  ObjectiveTest,
  ObjectiveTestStatus,
  TestAttempt,
} from '../types';

/**
 * Deterministic score percentage calculation shared across Homework,
 * Objective Tests, Examinations, and Student Results views.
 *
 * Formula: (Marks Obtained / Total Marks) × 100 (rounded to 1 decimal place).
 */
export function calculateScorePercentage(marksObtained: number, totalMarks: number): number {
  if (!Number.isFinite(totalMarks) || totalMarks <= 0) {
    return 0;
  }
  if (!Number.isFinite(marksObtained) || marksObtained < 0) {
    return 0;
  }
  const raw = (marksObtained / totalMarks) * 100;
  return Math.round(raw * 10) / 10;
}

/**
 * Deterministic automatic MCQ evaluation executed strictly by the service layer.
 * - Exact match on correctOptionId => full question marks
 * - Incorrect option or unanswered => 0 marks
 * - Evaluates against positive totalMarks
 */
export function evaluateObjectiveQuestions(
  questions: ObjectiveQuestion[],
  answers: Record<string, string>
): {
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  correctCount: number;
  unansweredCount: number;
} {
  const totalMarks = questions.reduce((acc, q) => acc + q.marks, 0);
  if (totalMarks <= 0) {
    throw new Error('Objective test total marks must be greater than zero.');
  }

  let marksObtained = 0;
  let correctCount = 0;
  let unansweredCount = 0;

  for (const q of questions) {
    const chosen = answers[q.id];
    if (!chosen) {
      unansweredCount += 1;
      continue;
    }
    if (chosen === q.correctOptionId) {
      marksObtained += q.marks;
      correctCount += 1;
    }
  }

  return {
    marksObtained,
    totalMarks,
    percentage: calculateScorePercentage(marksObtained, totalMarks),
    correctCount,
    unansweredCount,
  };
}

/**
 * Computes human-readable lifecycle status indicator for Homework cards.
 */
export function getHomeworkComputedIndicator(
  homework: HomeworkRecord,
  nowMs: number = Date.now()
): HomeworkComputedIndicator {
  if (homework.status === 'draft') return 'draft';
  if (homework.status === 'closed') return 'closed';
  if (homework.status === 'archived') return 'archived';

  const dueMs = new Date(homework.dueAt).getTime();
  if (Number.isNaN(dueMs)) {
    return 'published';
  }
  if (nowMs > dueMs) {
    return 'overdue';
  }
  // Closing Soon if within 48 hours of dueAt
  if (dueMs - nowMs <= 48 * 60 * 60 * 1000) {
    return 'closing_soon';
  }
  return 'published';
}

/**
 * Computes effective runtime status of a published ObjectiveTest against current time.
 */
export function getEffectiveTestStatus(
  test: ObjectiveTest,
  nowMs: number = Date.now()
): ObjectiveTestStatus {
  if (test.status === 'draft' || test.status === 'archived' || test.status === 'completed') {
    return test.status;
  }
  const startMs = new Date(test.startsAt).getTime();
  const endMs = new Date(test.endsAt).getTime();
  if (!Number.isNaN(endMs) && nowMs > endMs) {
    return 'completed';
  }
  if (!Number.isNaN(startMs) && nowMs >= startMs) {
    return 'active';
  }
  return 'published';
}

/**
 * Determines whether a student may view marks & answer keys for a submitted TestAttempt.
 */
export function areTestResultsVisibleToStudent(
  test: ObjectiveTest,
  attempt: Pick<TestAttempt, 'status' | 'submittedAt' | 'resultReleasedAt'>,
  nowMs: number = Date.now()
): boolean {
  if (attempt.status === 'in_progress') {
    return false;
  }
  if (test.manualResultsReleased) {
    return true;
  }
  if (test.resultReleaseMode === 'auto_after_submission') {
    return true;
  }
  if (test.resultReleaseMode === 'manual_teacher_release') {
    return Boolean(attempt.resultReleasedAt);
  }
  if (test.resultReleaseMode === 'scheduled_after_end') {
    const releaseIso = test.scheduledReleaseAt ?? test.endsAt;
    const releaseMs = new Date(releaseIso).getTime();
    return !Number.isNaN(releaseMs) && nowMs >= releaseMs;
  }
  return false;
}
