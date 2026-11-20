/**
 * Security & Privacy Audit Automated Verification Suite (Node / TSX)
 *
 * Verifies without requiring Java/Firestore Emulator:
 *  1. Structural security invariants in firestore.rules and storage.rules
 *  2. Spark-only architecture & secret hygiene in src/ and .env*
 *  3. Runtime validation, XSS/URL scheme sanitization, and RBAC checks
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FirebaseSettingsService } from '../src/services/firebase/firebaseSettingsService';
import { LocalAcademicStore } from '../src/services/local/localAcademicStore';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import { LocalFinanceStore } from '../src/services/local/localFinanceStore';
import { LocalDevApplicationSettingsService } from '../src/services/local/localSettingsService';
import {
  createDefaultApplicationSettings,
  LocalSettingsStore,
} from '../src/services/local/localSettingsStore';
import type { AuthPrincipal } from '../src/types';

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');
}

function collectFiles(dirRel: string, exts: string[]): string[] {
  const root = path.resolve(process.cwd(), dirRel);
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(path.relative(process.cwd(), full), exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

async function runAuditVerification(): Promise<void> {
  // 1. Firestore Rules Invariant Checks
  const firestoreRules = readText('firestore.rules');
  assert(
    firestoreRules.includes("match /{document=**} {\n      allow read, write: if false;\n    }"),
    'firestore.rules must enforce global deny-by-default catch-all'
  );
  assert(
    firestoreRules.includes("request.auth.token.email == '07alphabro@gmail.com'") &&
      firestoreRules.includes("request.auth.token.firebase.sign_in_provider == 'google.com'"),
    'firestore.rules must restrict bootstrapped Admin to verified Google Sign-In for 07alphabro@gmail.com'
  );
  assert(
    firestoreRules.includes("get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.status == 'active'"),
    'firestore.rules must verify admins/{uid}.status == active so deactivated admins lose privileges immediately'
  );
  assert(
    firestoreRules.includes('function isActiveTeacher() {\n      return hasActiveUserDoc()') &&
      !firestoreRules.includes('function isActiveTeacher() {\n      return isVerifiedEmail()'),
    'Teacher rule must not require email_verified (internal Spark Teacher accounts have emailVerified=false)'
  );
  assert(
    firestoreRules.includes('function isActiveStudent() {\n      return hasActiveUserDoc()') &&
      !firestoreRules.includes('function isActiveStudent() {\n      return isVerifiedEmail()'),
    'Student rule must not require email_verified (internal Spark Student accounts have emailVerified=false)'
  );
  assert(
    firestoreRules.includes('allow update, delete: if false;') &&
      firestoreRules.includes("match /accountAudit/{auditId}") &&
      firestoreRules.includes("match /settingsAudit/{auditId}") &&
      firestoreRules.includes("match /attendanceAudit/{auditId}") &&
      firestoreRules.includes("match /homeworkAudit/{auditId}") &&
      firestoreRules.includes("match /marksAudit/{auditId}") &&
      firestoreRules.includes("match /paymentVerificationAudit/{auditId}") &&
      firestoreRules.includes("match /financialAudit/{auditId}"),
    'All 7 audit collections must be append-only (no update/delete)'
  );
  assert(
    firestoreRules.includes('existsAfter(/databases/$(database)/documents/attendanceSessions/$(incoming().attendanceSessionId))'),
    'Attendance batch writes must use existsAfter/getAfter for atomic creation'
  );
  assert(
    firestoreRules.includes('isValidNotificationRecord(incoming(), notificationId)') &&
      firestoreRules.includes("incoming().recipientRole == 'admin'"),
    'Notifications collection must enforce strict role/category/recipient gating'
  );
  assert(
    firestoreRules.includes('!isAutoEvaluatedTest(existing().testId)'),
    'testAttempts must block student score/evaluated writes on manual/scheduled tests'
  );

  // 2. Storage Rules Invariant Checks
  const storageRules = readText('storage.rules');
  assert(
    storageRules.includes('allow read, write: if false;'),
    'storage.rules must have default-deny catch-all'
  );
  assert(
    storageRules.includes("request.auth.token.firebase.sign_in_provider == 'google.com'") &&
      storageRules.includes(
        'firestore.get(/databases/ai-studio-tuitioncentreman-6b2667d2-c24a-4077-b286-962e1941f470/documents/admins/$(request.auth.uid)).data.status == \'active\''
      ),
    'storage.rules must verify Google Sign-In provider and active admins/{uid} status'
  );
  assert(
    !storageRules.includes("request.auth.token.role == 'admin'"),
    'storage.rules must not trust unverified custom role claims'
  );
  assert(
    storageRules.includes('isValidLogoFileName(fileName)'),
    'storage.rules must sanitize branding logo filenames'
  );

  // 3. Frontend & Spark Architecture Hygiene Checks
  const envExample = readText('.env.example');
  assert(
    /VITE_FIREBASE_FUNCTIONS_ENABLED=["']?false["']?/.test(envExample),
    '.env.example must keep VITE_FIREBASE_FUNCTIONS_ENABLED=false for Spark plan'
  );

  const srcFiles = collectFiles('src', ['.ts', '.tsx']);
  for (const fullPath of srcFiles) {
    const rel = path.relative(process.cwd(), fullPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(!content.includes('firebase-admin'), `Forbidden firebase-admin reference in ${rel}`);
    assert(!content.includes('BEGIN PRIVATE KEY'), `Forbidden private key material in ${rel}`);
    assert(!content.includes('dangerouslySetInnerHTML'), `Unsafe dangerouslySetInnerHTML found in ${rel}`);
    assert(!content.includes('createManagedAccount'), `Removed Cloud Function call createManagedAccount found in ${rel}`);
    if (
      rel.startsWith('src/components/') ||
      rel.startsWith('src/context/') ||
      rel.startsWith('src/router/')
    ) {
      assert(!content.includes('services/local/'), `Forbidden local demo import in UI/context/router file ${rel}`);
    }
  }

  // 4. Runtime Service Validation & Sanitization Tests
  const adminActor: AuthPrincipal = {
    uid: 'uid-adm-0001',
    loginId: 'ADM-0001',
    role: 'admin',
    fullName: 'Centre Administrator',
    status: 'active',
  };
  const studentActor: AuthPrincipal = {
    uid: 'uid-stu-0001',
    loginId: 'STU-0001',
    role: 'student',
    fullName: 'Student Alpha',
    status: 'active',
  };
  const deactivatedAdminActor: AuthPrincipal = {
    uid: 'uid-adm-0002',
    loginId: 'ADM-0002',
    role: 'admin',
    fullName: 'Deactivated Admin',
    status: 'deactivated',
  };

  const defaults = createDefaultApplicationSettings();
  const fbSettings = new FirebaseSettingsService();
  const accountStore = new LocalAccountStore({ allowFixturesInTest: true, skipPersistence: true });
  const academicStore = new LocalAcademicStore({
    accountStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const financeStore = new LocalFinanceStore({
    academicStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const settingsStore = new LocalSettingsStore({ skipPersistence: true });
  const localSettings = new LocalDevApplicationSettingsService({
    settingsStore,
    accountStore,
    academicStore,
    financeStore,
  });

  // Reject non-admin, deactivated admin, and forged AuthPrincipal without live Firebase Auth user
  await assert.rejects(
    () => fbSettings.updateCentreProfile(studentActor, defaults.centreProfile),
    /Access denied|Admin|not active/i
  );
  await assert.rejects(
    () => fbSettings.updateCentreProfile(deactivatedAdminActor, defaults.centreProfile),
    /deactivated|active/i
  );
  await assert.rejects(
    () => fbSettings.updateCentreProfile(adminActor, defaults.centreProfile),
    /Firebase Authentication session is not active/i
  );

  // Verify firebaseSettingsService enforces identical URL & raster MIME validation before Firestore write
  const fbSettingsSource = readText('src/services/firebase/firebaseSettingsService.ts');
  assert(
    fbSettingsSource.includes('validateOptionalUrl(input.websiteUrl)') &&
      fbSettingsSource.includes('ALLOWED_LOGO_DATA_URL_REGEX') &&
      fbSettingsSource.includes("!/^https:\\/\\/.+/i.test(normalizedLogo.downloadUrl)"),
    'firebaseSettingsService must enforce URL scheme and raster logo MIME validation'
  );

  // Reject javascript: XSS URI & SVG XSS data URLs in LocalDevApplicationSettingsService
  await assert.rejects(
    () =>
      localSettings.updateCentreProfile(adminActor, {
        ...defaults.centreProfile,
        websiteUrl: 'javascript:alert(1)',
      }),
    /http:\/\/ or https:\/\//i
  );
  await assert.rejects(
    () =>
      localSettings.updateApplicationBranding(adminActor, {
        ...defaults.applicationBranding,
        logoConfiguration: {
          mode: 'custom_local_image',
          mimeType: 'image/png',
          dataUrl: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
          storageNotice: 'test',
        },
      }),
    /Invalid local image format|PNG, JPEG, or WebP/i
  );

  // Verify BrandLogoMark helper file enforces strict HTTPS / raster data URL guard
  const brandLogoCode = readText('src/components/ui/BrandLogoMark.tsx');
  assert(
    brandLogoCode.includes('isSafeLogoSrc') &&
      brandLogoCode.includes("trimmed.startsWith('https://')") &&
      brandLogoCode.includes('data:image\\/(png|jpeg|webp);base64'),
    'BrandLogoMark must sanitize logo URLs against javascript: and SVG XSS payloads'
  );

  // Verify StudentFeesModule checks upi://pay? scheme before rendering <a href>
  const studentFeesCode = readText('src/components/finance/StudentFeesModule.tsx');
  assert(
    studentFeesCode.includes("preparedUpi.upiUri.startsWith('upi://pay?')"),
    'StudentFeesModule must validate upi://pay? scheme before rendering UPI link'
  );

  console.log('Security Audit Automated Verification Suite: ALL CHECKS PASSED');
}

runAuditVerification().catch((err) => {
  console.error('Security audit verification failed:', err);
  process.exit(1);
});
