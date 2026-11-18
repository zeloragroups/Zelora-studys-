import type { AccountRecord, AuthPrincipal, DemoClassOption } from '../../types';

/**
 * DEVELOPMENT-ONLY FIXTURES
 *
 * Strictly isolated from production builds via `import.meta.env?.DEV` guard
 * (or explicit unit-test injection). Never import or expose in production UI.
 */

export interface DevCredentialSeed {
  principal: AuthPrincipal;
  /** Development-only initial secret; never stored in AccountRecord or UI state */
  devSecretKey: string;
}

export const DEMO_CLASS_OPTIONS: readonly DemoClassOption[] = [
  {
    id: 'cls-10',
    name: 'Class 10 — Foundation',
    batches: [
      { id: 'bat-10a', name: 'Morning Batch A' },
      { id: 'bat-10b', name: 'Evening Batch B' },
    ],
  },
  {
    id: 'cls-12',
    name: 'Class 12 — Science',
    batches: [{ id: 'bat-12a', name: 'Physics & Math Honours' }],
  },
];

export const DEV_ADMIN_SEED: DevCredentialSeed = {
  principal: {
    uid: 'dev-uid-adm-0001',
    loginId: 'ADM-0001',
    role: 'admin',
    fullName: 'Centre Director',
    status: 'active',
  },
  devSecretKey: 'Admin@2026',
};

export interface DevManagedAccountSeed {
  account: AccountRecord;
  devSecretKey: string;
}

export function loadDevManagedAccountSeeds(allowInTest = false): readonly DevManagedAccountSeed[] {
  const isDev = Boolean(import.meta.env?.DEV);
  if (!isDev && !allowInTest) {
    return [];
  }

  return [
    {
      account: {
        id: 'dev-uid-tch-0001',
        accountId: 'TCH-0001',
        role: 'teacher',
        name: 'Priya Nair',
        phone: '+91 98201 44120',
        email: 'priya.nair@centre-demo.example',
        status: 'active',
        createdAt: '2026-10-12T09:00:00.000Z',
        updatedAt: '2026-11-01T10:15:00.000Z',
      },
      devSecretKey: 'Teacher@2026',
    },
    {
      account: {
        id: 'dev-uid-stu-0001',
        accountId: 'STU-0001',
        role: 'student',
        name: 'Aarav Mehta',
        phone: '+91 98190 55210',
        email: 'aarav.family@centre-demo.example',
        status: 'active',
        classId: 'cls-10',
        className: 'Class 10 — Foundation',
        batchId: 'bat-10a',
        batchName: 'Morning Batch A',
        createdAt: '2026-10-14T11:30:00.000Z',
      },
      devSecretKey: 'Student@2026',
    },
    {
      account: {
        id: 'dev-uid-stu-0099',
        accountId: 'STU-0099',
        role: 'student',
        name: 'Inactive Demo Account',
        phone: '+91 98000 00099',
        status: 'deactivated',
        classId: 'cls-10',
        className: 'Class 10 — Foundation',
        batchId: 'bat-10b',
        batchName: 'Evening Batch B',
        createdAt: '2026-10-18T14:20:00.000Z',
        updatedAt: '2026-11-05T16:00:00.000Z',
      },
      devSecretKey: 'Student@2026',
    },
  ];
}

export function loadDevAdminSeed(allowInTest = false): DevCredentialSeed | null {
  const isDev = Boolean(import.meta.env?.DEV);
  if (!isDev && !allowInTest) {
    return null;
  }
  return DEV_ADMIN_SEED;
}
