import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getApps } from 'firebase/app';
import { getFirebaseApp } from '../src/lib/firebase/app';
import { getFirebaseAuth } from '../src/lib/firebase/auth';
import {
  deriveInternalAuthEmail,
  EXPECTED_FIREBASE_PROJECT_ID,
  EXPECTED_FIRESTORE_DATABASE_ID,
  isCloudFunctionsEnabled,
  validateAndResolveFirebaseConfig,
} from '../src/lib/firebase/config';
import { getFirestoreDb } from '../src/lib/firebase/firestore';
import {
  FirebaseConfigurationError,
  resolveServiceRegistry,
} from '../src/services';
import {
  buildDryRunMigrationInventory,
  isBuiltInDemoRecord,
  stripCredentialFields,
  type LocalRawSnapshot,
} from '../src/services/firebase/firebaseMigrationService';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../src/services/firebase/helpers';

function runConfigAndRegistryTests() {
  // 1. Default applet config resolves to FIREBASE_CONNECTED for academy-0007 with authoritative fields
  const resolved = validateAndResolveFirebaseConfig();
  assert.equal(resolved.valid, true, 'Default Firebase config must be valid');
  assert.equal(resolved.mode, 'FIREBASE_CONNECTED');
  assert.equal(resolved.config?.projectId, EXPECTED_FIREBASE_PROJECT_ID);
  assert.equal(resolved.config?.projectId, 'academy-0007');
  assert.equal(resolved.config?.apiKey, 'AIzaSyAAt6XAwe3W3FPPe19h3ECuJNW2-A4uPxM');
  assert.equal(resolved.config?.authDomain, 'academy-0007.firebaseapp.com');
  assert.equal(resolved.config?.storageBucket, 'academy-0007.firebasestorage.app');
  assert.equal(resolved.config?.messagingSenderId, '123258533376');
  assert.equal(resolved.config?.appId, '1:123258533376:web:7995a1487a239015b44ae5');
  assert.equal(resolved.config?.firestoreDatabaseId, EXPECTED_FIRESTORE_DATABASE_ID);

  // 1b. Truncated VITE_FIREBASE_API_KEY and mismatched VITE_FIREBASE_FIRESTORE_DATABASE_ID
  // must NOT silently override authoritative academy-0007 config
  const overridden = validateAndResolveFirebaseConfig({
    VITE_FIREBASE_API_KEY: 'AIzaSyAAt6XAwe3W3FPPe19h3ECuJNW2',
    VITE_FIREBASE_FIRESTORE_DATABASE_ID: 'academy',
  });
  assert.equal(overridden.valid, true);
  assert.equal(overridden.mode, 'FIREBASE_CONNECTED');
  assert.equal(overridden.config?.apiKey, 'AIzaSyAAt6XAwe3W3FPPe19h3ECuJNW2-A4uPxM');
  assert.equal(overridden.config?.firestoreDatabaseId, EXPECTED_FIRESTORE_DATABASE_ID);
  assert.ok(overridden.warnings.length >= 2, 'Warnings should record rejected invalid env overrides');

  // 1c. Project mismatch must trigger FIREBASE_CONFIGURATION_ERROR (never silent LOCAL_DEMO fallback)
  const mismatchedProject = validateAndResolveFirebaseConfig({
    VITE_FIREBASE_PROJECT_ID: 'wrong-project',
  });
  assert.equal(mismatchedProject.valid, false);
  assert.equal(mismatchedProject.mode, 'FIREBASE_CONFIGURATION_ERROR');
  assert.equal(mismatchedProject.config, null);

  // 1d. Centralized singleton Firebase SDK initialization (App, Auth, Firestore)
  const app1 = getFirebaseApp();
  const app2 = getFirebaseApp();
  assert.ok(app1, 'getFirebaseApp() must return an initialized FirebaseApp');
  assert.equal(app1, app2, 'getFirebaseApp() must reuse single FirebaseApp instance');
  assert.equal(getApps().length, 1, 'Exactly one FirebaseApp instance may be initialized');
  assert.equal(app1.options.apiKey, 'AIzaSyAAt6XAwe3W3FPPe19h3ECuJNW2-A4uPxM');
  assert.equal(app1.options.projectId, 'academy-0007');
  assert.equal(app1.options.authDomain, 'academy-0007.firebaseapp.com');
  assert.ok(getFirebaseAuth(), 'getFirebaseAuth() must return Firebase Auth instance');
  assert.ok(getFirestoreDb(), 'getFirestoreDb() must return named Firestore instance');

  // 2. Deterministic internal auth email derivation (ID + password flow without user emails)
  assert.equal(deriveInternalAuthEmail('ADM-0001'), 'adm-0001@auth.academy-0007.internal');
  assert.equal(deriveInternalAuthEmail(' tch-0014 '), 'tch-0014@auth.academy-0007.internal');
  assert.equal(deriveInternalAuthEmail('STU-0102'), 'stu-0102@auth.academy-0007.internal');

  // 3. Explicit FIREBASE_CONFIGURATION_ERROR never falls back silently to LOCAL_DEMO
  const brokenRegistry = resolveServiceRegistry({
    valid: false,
    mode: 'FIREBASE_CONFIGURATION_ERROR',
    config: null,
    errors: ['Firebase project mismatch: expected "academy-0007", received "wrong-project".'],
    warnings: [],
    functionsEnabled: false,
    storageConfigured: false,
  });
  assert.equal(brokenRegistry.mode, 'FIREBASE_CONFIGURATION_ERROR');
  assert.throws(
    () => (brokenRegistry.accountService.listAccounts as unknown as () => unknown)(),
    (err: unknown) => err instanceof FirebaseConfigurationError
  );
  assert.throws(
    () => (brokenRegistry.feeService.listFeeConfigurationHistory as unknown as () => unknown)(),
    (err: unknown) => err instanceof FirebaseConfigurationError
  );

  // 4. Explicit LOCAL_DEMO mode binds local demo adapters cleanly
  const localRegistry = resolveServiceRegistry({
    valid: true,
    mode: 'LOCAL_DEMO',
    config: null,
    errors: [],
    warnings: [],
    functionsEnabled: false,
    storageConfigured: false,
  });
  assert.equal(localRegistry.mode, 'LOCAL_DEMO');
}

