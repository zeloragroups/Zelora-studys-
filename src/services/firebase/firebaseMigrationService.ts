import { doc, getDoc, getDocs, collection, writeBatch } from 'firebase/firestore';
import { OperationType } from '../../lib/firebase/firestore';
import type { AuthPrincipal } from '../../types';
import {
  getActiveAdminUids,
  requireFirestoreDb,
  requireVerifiedActor,
  stripUndefinedFields,
  withFirestoreErrorHandling,
} from './helpers';

export const LOCAL_STORAGE_MIGRATION_KEYS = {
  accounts: 'tuition_ecosystem_dev_accounts_v1',
  academics: 'tuition_ecosystem_dev_academics_v1',
  attendance: 'tuition_ecosystem_dev_attendance_v1',
  homework: 'tuition_ecosystem_dev_homework_v1',
  tests: 'tuition_ecosystem_dev_tests_v1',
  examinations: 'tuition_ecosystem_dev_examinations_v1',
  finance: 'tuition_ecosystem_dev_finance_v1',
  settings: 'tuition_ecosystem_dev_app_settings_v1',
} as const;

const EXCLUDED_SESSION_KEYS = [
  'tuition_ecosystem_dev_session_v1',
  'tuition_ecosystem_dev_student_views_v1',
];

const SENSITIVE_OR_UNSUPPORTED_KEYS = new Set([
  'password',
  'initialPassword',
  'passwordHash',
  'credentialVerifier',
  'devSecretKey',
  'salt',
  'sessionToken',
  'refreshToken',
  'localStorageKey',
  'privateKey',
]);

const KNOWN_DEMO_ENTITY_IDS = new Set([
  'dev-uid-adm-0001',
  'dev-uid-tch-0001',
  'dev-uid-stu-0001',
  'dev-uid-stu-0099',
  'ADM-0001',
  'TCH-0001',
  'STU-0001',
  'STU-0099',
  'cls-10',
  'cls-12',
  'bat-10a',
  'bat-10b',
  'bat-12a',
  'CLS-0001',
  'CLS-0002',
  'BAT-0001',
  'BAT-0002',
  'BAT-0003',
  'SUB-0001',
  'SUB-0002',
  'SUB-0003',
  'SUB-0004',
  'ENR-0001',
  'ASG-0001',
  'TT-0001',
  'TT-0002',
  'ANN-0001',
  'ANN-0002',
  'ASESS-0001',
  'AREQ-0001',
  'HW-0001',
  'HSUB-0001',
  'TST-0001',
  'TATT-0001',
  'EXM-0001',
  'EMRK-0001',
  'FCFG-0001',
  'UPIC-0001',
  'FEE-0001',
  'PCLM-0001',
  'VPAY-0001',
  'REC-0001',
  'SCFG-0001',
  'SPER-0001',
  'SPAY-0001',
]);

export interface LocalRawSnapshot {
  accounts?: { accounts?: Record<string, unknown>[] };
  academics?: {
    classes?: Record<string, unknown>[];
    batches?: Record<string, unknown>[];
    subjects?: Record<string, unknown>[];
    enrolments?: Record<string, unknown>[];
    teacherAssignments?: Record<string, unknown>[];
    timetable?: Record<string, unknown>[];
    announcements?: Record<string, unknown>[];
  };
  attendance?: {
    sessions?: Record<string, unknown>[];
    records?: Record<string, unknown>[];
  };
  homework?: {
    homeworks?: Record<string, unknown>[];
    submissions?: Record<string, unknown>[];
  };
  tests?: {
    tests?: Record<string, unknown>[];
    attempts?: Record<string, unknown>[];
  };
  examinations?: {
    examinations?: Record<string, unknown>[];
    marks?: Record<string, unknown>[];
  };
  finance?: {
    feeConfigurations?: Record<string, unknown>[];
    upiConfigurations?: Record<string, unknown>[];
    studentFeeAccounts?: Record<string, unknown>[];
    paymentClaims?: Record<string, unknown>[];
    verifiedPayments?: Record<string, unknown>[];
    receipts?: Record<string, unknown>[];
    salaryConfigurations?: Record<string, unknown>[];
    salaryPeriods?: Record<string, unknown>[];
    salaryPayments?: Record<string, unknown>[];
  };
  settings?: {
    settings?: Record<string, unknown>;
  };
}

