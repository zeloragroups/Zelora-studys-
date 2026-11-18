import type {
  AssessmentNotification,
  ExaminationMarks,
  ExaminationRecord,
  HomeworkRecord,
  HomeworkReviewAudit,
  HomeworkSubmission,
  MarksAuditEntry,
  ObjectiveTest,
  TestAttempt,
} from '../../types';
import { LocalAcademicStore, sharedLocalAcademicStore } from './localAcademicStore';

const HOMEWORK_STORAGE_KEY = 'tuition_ecosystem_dev_homework_v1';
const TESTS_STORAGE_KEY = 'tuition_ecosystem_dev_tests_v1';
const EXAMINATIONS_STORAGE_KEY = 'tuition_ecosystem_dev_examinations_v1';

export interface HomeworkCounters {
  homeworkSeq: number;
  submissionSeq: number;
  auditSeq: number;
  notificationSeq: number;
}

export interface TestCounters {
  testSeq: number;
  questionSeq: number;
  attemptSeq: number;
}

export interface ExaminationCounters {
  examinationSeq: number;
  marksSeq: number;
  auditSeq: number;
}

interface PersistedHomeworkState {
  homeworks: HomeworkRecord[];
  submissions: HomeworkSubmission[];
  auditEntries: HomeworkReviewAudit[];
  notifications: AssessmentNotification[];
  counters: HomeworkCounters;
}

interface PersistedTestsState {
  tests: ObjectiveTest[];
  attempts: TestAttempt[];
  counters: TestCounters;
}

interface PersistedExaminationsState {
  examinations: ExaminationRecord[];
  marks: ExaminationMarks[];
  auditEntries: MarksAuditEntry[];
  counters: ExaminationCounters;
}

function getSafeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function formatAssessmentId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export class LocalAssessmentStores {
  homeworks: HomeworkRecord[] = [];
  submissions: HomeworkSubmission[] = [];
  homeworkAuditEntries: HomeworkReviewAudit[] = [];
  notifications: AssessmentNotification[] = [];
  homeworkCounters: HomeworkCounters = {
    homeworkSeq: 1,
    submissionSeq: 1,
    auditSeq: 1,
    notificationSeq: 1,
  };

  tests: ObjectiveTest[] = [];
  attempts: TestAttempt[] = [];
  testCounters: TestCounters = {
    testSeq: 1,
    questionSeq: 1,
    attemptSeq: 1,
  };

  examinations: ExaminationRecord[] = [];
  examinationMarks: ExaminationMarks[] = [];
  marksAuditEntries: MarksAuditEntry[] = [];
  examinationCounters: ExaminationCounters = {
    examinationSeq: 1,
    marksSeq: 1,
    auditSeq: 1,
  };

  readonly academicStore: LocalAcademicStore;
  private readonly skipPersistence: boolean;

  constructor(options?: {
    academicStore?: LocalAcademicStore;
    allowFixturesInTest?: boolean;
    skipPersistence?: boolean;
  }) {
    this.academicStore = options?.academicStore ?? sharedLocalAcademicStore;
    this.skipPersistence = Boolean(options?.skipPersistence);
    this.initialize(Boolean(options?.allowFixturesInTest));
  }

  private initialize(allowFixturesInTest: boolean): void {
    const isDev = Boolean(import.meta.env?.DEV);

    let loadedHw = false;
    let loadedTests = false;
    let loadedExams = false;

    if (!this.skipPersistence) {
      const storage = getSafeStorage();
      const rawHw = storage?.getItem(HOMEWORK_STORAGE_KEY);
      if (rawHw) {
        try {
          const parsed = JSON.parse(rawHw) as Partial<PersistedHomeworkState>;
          if (
            Array.isArray(parsed.homeworks) &&
            Array.isArray(parsed.submissions) &&
            Array.isArray(parsed.auditEntries) &&
            Array.isArray(parsed.notifications) &&
            parsed.counters
          ) {
            this.homeworks = parsed.homeworks;
            this.submissions = parsed.submissions;
            this.homeworkAuditEntries = parsed.auditEntries;
            this.notifications = parsed.notifications;
            this.homeworkCounters = parsed.counters;
            loadedHw = true;
          }
        } catch {
          storage?.removeItem(HOMEWORK_STORAGE_KEY);
        }
      }

      const rawTests = storage?.getItem(TESTS_STORAGE_KEY);
      if (rawTests) {
        try {
          const parsed = JSON.parse(rawTests) as Partial<PersistedTestsState>;
          if (Array.isArray(parsed.tests) && Array.isArray(parsed.attempts) && parsed.counters) {
            this.tests = parsed.tests;
            this.attempts = parsed.attempts;
            this.testCounters = parsed.counters;
            loadedTests = true;
          }
        } catch {
          storage?.removeItem(TESTS_STORAGE_KEY);
        }
      }

      const rawExams = storage?.getItem(EXAMINATIONS_STORAGE_KEY);
      if (rawExams) {
        try {
          const parsed = JSON.parse(rawExams) as Partial<PersistedExaminationsState>;
          if (
            Array.isArray(parsed.examinations) &&
            Array.isArray(parsed.marks) &&
            Array.isArray(parsed.auditEntries) &&
            parsed.counters
          ) {
            this.examinations = parsed.examinations;
            this.examinationMarks = parsed.marks;
            this.marksAuditEntries = parsed.auditEntries;
            this.examinationCounters = parsed.counters;
            loadedExams = true;
          }
        } catch {
          storage?.removeItem(EXAMINATIONS_STORAGE_KEY);
        }
      }
    }

    if (!isDev && !allowFixturesInTest) {
      return;
    }

    const seededAt = '2026-11-15T10:00:00.000Z';

    if (!loadedHw) {
      this.homeworks = [
        {
          id: 'HW-0001',
          title: 'Quadratic Equations — Factorization Practice (DEMO DATA)',
          instructions:
            'Solve questions 1 to 8 from Chapter 4 using splitting-the-middle-term and quadratic formula methods. Write concise intermediate steps in your response.',
          classId: 'CLS-0001',
          batchId: 'BAT-0001',
          subjectId: 'SUB-0001',
          teacherId: 'TCH-0001',
          assignedAt: seededAt,
          dueAt: '2026-11-25T23:59:00.000Z',
          maximumMarks: 20,
          status: 'published',
          createdAt: seededAt,
          updatedAt: seededAt,
        },
      ];
      this.submissions = [];
      this.homeworkAuditEntries = [];
      this.notifications = [
        {
          id: 'ANF-0001',
          recipientStudentId: 'STU-0001',
          type: 'homework_published',
          relatedRecordId: 'HW-0001',
          title: 'New Homework: Quadratic Equations — Factorization Practice',
          message: 'Mathematics (Morning Batch A) due 25 Nov 2026. [DEMO DATA]',
          createdAt: seededAt,
          dedupeKey: 'homework_published:HW-0001:STU-0001',
        },
      ];
      this.homeworkCounters = {
        homeworkSeq: 2,
        submissionSeq: 1,
        auditSeq: 1,
        notificationSeq: 2,
      };
    }

    if (!loadedTests) {
      this.tests = [
        {
          id: 'TST-0001',
          title: 'Linear & Quadratic Equations Checkpoint (DEMO DATA)',
          instructions:
            'Read each multiple-choice question carefully. Each question carries configured marks with zero negative marking.',
          classId: 'CLS-0001',
          batchId: 'BAT-0001',
          subjectId: 'SUB-0001',
          teacherId: 'TCH-0001',
          questions: [
            {
              id: 'Q-0001',
              questionText: 'What is the discriminant Δ of ax² + bx + c = 0 (a ≠ 0)?',
              options: [
                { id: 'OPT-1', text: 'b² - 4ac' },
                { id: 'OPT-2', text: 'b² + 4ac' },
                { id: 'OPT-3', text: '4ac - b²' },
                { id: 'OPT-4', text: '2a - b' },
              ],
              correctOptionId: 'OPT-1',
              marks: 4,
              explanation: 'The standard quadratic discriminant is b² - 4ac.',
            },
            {
              id: 'Q-0002',
              questionText: 'If x - 3 = 7, what is the value of 2x?',
              options: [
                { id: 'OPT-1', text: '10' },
                { id: 'OPT-2', text: '14' },
                { id: 'OPT-3', text: '20' },
                { id: 'OPT-4', text: '8' },
              ],
              correctOptionId: 'OPT-3',
              marks: 3,
              explanation: 'x = 10, so 2x = 20.',
            },
            {
              id: 'Q-0003',
              questionText: 'How many real roots does x² + 1 = 0 have?',
              options: [
                { id: 'OPT-1', text: 'Two distinct real roots' },
                { id: 'OPT-2', text: 'One repeated real root' },
                { id: 'OPT-3', text: 'Zero real roots' },
              ],
              correctOptionId: 'OPT-3',
              marks: 3,
              explanation: 'Since Δ = -4 < 0, there are zero real roots.',
            },
          ],
          totalMarks: 10,
          durationMinutes: 15,
          startsAt: '2026-11-10T00:00:00.000Z',
          endsAt: '2026-12-31T23:59:00.000Z',
          maximumAttempts: 2,
          resultReleaseMode: 'auto_after_submission',
          showCorrectAnswersOnRelease: true,
          status: 'published',
          createdAt: seededAt,
          updatedAt: seededAt,
        },
      ];
      this.attempts = [];
      this.testCounters = {
        testSeq: 2,
        questionSeq: 4,
        attemptSeq: 1,
      };
    }

    if (!loadedExams) {
      this.examinations = [
        {
          id: 'EXM-0001',
          title: 'Term 1 Mathematics Written Assessment (DEMO DATA)',
          classId: 'CLS-0001',
          batchId: 'BAT-0001',
          subjectId: 'SUB-0001',
          teacherId: 'TCH-0001',
          examDate: '2026-11-28',
          startsAt: '10:00',
          endsAt: '11:30',
          maximumMarks: 50,
          passingMarks: 20,
          instructions:
            'Report 15 minutes before the scheduled start time. All questions are compulsory; show complete working.',
          status: 'published',
          resultsReleased: false,
          createdAt: seededAt,
          updatedAt: seededAt,
        },
      ];
      this.examinationMarks = [];
      this.marksAuditEntries = [];
      this.examinationCounters = {
        examinationSeq: 2,
        marksSeq: 1,
        auditSeq: 1,
      };
    }
  }

  saveHomework(): void {
    if (this.skipPersistence) return;
    const storage = getSafeStorage();
    if (!storage) return;
    const payload: PersistedHomeworkState = {
      homeworks: this.homeworks,
      submissions: this.submissions,
      auditEntries: this.homeworkAuditEntries,
      notifications: this.notifications,
      counters: this.homeworkCounters,
    };
    storage.setItem(HOMEWORK_STORAGE_KEY, JSON.stringify(payload));
  }

  saveTests(): void {
    if (this.skipPersistence) return;
    const storage = getSafeStorage();
    if (!storage) return;
    const payload: PersistedTestsState = {
      tests: this.tests,
      attempts: this.attempts,
      counters: this.testCounters,
    };
    storage.setItem(TESTS_STORAGE_KEY, JSON.stringify(payload));
  }

  saveExaminations(): void {
    if (this.skipPersistence) return;
    const storage = getSafeStorage();
    if (!storage) return;
    const payload: PersistedExaminationsState = {
      examinations: this.examinations,
      marks: this.examinationMarks,
      auditEntries: this.marksAuditEntries,
      counters: this.examinationCounters,
    };
    storage.setItem(EXAMINATIONS_STORAGE_KEY, JSON.stringify(payload));
  }
}

export const sharedLocalAssessmentStores = new LocalAssessmentStores();
