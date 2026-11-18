import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { APP_PACKAGE_VERSION, DEFAULT_BRANDING_CONFIG } from '../src/config/branding';
import { SettingsServiceError } from '../src/services/contracts/settingsService';
import { LocalAcademicStore } from '../src/services/local/localAcademicStore';
import { LocalDevAcademicService } from '../src/services/local/localAcademicService';
import { LocalAccountStore } from '../src/services/local/localAccountStore';
import { LocalAssessmentStores } from '../src/services/local/localAssessmentStores';
import { LocalAttendanceStore } from '../src/services/local/localAttendanceStore';
import { LocalDevAttendanceService } from '../src/services/local/localAttendanceService';
import { LocalDevAssessmentService } from '../src/services/local/localAssessmentService';
import { LocalDevExaminationService } from '../src/services/local/localExaminationService';
import { LocalDevFeeService } from '../src/services/local/localDevFeeService';
import { LocalDevHomeworkService } from '../src/services/local/localHomeworkService';
import { LocalDevPaymentService } from '../src/services/local/localDevPaymentService';
import { LocalDevTestService } from '../src/services/local/localTestService';
import { LocalFinanceStore } from '../src/services/local/localFinanceStore';
import {
  APP_SETTINGS_STORAGE_KEY,
  LocalSettingsStore,
} from '../src/services/local/localSettingsStore';
import { LocalDevApplicationSettingsService } from '../src/services/local/localSettingsService';
import { LocalDevStudentPortalService } from '../src/services/local/localStudentPortalService';
import type { AuthPrincipal } from '../src/types';

async function expectUnauthorized(
  fn: () => Promise<unknown>,
  context: string
): Promise<void> {
  let caught: unknown = null;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof SettingsServiceError,
    `${context}: expected SettingsServiceError, got ${String(caught)}`
  );
  assert.equal(caught.code, 'UNAUTHORIZED', `${context}: expected UNAUTHORIZED`);
}

async function expectValidationError(
  fn: () => Promise<unknown>,
  context: string,
  expectedField?: string
): Promise<void> {
  let caught: unknown = null;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof SettingsServiceError,
    `${context}: expected SettingsServiceError, got ${String(caught)}`
  );
  assert.equal(caught.code, 'VALIDATION_ERROR', `${context}: expected VALIDATION_ERROR`);
  if (expectedField) {
    assert.equal(caught.field, expectedField, `${context}: expected field ${expectedField}`);
  }
}

