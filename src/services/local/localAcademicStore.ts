import type {
  AnnouncementRecord,
  BatchRecord,
  ClassRecord,
  StudentEnrolment,
  SubjectRecord,
  TeacherAssignment,
  TimetableEntry,
} from '../../types';
import { LocalAccountStore, sharedLocalAccountStore } from './localAccountStore';

const ACADEMIC_STORAGE_KEY = 'tuition_ecosystem_dev_academics_v1';

export interface AcademicCounters {
  classSeq: number;
  batchSeq: number;
  subjectSeq: number;
  enrolmentSeq: number;
  assignmentSeq: number;
  timetableSeq: number;
  announcementSeq: number;
}

interface PersistedAcademicState {
  classes: ClassRecord[];
  batches: BatchRecord[];
  subjects: SubjectRecord[];
  enrolments: StudentEnrolment[];
  assignments: TeacherAssignment[];
  timetable: TimetableEntry[];
  announcements: AnnouncementRecord[];
  counters: AcademicCounters;
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

export function formatAcademicId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export class LocalAcademicStore {
  classes: ClassRecord[] = [];
  batches: BatchRecord[] = [];
  subjects: SubjectRecord[] = [];
  enrolments: StudentEnrolment[] = [];
  assignments: TeacherAssignment[] = [];
  timetable: TimetableEntry[] = [];
  announcements: AnnouncementRecord[] = [];
  counters: AcademicCounters = {
    classSeq: 1,
    batchSeq: 1,
    subjectSeq: 1,
    enrolmentSeq: 1,
    assignmentSeq: 1,
    timetableSeq: 1,
    announcementSeq: 1,
  };

  readonly accountStore: LocalAccountStore;
  private readonly skipPersistence: boolean;

  constructor(options?: {
    accountStore?: LocalAccountStore;
    allowFixturesInTest?: boolean;
    skipPersistence?: boolean;
  }) {
    this.accountStore = options?.accountStore ?? sharedLocalAccountStore;
    this.skipPersistence = Boolean(options?.skipPersistence);
    this.initialize(Boolean(options?.allowFixturesInTest));
  }

  private initialize(allowFixturesInTest: boolean): void {
    const isDev = Boolean(import.meta.env?.DEV);

    if (!this.skipPersistence) {
      const storage = getSafeStorage();
      const raw = storage?.getItem(ACADEMIC_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<PersistedAcademicState>;
          if (
            Array.isArray(parsed.classes) &&
            Array.isArray(parsed.batches) &&
            Array.isArray(parsed.subjects) &&
            Array.isArray(parsed.enrolments) &&
            Array.isArray(parsed.assignments) &&
            Array.isArray(parsed.timetable) &&
            Array.isArray(parsed.announcements) &&
            parsed.counters
          ) {
            this.classes = parsed.classes;
            this.batches = parsed.batches;
            this.subjects = parsed.subjects;
            this.enrolments = parsed.enrolments;
            this.assignments = parsed.assignments;
            this.timetable = parsed.timetable;
            this.announcements = parsed.announcements;
            this.counters = parsed.counters;
            return;
          }
        } catch {
          storage?.removeItem(ACADEMIC_STORAGE_KEY);
        }
      }
    }

    if (!isDev && !allowFixturesInTest) {
      return;
    }

    const seededAt = '2026-10-15T09:00:00.000Z';

    this.classes = [
      {
        id: 'dev-cls-0001',
        classId: 'CLS-0001',
        name: 'Class 10 — Foundation',
        description: 'Core board and foundation preparation batch',
        status: 'active',
        createdAt: seededAt,
      },
      {
        id: 'dev-cls-0002',
        classId: 'CLS-0002',
        name: 'Class 12 — Science',
        description: 'Senior secondary science stream',
        status: 'active',
        createdAt: seededAt,
      },
    ];

    this.batches = [
      {
        id: 'dev-bat-0001',
        batchId: 'BAT-0001',
        name: 'Morning Batch A',
        classId: 'CLS-0001',
        description: '07:00–09:00 / Afternoon slot',
        status: 'active',
        createdAt: seededAt,
      },
      {
        id: 'dev-bat-0002',
        batchId: 'BAT-0002',
        name: 'Evening Batch B',
        classId: 'CLS-0001',
        status: 'active',
        createdAt: seededAt,
      },
      {
        id: 'dev-bat-0003',
        batchId: 'BAT-0003',
        name: 'Physics & Math Honours',
        classId: 'CLS-0002',
        status: 'active',
        createdAt: seededAt,
      },
    ];

    this.subjects = [
      {
        id: 'dev-sub-0001',
        subjectId: 'SUB-0001',
        name: 'Mathematics',
        code: 'MTH-10',
        classIds: ['CLS-0001'],
        status: 'active',
        createdAt: seededAt,
      },
      {
        id: 'dev-sub-0002',
        subjectId: 'SUB-0002',
        name: 'Chemistry',
        code: 'CHM-10',
        classIds: ['CLS-0001', 'CLS-0002'],
        status: 'active',
        createdAt: seededAt,
      },
      {
        id: 'dev-sub-0003',
        subjectId: 'SUB-0003',
        name: 'Physics',
        code: 'PHY-12',
        classIds: ['CLS-0002'],
        status: 'active',
        createdAt: seededAt,
      },
    ];

    this.enrolments = [
      {
        id: 'dev-enr-0001',
        enrolmentId: 'ENR-0001',
        studentAccountId: 'STU-0001',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        enrolmentDate: '2026-10-15',
        status: 'active',
        createdAt: seededAt,
      },
    ];

    this.assignments = [
      {
        id: 'dev-asg-0001',
        assignmentId: 'ASG-0001',
        teacherAccountId: 'TCH-0001',
        subjectId: 'SUB-0001',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        status: 'active',
        createdAt: seededAt,
      },
    ];

    this.timetable = [
      {
        id: 'dev-tt-0001',
        entryId: 'TT-0001',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        teacherAccountId: 'TCH-0001',
        dayOfWeek: 'Monday',
        startTime: '16:00',
        endTime: '17:15',
        room: 'Room 201',
        status: 'active',
        createdAt: seededAt,
      },
    ];

    this.announcements = [
      {
        id: 'dev-ann-0001',
        announcementId: 'ANN-0001',
        title: 'Academic Term Orientation Notice',
        content:
          'Welcome to the 2026–2027 academic session. Please check your batch timetable for updated classroom timings.',
        audience: 'all',
        publicationStatus: 'published',
        publishedByAdminId: 'ADM-0001',
        createdAt: seededAt,
        publishedAt: seededAt,
      },
    ];

    this.counters = {
      classSeq: 3,
      batchSeq: 4,
      subjectSeq: 4,
      enrolmentSeq: 2,
      assignmentSeq: 2,
      timetableSeq: 2,
      announcementSeq: 2,
    };
  }

  save(): void {
    if (this.skipPersistence) {
      return;
    }
    const storage = getSafeStorage();
    if (!storage) {
      return;
    }
    const payload: PersistedAcademicState = {
      classes: this.classes,
      batches: this.batches,
      subjects: this.subjects,
      enrolments: this.enrolments,
      assignments: this.assignments,
      timetable: this.timetable,
      announcements: this.announcements,
      counters: this.counters,
    };
    storage.setItem(ACADEMIC_STORAGE_KEY, JSON.stringify(payload));
  }
}

export const sharedLocalAcademicStore = new LocalAcademicStore();