export interface MigrationCategoryPreview {
  category: string;
  firestoreCollection: string;
  totalFound: number;
  demoFixturesDetected: number;
  eligibleCustomCount: number;
  alreadyInFirestoreCount: number;
  requiresManualActionCount: number;
  notes?: string;
}

export interface MigrationPreviewReport {
  scannedAt: string;
  hasLocalData: boolean;
  detectedStorageKeys: string[];
  excludedSessionKeys: string[];
  categories: MigrationCategoryPreview[];
  totalRecordsFound: number;
  totalDemoFixtures: number;
  totalEligibleCustomRecords: number;
  totalDuplicatesInFirestore: number;
  totalManualReviewRecords: number;
  warnings: string[];
}

export interface MigrationExecutionOptions {
  includeDemoFixtures: boolean;
  confirmMigration: boolean;
}

export interface MigrationManualReviewItem {
  category: string;
  recordId: string;
  reason: string;
}

export interface MigrationExecutionReport {
  executedAt: string;
  migratedCount: number;
  skippedDuplicateCount: number;
  excludedDemoCount: number;
  failedCount: number;
  manualReviewCount: number;
  strippedFieldsCount: number;
  localDataPreserved: boolean;
  manualReviewItems: MigrationManualReviewItem[];
  errors: string[];
  recoveryNotes: string[];
}

export function isBuiltInDemoRecord(record: Record<string, unknown>): boolean {
  const candidateIds = [
    record.id,
    record.accountId,
    record.classId,
    record.batchId,
    record.subjectId,
    record.enrolmentId,
    record.assignmentId,
    record.entryId,
    record.announcementId,
  ]
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  if (candidateIds.some((id) => KNOWN_DEMO_ENTITY_IDS.has(id))) {
    return true;
  }

  const email = typeof record.email === 'string' ? record.email.toLowerCase() : '';
  if (email.endsWith('@centre-demo.example')) {
    return true;
  }

  const upiId = typeof record.upiId === 'string' ? record.upiId.toLowerCase() : '';
  if (upiId === 'sharma.tuition@okicici' || upiId.endsWith('@demo')) {
    return true;
  }

  return false;
}

export function stripCredentialFields(record: Record<string, unknown>): {
  sanitized: Record<string, unknown>;
  strippedKeys: string[];
} {
  const sanitized: Record<string, unknown> = {};
  const strippedKeys: string[] = [];

  for (const [k, v] of Object.entries(record)) {
    if (SENSITIVE_OR_UNSUPPORTED_KEYS.has(k)) {
      strippedKeys.push(k);
      continue;
    }
    sanitized[k] = v;
  }

  return { sanitized: stripUndefinedFields(sanitized), strippedKeys };
}

export function readLocalMigrationSnapshot(): {
  snapshot: LocalRawSnapshot;
  detectedKeys: string[];
} {
  if (typeof window === 'undefined') {
    return { snapshot: {}, detectedKeys: [] };
  }

  const snapshot: LocalRawSnapshot = {};
  const detectedKeys: string[] = [];

  for (const [section, key] of Object.entries(LOCAL_STORAGE_MIGRATION_KEYS)) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        detectedKeys.push(key);
        (snapshot as Record<string, unknown>)[section] = JSON.parse(raw);
      }
    } catch {
      // Skip malformed JSON safely
    }
  }

  return { snapshot, detectedKeys };
}

interface CandidateCollectionSpec {
  category: string;
  firestoreCollection: string;
  records: Record<string, unknown>[];
  resolveDocId: (rec: Record<string, unknown>) => string;
  requiresAuthMapping?: boolean;
  notes?: string;
}