async function runPhase9Tests() {
  const accountStore = new LocalAccountStore({
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const academicStore = new LocalAcademicStore({
    accountStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const academicService = new LocalDevAcademicService(academicStore);
  const attendanceStore = new LocalAttendanceStore({
    academicStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const attendanceService = new LocalDevAttendanceService(attendanceStore);
  const assessmentStores = new LocalAssessmentStores({
    academicStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const homeworkService = new LocalDevHomeworkService(assessmentStores);
  const testService = new LocalDevTestService(assessmentStores);
  const examService = new LocalDevExaminationService(assessmentStores);
  const assessmentService = new LocalDevAssessmentService(assessmentStores);
  const financeStore = new LocalFinanceStore({
    academicStore,
    attendanceStore,
    allowFixturesInTest: true,
    skipPersistence: true,
  });
  const feeService = new LocalDevFeeService(financeStore);
  const settingsStore = new LocalSettingsStore({ skipPersistence: true });
  const settingsService = new LocalDevApplicationSettingsService({
    settingsStore,
    accountStore,
    academicStore,
    financeStore,
  });
  const paymentService = new LocalDevPaymentService(financeStore, settingsStore);
  const studentPortalService = new LocalDevStudentPortalService({
    accountStore,
    academicStore,
    academicService,
    attendanceService,
    homeworkService,
    testService,
    examinationService: examService,
    assessmentService,
    feeService,
    settingsService,
    skipPersistence: true,
  });

  const adminActor = accountStore.findAuthPrincipalByLoginId('ADM-0001')!;
  const teacherActor = accountStore.findAuthPrincipalByLoginId('TCH-0001')!;
  const studentActor = accountStore.findAuthPrincipalByLoginId('STU-0001')!;
  const deactivatedAdminActor: AuthPrincipal = {
    ...adminActor,
    status: 'deactivated',
  };

  // =========================================================================
  // 1. DEFAULT LOAD, PUBLIC BRANDING & DEMO TRANSPARENCY
  // =========================================================================
  const pkgJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
  ) as { version: string };
  assert.equal(APP_PACKAGE_VERSION, pkgJson.version, 'APP_PACKAGE_VERSION matches package.json');

  const publicDefaults = await settingsService.getPublicBrandingAndSettings();
  assert.equal(publicDefaults.centreProfile.centreName, DEFAULT_BRANDING_CONFIG.centreName);
  assert.equal(publicDefaults.applicationBranding.logoConfiguration.mode, 'default_icon');
  assert.equal(publicDefaults.appearanceDefaults.defaultTheme, 'light');
  assert.equal(publicDefaults.appearanceDefaults.allowPersonalThemePreference, true);
  assert.equal(publicDefaults.notificationPreferences.externalChannelsStatus, 'disabled_local_demo');
  assert.equal(publicDefaults.environmentMode, 'local_demo_adapter');

  const adminLoaded = await settingsService.getApplicationSettings(adminActor);
  assert.equal(adminLoaded.id, 'APP-SETTINGS-001');
  assert.equal(adminLoaded.environmentMode, 'local_demo_adapter');

  // =========================================================================
  // 2. ROLE SECURITY / RBAC ENFORCEMENT ON ALL ADMIN SETTINGS OPERATIONS
  // =========================================================================
  const unauthorizedActors: Array<[string, AuthPrincipal | null]> = [
    ['Unauthenticated null', null],
    ['Teacher', teacherActor],
    ['Student', studentActor],
    ['Deactivated Admin', deactivatedAdminActor],
  ];

  for (const [label, actor] of unauthorizedActors) {
    await expectUnauthorized(
      () => settingsService.getApplicationSettings(actor),
      `${label} getApplicationSettings`
    );
    await expectUnauthorized(
      () => settingsService.updateCentreProfile(actor, adminLoaded.centreProfile),
      `${label} updateCentreProfile`
    );
    await expectUnauthorized(
      () => settingsService.updateApplicationBranding(actor, adminLoaded.applicationBranding),
      `${label} updateApplicationBranding`
    );
    await expectUnauthorized(
      () => settingsService.updateAppearanceDefaults(actor, adminLoaded.appearanceDefaults),
      `${label} updateAppearanceDefaults`
    );
    await expectUnauthorized(
      () => settingsService.updateAcademicDefaults(actor, adminLoaded.academicDefaults),
      `${label} updateAcademicDefaults`
    );
    await expectUnauthorized(
      () =>
        settingsService.updateNotificationPreferences(
          actor,
          adminLoaded.notificationPreferences
        ),
      `${label} updateNotificationPreferences`
    );
    await expectUnauthorized(
      () => settingsService.resetBrandingToDefaults(actor),
      `${label} resetBrandingToDefaults`
    );
    await expectUnauthorized(
      () => settingsService.listSettingsAuditHistory(actor),
      `${label} listSettingsAuditHistory`
    );
    await expectUnauthorized(
      () => settingsService.getApplicationIntegrationStatus(actor),
      `${label} getApplicationIntegrationStatus`
    );
    await expectUnauthorized(
      () => settingsService.getSystemStatusOverview(actor),
      `${label} getSystemStatusOverview`
    );
  }

  // =========================================================================
  // 3. CENTRE PROFILE UPDATE, VALIDATION & RECEIPT PROPAGATION
  // =========================================================================
  await expectValidationError(
    () =>
      settingsService.updateCentreProfile(adminActor, {
        ...adminLoaded.centreProfile,
        centreName: ' ',
      }),
    'Empty centre name rejected',
    'centreName'
  );
  await expectValidationError(
    () =>
      settingsService.updateCentreProfile(adminActor, {
        ...adminLoaded.centreProfile,
        contactNumber: '123',
      }),
    'Invalid primary phone rejected',
    'contactNumber'
  );
  await expectValidationError(
    () =>
      settingsService.updateCentreProfile(adminActor, {
        ...adminLoaded.centreProfile,
        publicEmail: 'not-an-email',
      }),
    'Invalid public email rejected',
    'publicEmail'
  );
  await expectValidationError(
    () =>
      settingsService.updateCentreProfile(adminActor, {
        ...adminLoaded.centreProfile,
        websiteUrl: 'ftp://invalid-scheme.example',
      }),
    'Non-HTTP website URL rejected',
    'websiteUrl'
  );
  await expectValidationError(
    () =>
      settingsService.updateCentreProfile(adminActor, {
        ...adminLoaded.centreProfile,
        pinCode: '12',
      }),
    'Short PIN code rejected',
    'pinCode'
  );

  const initialReceiptCentreName = financeStore.receipts[0]?.centreName;

  const updatedProfileSettings = await settingsService.updateCentreProfile(adminActor, {
    centreName: 'Apex Horizon Academy',
    shortName: 'Apex Horizon',
    tagline: 'Focused Academic Mentorship',
    contactNumber: '+91 98220 55443',
    secondaryContactNumber: '+91 20 2555 0199',
    publicEmail: 'office@apexhorizon.example',
    address: '42 Academic Lane, Shivajinagar',
    city: 'Pune',
    state: 'Maharashtra',
    pinCode: '411005',
    country: 'India',
    websiteUrl: 'https://apexhorizon.example',
  });
  assert.equal(updatedProfileSettings.centreProfile.centreName, 'Apex Horizon Academy');
  assert.equal(updatedProfileSettings.centreProfile.contactNumber, '+91 98220 55443');
  assert.equal(financeStore.centreName, 'Apex Horizon Academy');
  if (financeStore.receipts[0]) {
    assert.equal(
      financeStore.receipts[0].centreName,
      initialReceiptCentreName,
      'Existing historical receipts must remain untouched when centre name updates'
    );
  }

  // Newly verified payment claim stamps receipt with updated centreName from live settingsStore
  const stuFeeDash = await feeService.getStudentFeeDashboard(studentActor);
  const unpaidAccount = stuFeeDash.accounts.find((a) => a.account.remainingBalancePaise > 0)!;
  assert.ok(unpaidAccount, 'Seeded unpaid fee account available for receipt verification');
  const prep = await paymentService.prepareUpiPayment(studentActor, {
    feeAccountId: unpaidAccount.account.id,
    amountRupees: 500,
    idempotencyKey: 'PHASE9-CENTRE-NAME-CHECK',
  });
  const claim = await paymentService.submitPaymentClaim(studentActor, {
    feeAccountId: unpaidAccount.account.id,
    preparedPaymentId: prep.id,
    paymentReference: prep.paymentReference,
    amountRupees: 500,
    transactionReference: 'UTR991122334455',
    paymentDate: new Date().toISOString().slice(0, 10),
  });
  const verified = await paymentService.verifyPaymentClaim(adminActor, {
    claimId: claim.claim.id,
    confirmIndependentCheck: true,
    verificationNote: 'Phase 9 branding propagation check',
  });
  assert.equal(
    verified.receipt.centreName,
    'Apex Horizon Academy',
    'Newly issued receipt uses live Admin centreProfile.centreName'
  );

  // =========================================================================
  // 4. APPLICATION BRANDING, LOGO VALIDATION & RESET TO DEFAULTS
  // =========================================================================
  const validTinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

  await expectValidationError(
    () =>
      settingsService.updateApplicationBranding(adminActor, {
        ...updatedProfileSettings.applicationBranding,
        logoConfiguration: {
          mode: 'custom_local_image',
          dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          mimeType: 'image/png',
          sizeBytes: 120,
          storageNotice: 'test',
        },
      }),
    'Invalid data URL header rejected',
    'logoConfiguration'
  );

  await expectValidationError(
    () =>
      settingsService.updateApplicationBranding(adminActor, {
        ...updatedProfileSettings.applicationBranding,
        logoConfiguration: {
          mode: 'custom_local_image',
          dataUrl: validTinyPng,
          mimeType: 'image/png',
          sizeBytes: 300 * 1024,
          storageNotice: 'test',
        },
      }),
    'Oversized logo > 256KB rejected',
    'logoConfiguration'
  );

  const brandedSettings = await settingsService.updateApplicationBranding(adminActor, {
    displayName: 'Apex Portal Hub',
    shortName: 'Apex',
    tagline: 'Structured Learning Workspace',
    loginWelcomeHeading: 'Welcome to Apex Portal Hub',
    loginDescription: 'Use your institutional ID to view batches, attendance and verified fees.',
    logoConfiguration: {
      mode: 'custom_local_image',
      dataUrl: validTinyPng,
      fileName: 'apex-logo.png',
      mimeType: 'image/png',
      sizeBytes: validTinyPng.length,
      storageNotice: 'local',
    },
  });
  assert.equal(brandedSettings.applicationBranding.displayName, 'Apex Portal Hub');
  assert.equal(brandedSettings.applicationBranding.logoConfiguration.mode, 'custom_local_image');
  assert.equal(brandedSettings.applicationBranding.logoConfiguration.dataUrl, validTinyPng);

  const publicAfterBrand = await settingsService.getPublicBrandingAndSettings();
  assert.equal(publicAfterBrand.applicationBranding.displayName, 'Apex Portal Hub');
  assert.equal(
    publicAfterBrand.applicationBranding.loginWelcomeHeading,
    'Welcome to Apex Portal Hub'
  );

  const afterReset = await settingsService.resetBrandingToDefaults(adminActor);
  assert.equal(
    afterReset.applicationBranding.displayName,
    DEFAULT_BRANDING_CONFIG.centreName
  );
  assert.equal(afterReset.applicationBranding.logoConfiguration.mode, 'default_icon');
  assert.equal(afterReset.applicationBranding.logoConfiguration.dataUrl, undefined);
  assert.equal(
    afterReset.centreProfile.centreName,
    'Apex Horizon Academy',
    'Resetting app branding must preserve centre profile details'
  );

  // =========================================================================
  // 5. THEME DEFAULTS, ACADEMIC DEFAULTS & HISTORICAL DATA ISOLATION
  // =========================================================================
  const accountsCountBefore = accountStore.getAllAccounts().length;
  const student1Before = { ...accountStore.findAccountById('STU-0001')! };
  const timetableCountBefore = academicStore.timetable.length;
  const attendanceSessionsBefore = attendanceStore.sessions.length;

  const themedSettings = await settingsService.updateAppearanceDefaults(adminActor, {
    defaultTheme: 'dark',
    allowPersonalThemePreference: false,
  });
  assert.equal(themedSettings.appearanceDefaults.defaultTheme, 'dark');
  assert.equal(themedSettings.appearanceDefaults.allowPersonalThemePreference, false);

  const unlockedThemeSettings = await settingsService.updateAppearanceDefaults(adminActor, {
    defaultTheme: 'dark',
    allowPersonalThemePreference: true,
  });
  assert.equal(unlockedThemeSettings.appearanceDefaults.allowPersonalThemePreference, true);

  const academicUpdated = await settingsService.updateAcademicDefaults(adminActor, {
    academicYearDisplay: '2026–2027 Session',
    defaultTimetableView: 'today',
    academicTermLabel: 'Term II',
  });
  assert.equal(academicUpdated.academicDefaults.academicYearDisplay, '2026–2027 Session');
  assert.equal(academicUpdated.academicDefaults.defaultTimetableView, 'today');
  assert.equal(academicUpdated.academicDefaults.academicTermLabel, 'Term II');

  assert.equal(accountStore.getAllAccounts().length, accountsCountBefore);
  assert.deepEqual(accountStore.findAccountById('STU-0001'), student1Before);
  assert.equal(academicStore.timetable.length, timetableCountBefore);
  assert.equal(attendanceStore.sessions.length, attendanceSessionsBefore);

  // =========================================================================
  // 6. IN-APP NOTIFICATION PREFERENCES & PORTAL INTEGRATION
  // =========================================================================
  const notifBeforeDisable =
    await studentPortalService.getMyStudentNotificationsAndAnnouncements(studentActor);
  assert.ok(
    notifBeforeDisable.notifications.some((n) => n.category === 'attendance'),
    'Attendance notification present when category enabled'
  );
  const rawAttendanceAlertCount = attendanceStore.notifications.length;

  const disabledAttendanceNotifs = await settingsService.updateNotificationPreferences(
    adminActor,
    {
      enabledCategories: {
        attendance: false,
        homeworkTests: true,
        examsResults: true,
        feesReceipts: true,
      },
      defaultFilterView: 'unread_only',
      showUnreadBadgesInNavigation: false,
      externalChannelsStatus: 'disabled_local_demo',
    }
  );
  assert.equal(disabledAttendanceNotifs.notificationPreferences.defaultFilterView, 'unread_only');
  assert.equal(
    disabledAttendanceNotifs.notificationPreferences.showUnreadBadgesInNavigation,
    false
  );
  assert.equal(
    disabledAttendanceNotifs.notificationPreferences.externalChannelsStatus,
    'disabled_local_demo'
  );

  const notifAfterDisable =
    await studentPortalService.getMyStudentNotificationsAndAnnouncements(studentActor);
  assert.equal(
    notifAfterDisable.notifications.some((n) => n.category === 'attendance'),
    false,
    'Attendance notifications hidden in portal when category preference is disabled'
  );
  assert.ok(
    notifAfterDisable.notifications.some((n) => n.category === 'fees_receipts'),
    'Fees/Receipts category remains visible while enabled'
  );
  assert.equal(
    attendanceStore.notifications.length,
    rawAttendanceAlertCount,
    'Underlying historical attendance alert records are never deleted'
  );

  await settingsService.updateNotificationPreferences(adminActor, {
    enabledCategories: {
      attendance: true,
      homeworkTests: true,
      examsResults: true,
      feesReceipts: true,
    },
    defaultFilterView: 'all',
    showUnreadBadgesInNavigation: true,
    externalChannelsStatus: 'disabled_local_demo',
  });
  const notifAfterReEnable =
    await studentPortalService.getMyStudentNotificationsAndAnnouncements(studentActor);
  assert.ok(
    notifAfterReEnable.notifications.some((n) => n.category === 'attendance'),
    'Re-enabling attendance category restores notifications cleanly'
  );

  // =========================================================================
  // 7. INTEGRATION INVENTORY & SYSTEM STATUS OVERVIEW
  // =========================================================================
  const integrations = await settingsService.getApplicationIntegrationStatus(adminActor);
  const byId = new Map(integrations.map((i) => [i.id, i]));
  assert.equal(byId.get('local-adapters')?.status, 'local_only');
  assert.equal(byId.get('firebase-auth')?.status, 'not_connected');
  assert.equal(byId.get('cloud-firestore')?.status, 'not_connected');
  assert.equal(byId.get('firebase-storage')?.status, 'not_connected');
  assert.equal(byId.get('payment-gateway')?.status, 'not_used');
  assert.equal(byId.get('ai-apis')?.status, 'not_used');
  assert.equal(byId.get('external-messaging')?.status, 'not_used');
  assert.equal(byId.get('postgresql')?.status, 'not_used');

  const statusOverview = await settingsService.getSystemStatusOverview(adminActor);
  const allAccounts = accountStore.getAllAccounts();
  assert.equal(
    statusOverview.activeTeachersCount,
    allAccounts.filter((a) => a.role === 'teacher' && a.status === 'active').length
  );
  assert.equal(
    statusOverview.activeStudentsCount,
    allAccounts.filter((a) => a.role === 'student' && a.status === 'active').length
  );
  assert.equal(
    statusOverview.configuredClassesCount,
    academicStore.classes.filter((c) => c.status === 'active').length
  );
  assert.equal(
    statusOverview.configuredBatchesCount,
    academicStore.batches.filter((b) => b.status === 'active').length
  );
  assert.equal(
    statusOverview.configuredSubjectsCount,
    academicStore.subjects.filter((s) => s.status === 'active').length
  );

  // =========================================================================
  // 8. AUDIT HISTORY & SECRET EXCLUSION
  // =========================================================================
  const auditEntries = await settingsService.listSettingsAuditHistory(adminActor);
  assert.ok(auditEntries.length >= 6, 'All setting updates and resets recorded in audit trail');
  assert.ok(auditEntries[0].id.startsWith('SAUD-'));
  const categoriesSeen = new Set(auditEntries.map((a) => a.category));
  assert.ok(categoriesSeen.has('centre_profile'));
  assert.ok(categoriesSeen.has('application_branding'));
  assert.ok(categoriesSeen.has('branding_reset'));
  assert.ok(categoriesSeen.has('appearance_defaults'));
  assert.ok(categoriesSeen.has('academic_defaults'));
  assert.ok(categoriesSeen.has('notification_preferences'));

  const collectKeys = (obj: unknown): string[] => {
    if (!obj || typeof obj !== 'object') return [];
    if (Array.isArray(obj)) return obj.flatMap((item) => collectKeys(item));
    return Object.entries(obj).flatMap(([k, v]) => [k.toLowerCase(), ...collectKeys(v)]);
  };
  const currentSettingsObj = await settingsService.getApplicationSettings(adminActor);
  const allKeys = collectKeys({ settings: currentSettingsObj, auditEntries });
  for (const forbidden of ['password', 'hash', 'secret', 'token', 'verifier']) {
    assert.equal(
      allKeys.some((k) => k.includes(forbidden)),
      false,
      `Settings and audit payload keys must never include "${forbidden}"`
    );
  }
  const auditBlob = JSON.stringify(auditEntries).toLowerCase();
  assert.equal(auditBlob.includes('password'), false, 'No password values in audit entries');
  assert.equal(auditBlob.includes('hash'), false, 'No hash values in audit entries');
  assert.equal(auditBlob.includes('secret'), false, 'No secret values in audit entries');

  // =========================================================================
  // 9. LOCAL PERSISTENCE RELOAD & MALFORMED DATA RECOVERY
  // =========================================================================
  const missingStore = new LocalSettingsStore({
    skipPersistence: true,
    rawStorageOverride: null,
  });
  assert.equal(
    missingStore.settings.centreProfile.centreName,
    DEFAULT_BRANDING_CONFIG.centreName,
    'Missing storage recovers cleanly with defaults'
  );

  const corruptedStore = new LocalSettingsStore({
    skipPersistence: true,
    rawStorageOverride: '{corrupted-json-payload',
  });
  assert.equal(
    corruptedStore.settings.centreProfile.centreName,
    DEFAULT_BRANDING_CONFIG.centreName,
    'Corrupted storage recovers cleanly with defaults'
  );

  // Simulate normal browser localStorage reload + preservation of unrelated storage keys
  const memStorage = new Map<string, string>([
    ['tuition_ecosystem_theme_v1', 'dark'],
    ['unrelated_key', 'keep-me'],
  ]);
  const originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => memStorage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memStorage.set(k, v);
      },
      removeItem: (k: string) => {
        memStorage.delete(k);
      },
    },
  };
  try {
    const persistentStore = new LocalSettingsStore();
    const persistentSvc = new LocalDevApplicationSettingsService({
      settingsStore: persistentStore,
      accountStore,
      academicStore,
      financeStore,
    });
    await persistentSvc.updateCentreProfile(adminActor, {
      ...updatedProfileSettings.centreProfile,
      centreName: 'Persisted Reload Tuition Centre',
    });

    const savedRaw = memStorage.get(APP_SETTINGS_STORAGE_KEY)!;
    assert.ok(savedRaw && savedRaw.includes('"demoDataLabel":"DEMO DATA"'));
    assert.equal(memStorage.get('unrelated_key'), 'keep-me');
    assert.equal(memStorage.get('tuition_ecosystem_theme_v1'), 'dark');

    const reloadedStore = new LocalSettingsStore();
    assert.equal(
      reloadedStore.settings.centreProfile.centreName,
      'Persisted Reload Tuition Centre',
      'Settings survive normal browser reload'
    );
    assert.ok(reloadedStore.auditEntries.length >= 1, 'Audit entries survive reload');
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  }

  console.log('Phase 9 Application Branding & Admin Settings verification PASSED.');
}

runPhase9Tests().catch((err) => {
  console.error('Phase 9 verification FAILED:', err);
  process.exit(1);
});