function runMigrationSafetyTests() {
  // 1. Built-in demo fixtures are accurately identified and excluded by default
  assert.equal(isBuiltInDemoRecord({ accountId: 'ADM-0001', email: 'admin@centre-demo.example' }), true);
  assert.equal(isBuiltInDemoRecord({ accountId: 'TCH-0001', name: 'Sample Teacher' }), true);
  assert.equal(isBuiltInDemoRecord({ id: 'CLS-0001', name: 'Class 10' }), true);
  assert.equal(isBuiltInDemoRecord({ id: 'UPIC-0001', upiId: 'sharma.tuition@okicici' }), true);
  assert.equal(isBuiltInDemoRecord({ id: 'CLS-0099', name: 'Class 11 JEE' }), false);

  // 2. Credential & secret field stripping removes all password/token fields
  const { sanitized, strippedKeys } = stripCredentialFields({
    id: 'USR-1',
    name: 'Aarav Sharma',
    password: 'SecretPassword123',
    initialPassword: 'Init123',
    passwordHash: 'sha256:abc',
    credentialVerifier: 'verifier',
    devSecretKey: 'dev-secret',
    salt: 'salt123',
    sessionToken: 'tok-123',
    refreshToken: 'ref-123',
    privateKey: '-----BEGIN PRIVATE KEY-----',
    undefinedField: undefined,
  });
  assert.equal('password' in sanitized, false);
  assert.equal('initialPassword' in sanitized, false);
  assert.equal('passwordHash' in sanitized, false);
  assert.equal('credentialVerifier' in sanitized, false);
  assert.equal('devSecretKey' in sanitized, false);
  assert.equal('salt' in sanitized, false);
  assert.equal('sessionToken' in sanitized, false);
  assert.equal('refreshToken' in sanitized, false);
  assert.equal('privateKey' in sanitized, false);
  assert.equal('undefinedField' in sanitized, false);
  assert.equal(sanitized.name, 'Aarav Sharma');
  assert.equal(strippedKeys.length, 9);

  // 3. Dry-run migration inventory distinguishes demo fixtures, custom records, duplicates & manual auth items
  const snapshot: LocalRawSnapshot = {
    accounts: {
      accounts: [
        { accountId: 'TCH-0001', role: 'teacher', name: 'Demo Teacher' },
        { accountId: 'STU-0088', role: 'student', name: 'Custom Live Student' },
      ],
    },
    academics: {
      classes: [
        { classId: 'CLS-0001', name: 'Demo Class 10' },
        { classId: 'CLS-0050', name: 'Custom Class 11' },
        { classId: 'CLS-0051', name: 'Custom Class 12' },
      ],
    },
    finance: {
      upiConfigurations: [{ id: 'UPIC-0001', upiId: 'sharma.tuition@okicici' }],
    },
  };

  const preview = buildDryRunMigrationInventory(
    snapshot,
    ['tuition_ecosystem_dev_accounts_v1', 'tuition_ecosystem_dev_academics_v1'],
    {
      classes: new Set(['CLS-0050']),
    }
  );

  assert.equal(preview.hasLocalData, true);
  assert.equal(preview.totalRecordsFound, 6);
  assert.equal(preview.totalDemoFixtures, 3);
  assert.equal(preview.totalDuplicatesInFirestore, 1);
  assert.equal(preview.totalManualReviewRecords, 1);
  assert.equal(preview.totalEligibleCustomRecords, 2);
  assert.ok(preview.warnings.some((w) => w.includes('EXCLUDED from production migration')));
  assert.ok(preview.warnings.some((w) => w.includes('NEVER automatically deleted')));
}

