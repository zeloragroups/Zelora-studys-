import type {
  AbsenceNotification,
  AttendanceAuditEntry,
  AttendanceRecord,
  AttendanceSession,
} from '../../types';
import { LocalAcademicStore, sharedLocalAcademicStore } from './localAcademicStore';

const ATTENDANCE_STORAGE_KEY = 'tuition_ecosystem_dev_attendance_v1';

export interface AttendanceCounters {
  sessionSeq: number;
  recordSeq: number;
  auditSeq: number;
  notificationSeq: number;
}

interface PersistedAttendanceState {
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  auditEntries: AttendanceAuditEntry[];
  notifications: AbsenceNotification[];
  counters: AttendanceCounters;
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

export function formatAttendanceId(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export class LocalAttendanceStore {
  sessions: AttendanceSession[] = [];
  records: AttendanceRecord[] = [];
  auditEntries: AttendanceAuditEntry[] = [];
  notifications: AbsenceNotification[] = [];
  counters: AttendanceCounters = {
    sessionSeq: 1,
    recordSeq: 1,
    auditSeq: 1,
    notificationSeq: 1,
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

    if (!this.skipPersistence) {
      const storage = getSafeStorage();
      const raw = storage?.getItem(ATTENDANCE_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<PersistedAttendanceState>;
          if (
            Array.isArray(parsed.sessions) &&
            Array.isArray(parsed.records) &&
            Array.isArray(parsed.auditEntries) &&
            Array.isArray(parsed.notifications) &&
            parsed.counters
          ) {
            this.sessions = parsed.sessions;
            this.records = parsed.records;
            this.auditEntries = parsed.auditEntries;
            this.notifications = parsed.notifications;
            this.counters = parsed.counters;
            return;
          }
        } catch {
          storage?.removeItem(ATTENDANCE_STORAGE_KEY);
        }
      }
    }

    if (!isDev && !allowFixturesInTest) {
      return;
    }

    // Seed two realistic historical submitted sessions (DEMO DATA) so Admin, Teacher,
    // and Student STU-0001 dashboards show live data immediately without blocking today's date.
    const seededTs1 = '2026-11-10T17:15:00.000Z';
    const seededTs2 = '2026-11-12T17:15:00.000Z';

    this.sessions = [
      {
        id: 'ATT-0002',
        sessionDate: '2026-11-12',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        teacherId: 'TCH-0001',
        sessionType: 'regular',
        timetableEntryId: 'TT-0001',
        status: 'submitted',
        createdAt: seededTs2,
        submittedAt: seededTs2,
        updatedAt: seededTs2,
      },
      {
        id: 'ATT-0001',
        sessionDate: '2026-11-10',
        classId: 'CLS-0001',
        batchId: 'BAT-0001',
        subjectId: 'SUB-0001',
        teacherId: 'TCH-0001',
        sessionType: 'regular',
        timetableEntryId: 'TT-0001',
        status: 'submitted',
        createdAt: seededTs1,
        submittedAt: seededTs1,
        updatedAt: seededTs1,
      },
    ];

    this.records = [
      {
        id: 'AREC-0002',
        attendanceSessionId: 'ATT-0002',
        studentId: 'STU-0001',
        status: 'absent',
        markedBy: 'TCH-0001',
        markedAt: seededTs2,
        updatedAt: seededTs2,
      },
      {
        id: 'AREC-0001',
        attendanceSessionId: 'ATT-0001',
        studentId: 'STU-0001',
        status: 'present',
        markedBy: 'TCH-0001',
        markedAt: seededTs1,
        updatedAt: seededTs1,
      },
    ];

    this.auditEntries = [
      {
        id: 'AAUD-0002',
        attendanceSessionId: 'ATT-0002',
        action: 'session_submitted',
        newValue: 'Submitted 1 record (0 present, 1 absent, 0 late, 0 excused)',
        actorId: 'TCH-0001',
        timestamp: seededTs2,
        reason: 'Seeded historical regular class attendance (DEMO DATA)',
      },
      {
        id: 'AAUD-0001',
        attendanceSessionId: 'ATT-0001',
        action: 'session_submitted',
        newValue: 'Submitted 1 record (1 present, 0 absent, 0 late, 0 excused)',
        actorId: 'TCH-0001',
        timestamp: seededTs1,
        reason: 'Seeded historical regular class attendance (DEMO DATA)',
      },
    ];

    this.notifications = [
      {
        id: 'ANOT-0001',
        attendanceSessionId: 'ATT-0002',
        attendanceRecordId: 'AREC-0002',
        studentId: 'STU-0001',
        studentName: 'Aarav Patel',
        absenceDate: '2026-11-12',
        classId: 'CLS-0001',
        className: 'Class 10 — Foundation',
        batchId: 'BAT-0001',
        batchName: 'Morning Batch A',
        subjectId: 'SUB-0001',
        subjectName: 'Mathematics',
        attendanceType: 'regular',
        createdAt: seededTs2,
        readByStudent: false,
        readByAdmin: false,
        resolutionStatus: 'active_absence',
      },
    ];

    this.counters = {
      sessionSeq: 3,
      recordSeq: 3,
      auditSeq: 3,
      notificationSeq: 2,
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
    const payload: PersistedAttendanceState = {
      sessions: this.sessions,
      records: this.records,
      auditEntries: this.auditEntries,
      notifications: this.notifications,
      counters: this.counters,
    };
    storage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(payload));
  }
}

export const sharedLocalAttendanceStore = new LocalAttendanceStore();