function collectCandidateSpecs(snapshot: LocalRawSnapshot): CandidateCollectionSpec[] {
  const specs: CandidateCollectionSpec[] = [
    {
      category: 'Teacher & Student Accounts (Auth Provisioning Check)',
      firestoreCollection: 'users',
      records: (snapshot.accounts?.accounts ?? []).filter(
        (a) => a.role === 'teacher' || a.role === 'student'
      ),
      resolveDocId: (r) => String(r.accountId || r.id || ''),
      requiresAuthMapping: true,
      notes:
        'Local storage never stores plaintext passwords. Accounts must be created with fresh initial passwords in Firebase Auth (Admin Accounts -> Create Account) before enrolments/records can bind to their live UID.',
    },
    {
      category: 'Classes',
      firestoreCollection: 'classes',
      records: snapshot.academics?.classes ?? [],
      resolveDocId: (r) => String(r.classId || r.id || ''),
    },
    {
      category: 'Batches',
      firestoreCollection: 'batches',
      records: snapshot.academics?.batches ?? [],
      resolveDocId: (r) => String(r.batchId || r.id || ''),
    },
    {
      category: 'Subjects',
      firestoreCollection: 'subjects',
      records: snapshot.academics?.subjects ?? [],
      resolveDocId: (r) => String(r.subjectId || r.id || ''),
    },
    {
      category: 'Timetable Entries',
      firestoreCollection: 'timetableEntries',
      records: snapshot.academics?.timetable ?? [],
      resolveDocId: (r) => String(r.entryId || r.id || ''),
    },
    {
      category: 'Announcements',
      firestoreCollection: 'announcements',
      records: snapshot.academics?.announcements ?? [],
      resolveDocId: (r) => String(r.announcementId || r.id || ''),
    },
    {
      category: 'Fee Configurations',
      firestoreCollection: 'feeConfigurations',
      records: snapshot.finance?.feeConfigurations ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'UPI Configurations',
      firestoreCollection: 'upiConfigurations',
      records: snapshot.finance?.upiConfigurations ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Student Enrolments',
      firestoreCollection: 'enrolments',
      records: snapshot.academics?.enrolments ?? [],
      resolveDocId: (r) => String(r.enrolmentId || r.id || ''),
    },
    {
      category: 'Teacher Assignments',
      firestoreCollection: 'teacherAssignments',
      records: snapshot.academics?.teacherAssignments ?? [],
      resolveDocId: (r) => String(r.assignmentId || r.id || ''),
    },
    {
      category: 'Attendance Sessions',
      firestoreCollection: 'attendanceSessions',
      records: snapshot.attendance?.sessions ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Homework Assignments',
      firestoreCollection: 'homework',
      records: snapshot.homework?.homeworks ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Objective Tests',
      firestoreCollection: 'objectiveTests',
      records: snapshot.tests?.tests ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Examinations',
      firestoreCollection: 'examinations',
      records: snapshot.examinations?.examinations ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Student Fee Accounts',
      firestoreCollection: 'studentFeeAccounts',
      records: snapshot.finance?.studentFeeAccounts ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Payment Claims',
      firestoreCollection: 'paymentClaims',
      records: snapshot.finance?.paymentClaims ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Verified Payments',
      firestoreCollection: 'verifiedPayments',
      records: snapshot.finance?.verifiedPayments ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Fee Receipts',
      firestoreCollection: 'paymentReceipts',
      records: snapshot.finance?.receipts ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Teacher Salary Configurations',
      firestoreCollection: 'teacherSalaryConfigurations',
      records: snapshot.finance?.salaryConfigurations ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Teacher Salary Periods',
      firestoreCollection: 'teacherSalaryPeriods',
      records: snapshot.finance?.salaryPeriods ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
    {
      category: 'Teacher Salary Payments',
      firestoreCollection: 'teacherSalaryPayments',
      records: snapshot.finance?.salaryPayments ?? [],
      resolveDocId: (r) => String(r.id || ''),
    },
  ];

  if (snapshot.settings?.settings) {
    specs.push({
      category: 'Application Settings & Branding',
      firestoreCollection: 'applicationSettings',
      records: [snapshot.settings.settings],
      resolveDocId: () => 'APP-SETTINGS-001',
    });
  }

  return specs;
}

export function buildDryRunMigrationInventory(
  snapshot: LocalRawSnapshot,
  detectedKeys: string[],
  existingIdsByCollection: Record<string, Set<string>> = {}
): MigrationPreviewReport {
  const specs = collectCandidateSpecs(snapshot);
  const categories: MigrationCategoryPreview[] = [];

  let totalRecordsFound = 0;
  let totalDemoFixtures = 0;
  let totalEligibleCustomRecords = 0;
  let totalDuplicatesInFirestore = 0;
  let totalManualReviewRecords = 0;

  for (const spec of specs) {
    const existingSet = existingIdsByCollection[spec.firestoreCollection] ?? new Set<string>();
    let demoCount = 0;
    let customCount = 0;
    let dupCount = 0;
    let manualCount = 0;

    for (const rec of spec.records) {
      const id = spec.resolveDocId(rec);
      const isDemo = isBuiltInDemoRecord(rec);
      if (isDemo) demoCount++;
      else customCount++;

      if (spec.requiresAuthMapping) {
        if (!isDemo) manualCount++;
      } else if (id && existingSet.has(id)) {
        dupCount++;
      }
    }

    totalRecordsFound += spec.records.length;
    totalDemoFixtures += demoCount;
    if (!spec.requiresAuthMapping) {
      totalEligibleCustomRecords += customCount;
    }
    totalDuplicatesInFirestore += dupCount;
    totalManualReviewRecords += manualCount;

    if (spec.records.length > 0) {
      categories.push({
        category: spec.category,
        firestoreCollection: spec.firestoreCollection,
        totalFound: spec.records.length,
        demoFixturesDetected: demoCount,
        eligibleCustomCount: spec.requiresAuthMapping ? 0 : customCount,
        alreadyInFirestoreCount: dupCount,
        requiresManualActionCount: manualCount,
        notes: spec.notes,
      });
    }
  }

  const warnings: string[] = [];
  if (totalDemoFixtures > 0) {
    warnings.push(
      `Detected ${totalDemoFixtures} built-in sample/demo fixture record(s). By default, demo fixtures are EXCLUDED from production migration so test data does not pollute academy-0007.`
    );
  }
  if ((snapshot.accounts?.accounts?.length ?? 0) > 0) {
    warnings.push(
      'Teacher & Student local records contain no plaintext passwords and cannot mint Firebase Authentication credentials from browser storage. Non-demo accounts are flagged for manual Admin creation.'
    );
  }
  warnings.push(
    'Local browser data is NEVER automatically deleted during migration. Verify Firestore records first before manually clearing local dev caches.'
  );

  return {
    scannedAt: new Date().toISOString(),
    hasLocalData: totalRecordsFound > 0,
    detectedStorageKeys: detectedKeys,
    excludedSessionKeys: EXCLUDED_SESSION_KEYS,
    categories,
    totalRecordsFound,
    totalDemoFixtures,
    totalEligibleCustomRecords,
    totalDuplicatesInFirestore,
    totalManualReviewRecords,
    warnings,
  };
}

export class FirebaseMigrationService {
  private ensureAdmin(actor: AuthPrincipal | null): AuthPrincipal {
    return requireVerifiedActor(actor, ['admin']);
  }

  async previewLocalDataMigration(
    actor: AuthPrincipal | null,
    overrideSnapshot?: LocalRawSnapshot
  ): Promise<MigrationPreviewReport> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();

    const { snapshot, detectedKeys } = overrideSnapshot
      ? { snapshot: overrideSnapshot, detectedKeys: ['custom-snapshot'] }
      : readLocalMigrationSnapshot();

    const existingIdsByCollection: Record<string, Set<string>> = {};
    await withFirestoreErrorHandling(OperationType.LIST, 'migrationPreview', async () => {
      const collectionsToCheck = [
        'classes',
        'batches',
        'subjects',
        'enrolments',
        'teacherAssignments',
        'timetableEntries',
        'announcements',
        'feeConfigurations',
        'upiConfigurations',
        'studentFeeAccounts',
        'paymentClaims',
        'verifiedPayments',
        'paymentReceipts',
        'teacherSalaryConfigurations',
        'teacherSalaryPeriods',
        'teacherSalaryPayments',
      ];
      await Promise.all(
        collectionsToCheck.map(async (colName) => {
          const snap = await getDocs(collection(db, colName)).catch(() => null);
          existingIdsByCollection[colName] = new Set(snap ? snap.docs.map((d) => d.id) : []);
        })
      );
      const settingsSnap = await getDoc(doc(db, 'applicationSettings', 'APP-SETTINGS-001')).catch(
        () => null
      );
      existingIdsByCollection.applicationSettings = new Set(
        settingsSnap?.exists() ? ['APP-SETTINGS-001'] : []
      );
    });

    return buildDryRunMigrationInventory(snapshot, detectedKeys, existingIdsByCollection);
  }

  async executeLocalDataMigration(
    actor: AuthPrincipal | null,
    options: MigrationExecutionOptions,
    overrideSnapshot?: LocalRawSnapshot
  ): Promise<MigrationExecutionReport> {
    const admin = this.ensureAdmin(actor);
    if (!options.confirmMigration) {
      throw new Error('Explicit administrator confirmation is required before writing to Firestore.');
    }

    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);

    const { snapshot } = overrideSnapshot
      ? { snapshot: overrideSnapshot }
      : readLocalMigrationSnapshot();

    // Load live UID lookup maps from Firestore users so migrated records reference valid Auth UIDs
    const usersSnap = await getDocs(collection(db, 'users'));
    const uidByAccountId = new Map<string, string>();
    for (const d of usersSnap.docs) {
      const accId = String(d.data().accountId || '').toUpperCase();
      if (accId) uidByAccountId.set(accId, d.id);
    }

    const specs = collectCandidateSpecs(snapshot);
    let migratedCount = 0;
    let skippedDuplicateCount = 0;
    let excludedDemoCount = 0;
    let failedCount = 0;
    let strippedFieldsCount = 0;
    const manualReviewItems: MigrationManualReviewItem[] = [];
    const errors: string[] = [];

    const pendingWrites: Array<{ collection: string; id: string; data: Record<string, unknown> }> =
      [];

    for (const spec of specs) {
      const existingSnap = await getDocs(collection(db, spec.firestoreCollection)).catch(() => null);
      const existingIds = new Set(existingSnap ? existingSnap.docs.map((d) => d.id) : []);

      for (const rawRecord of spec.records) {
        const docId = spec.resolveDocId(rawRecord);
        if (!docId) {
          failedCount++;
          errors.push(`${spec.category}: Missing deterministic document ID.`);
          continue;
        }

        const isDemo = isBuiltInDemoRecord(rawRecord);
        if (isDemo && !options.includeDemoFixtures) {
          excludedDemoCount++;
          continue;
        }

        if (spec.requiresAuthMapping) {
          const accId = String(rawRecord.accountId || docId).toUpperCase();
          if (uidByAccountId.has(accId)) {
            skippedDuplicateCount++;
          } else {
            manualReviewItems.push({
              category: spec.category,
              recordId: accId,
              reason:
                'No Firebase Authentication user exists for this Account ID yet. Provision via Admin -> Accounts with a fresh initial password.',
            });
          }
          continue;
        }

        if (existingIds.has(docId)) {
          skippedDuplicateCount++;
          continue;
        }

        const { sanitized, strippedKeys } = stripCredentialFields(rawRecord);
        strippedFieldsCount += strippedKeys.length;

        // Bind live Firebase UIDs where required by Firestore Security Rules
        const studentAccId =
          typeof sanitized.studentAccountId === 'string'
            ? sanitized.studentAccountId.toUpperCase()
            : typeof sanitized.studentId === 'string'
              ? sanitized.studentId.toUpperCase()
              : '';
        if (studentAccId) {
          const resolvedUid = uidByAccountId.get(studentAccId);
          if (!resolvedUid) {
            manualReviewItems.push({
              category: spec.category,
              recordId: docId,
              reason: `References student "${studentAccId}" who has not been provisioned in Firebase Authentication yet.`,
            });
            continue;
          }
          sanitized.studentUid = resolvedUid;
        }

        const teacherAccId =
          typeof sanitized.teacherAccountId === 'string'
            ? sanitized.teacherAccountId.toUpperCase()
            : typeof sanitized.teacherId === 'string'
              ? sanitized.teacherId.toUpperCase()
              : '';
        if (teacherAccId) {
          const resolvedUid = uidByAccountId.get(teacherAccId);
          if (!resolvedUid) {
            manualReviewItems.push({
              category: spec.category,
              recordId: docId,
              reason: `References teacher "${teacherAccId}" who has not been provisioned in Firebase Authentication yet.`,
            });
            continue;
          }
          sanitized.teacherUid = resolvedUid;
        }

        if (spec.firestoreCollection === 'applicationSettings') {
          sanitized.id = 'APP-SETTINGS-001';
          sanitized.environmentMode = 'firebase_connected';
          sanitized.updatedBy = admin.loginId;
          const branding = sanitized.applicationBranding as
            | { logoConfiguration?: { mode?: string; dataUrl?: string; storageNotice?: string } }
            | undefined;
          if (branding?.logoConfiguration?.dataUrl) {
            // Do not push large local-only base64 blobs blindly into Firestore settings doc
            delete branding.logoConfiguration.dataUrl;
            branding.logoConfiguration.mode = 'default_icon';
            branding.logoConfiguration.storageNotice =
              'Local base64 logo excluded during migration. Re-upload logo in Branding Settings to store in Firebase Storage.';
            strippedFieldsCount++;
          }
        } else {
          if (!sanitized.id) sanitized.id = docId;
          const needsAdminUids = [
            'enrolments',
            'teacherAssignments',
            'announcements',
            'attendanceSessions',
            'homework',
            'objectiveTests',
            'examinations',
            'feeConfigurations',
            'upiConfigurations',
            'studentFeeAccounts',
            'paymentClaims',
            'verifiedPayments',
            'paymentReceipts',
            'teacherSalaryConfigurations',
            'teacherSalaryPeriods',
            'teacherSalaryPayments',
          ].includes(spec.firestoreCollection);
          if (needsAdminUids) {
            sanitized.adminUids = adminUids;
          }
        }

        pendingWrites.push({
          collection: spec.firestoreCollection,
          id: docId,
          data: stripUndefinedFields(sanitized),
        });
        existingIds.add(docId);
      }
    }

    // Write in bounded batches of up to 400 documents
    const CHUNK_SIZE = 400;
    for (let i = 0; i < pendingWrites.length; i += CHUNK_SIZE) {
      const chunk = pendingWrites.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        batch.set(doc(db, item.collection, item.id), item.data);
      }
      try {
        await batch.commit();
        migratedCount += chunk.length;
      } catch (err) {
        failedCount += chunk.length;
        errors.push(
          `Batch ${Math.floor(i / CHUNK_SIZE) + 1} failed: ${err instanceof Error ? err.message : 'Unknown Firestore write error'}`
        );
      }
    }

    return {
      executedAt: new Date().toISOString(),
      migratedCount,
      skippedDuplicateCount,
      excludedDemoCount,
      failedCount,
      manualReviewCount: manualReviewItems.length,
      strippedFieldsCount,
      localDataPreserved: true,
      manualReviewItems,
      errors,
      recoveryNotes: [
        'Local browser storage keys were preserved untouched for recovery.',
        'To re-run after provisioning missing Teacher/Student Firebase Auth accounts, simply run Preview & Migrate again; already-migrated documents will be skipped idempotently.',
      ],
    };
  }

  clearLocalDemoCacheExplicitly(): string[] {
    if (typeof window === 'undefined') return [];
    const removed: string[] = [];
    for (const key of [
      ...Object.values(LOCAL_STORAGE_MIGRATION_KEYS),
      ...EXCLUDED_SESSION_KEYS,
    ]) {
      if (window.localStorage.getItem(key) !== null) {
        window.localStorage.removeItem(key);
        removed.push(key);
      }
    }
    return removed;
  }
}

export const firebaseMigrationService = new FirebaseMigrationService();