function runCodebaseSecurityHygieneAudit() {
  const rootDir = process.cwd();

  // 1. Verify firebase-applet-config.json targets academy-0007
  const appletCfg = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'firebase-applet-config.json'), 'utf8')
  ) as { projectId?: string; firestoreDatabaseId?: string };
  assert.equal(appletCfg.projectId, 'academy-0007');
  assert.ok(appletCfg.firestoreDatabaseId);

  // 2. Ensure UI & context layers contain ZERO direct imports from services/local/
  const uiFolders = ['src/components', 'src/interfaces', 'src/pages', 'src/context'];
  for (const folder of uiFolders) {
    const absFolder = path.join(rootDir, folder);
    if (!fs.existsSync(absFolder)) continue;
    const stack = [absFolder];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          assert.equal(
            content.includes('services/local/'),
            false,
            `UI/context file must import from services registry, not local adapter directly: ${full}`
          );
          assert.equal(
            content.includes('firebase-admin'),
            false,
            `Frontend code must never import firebase-admin: ${full}`
          );
        }
      }
    }
  }

  // 3. Ensure .env.example contains no service-account private keys
  const envExample = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  assert.equal(envExample.includes('BEGIN PRIVATE KEY'), false);
}

function runAdminAuthSeparationChecks() {
  const rootDir = process.cwd();
  assert.equal(BOOTSTRAPPED_ADMIN_EMAIL, '07alphabro@gmail.com');

  const adminLoginSrc = fs.readFileSync(
    path.join(rootDir, 'src/pages/auth/AdminLoginPage.tsx'),
    'utf8'
  );
  assert.ok(adminLoginSrc.includes('Continue with Google'));
  assert.equal(adminLoginSrc.includes('type="password"'), false);
  assert.equal(adminLoginSrc.includes('PORTAL_LOGIN'), false);
  assert.equal(adminLoginSrc.includes('ADMIN_FORGOT_PASSWORD'), false);

  const portalLoginSrc = fs.readFileSync(
    path.join(rootDir, 'src/pages/auth/PortalLoginPage.tsx'),
    'utf8'
  );
  assert.equal(portalLoginSrc.includes('ADMIN_LOGIN'), false);
  assert.equal(portalLoginSrc.includes('Admin Portal'), false);

  const routesSrc = fs.readFileSync(path.join(rootDir, 'src/router/routes.ts'), 'utf8');
  assert.equal(routesSrc.includes('ADMIN_FORGOT_PASSWORD'), false);
}

function runSparkPlanOnlyChecks() {
  const rootDir = process.cwd();
  assert.equal(isCloudFunctionsEnabled({}), false, 'Cloud Functions must default to disabled on Spark');
  assert.equal(
    isCloudFunctionsEnabled({ VITE_FIREBASE_FUNCTIONS_ENABLED: 'false' }),
    false
  );
  assert.equal(validateAndResolveFirebaseConfig().functionsEnabled, false);

  const sparkServiceFiles = [
    'src/services/firebase/firebaseAuthService.ts',
    'src/services/firebase/firebaseAccountService.ts',
    'src/services/firebase/firebaseAssessmentServices.ts',
    'src/services/firebase/firebaseFinanceServices.ts',
  ];
  for (const rel of sparkServiceFiles) {
    const content = fs.readFileSync(path.join(rootDir, rel), 'utf8');
    assert.equal(
      content.includes('invokeCloudCallable'),
      false,
      `Spark service must not call Cloud Functions callable: ${rel}`
    );
    assert.equal(
      content.includes('createManagedAccount'),
      false,
      `Spark service must not depend on createManagedAccount: ${rel}`
    );
  }

  const provisioningSrc = fs.readFileSync(
    path.join(rootDir, 'src/lib/firebase/provisioningApp.ts'),
    'utf8'
  );
  assert.ok(provisioningSrc.includes('inMemoryPersistence'));
  assert.ok(provisioningSrc.includes('firebaseSignOut'));
  assert.ok(provisioningSrc.includes('deleteUser'));

  const createModalSrc = fs.readFileSync(
    path.join(rootDir, 'src/components/accounts/CreateAccountModal.tsx'),
    'utf8'
  );
  assert.ok(createModalSrc.includes('spark_secondary_auth'));
  assert.ok(createModalSrc.includes('manual_console_uid'));

  const memberSettingsSrc = fs.readFileSync(
    path.join(rootDir, 'src/components/settings/MemberSettingsModule.tsx'),
    'utf8'
  );
  assert.ok(memberSettingsSrc.includes('changeMyPassword'));

  const profileSrc = fs.readFileSync(
    path.join(rootDir, 'src/components/profile/RoleProfileView.tsx'),
    'utf8'
  );
  assert.equal(profileSrc.includes('Sign Out'), false);
  assert.equal(profileSrc.includes('changeMyPassword'), false);

  const shellSrc = fs.readFileSync(
    path.join(rootDir, 'src/components/layout/ResponsiveShell.tsx'),
    'utf8'
  );
  assert.ok(shellSrc.includes('ConfirmDialog'));
  assert.ok(shellSrc.includes('Sign Out'));
}

runConfigAndRegistryTests();
runMigrationSafetyTests();
runCodebaseSecurityHygieneAudit();
runAdminAuthSeparationChecks();
runSparkPlanOnlyChecks();
console.log('Phase 10 Firebase Configuration, Spark Plan Architecture, Migration & Security Hygiene Verification: ALL PASSED');
