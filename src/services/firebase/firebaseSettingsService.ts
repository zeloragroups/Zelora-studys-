import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
} from 'firebase/firestore';
import { isCloudFunctionsEnabled, validateAndResolveFirebaseConfig } from '../../lib/firebase/config';
import {
  getFirestoreConnectivitySnapshot,
  getFirestoreDb,
  OperationType,
} from '../../lib/firebase/firestore';
import { SettingsServiceError, type IApplicationSettingsService } from '../contracts/settingsService';
import { createDefaultApplicationSettings } from '../local/localSettingsStore';
import type {
  AcademicDefaults,
  AdminSystemStatusOverview,
  AppearanceDefaults,
  ApplicationBranding,
  ApplicationIntegrationStatusItem,
  ApplicationSettings,
  AuthPrincipal,
  CentreProfile,
  NotificationPreferences,
  PublicApplicationSettings,
  SettingsAuditCategory,
  SettingsAuditEntry,
} from '../../types';
import { firebaseStorageService } from './firebaseStorageService';
import {
  generateSafeDocId,
  getActiveAdminUids,
  requireFirestoreDb,
  requireVerifiedActor,
  stripUndefinedFields,
  withFirestoreErrorHandling,
} from './helpers';

const SETTINGS_DOC_ID = 'APP-SETTINGS-001';
const FIREBASE_LOGO_NOTICE =
  'Stored in Firebase Storage & Firestore — synchronized across authorized devices.';
const PHONE_REGEX = /^[+\d\s().-]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_REGEX = /^[A-Za-z0-9\s-]{4,10}$/;
const ALLOWED_LOGO_DATA_URL_REGEX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i;

function validateOptionalPhone(value: string, label: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!PHONE_REGEX.test(trimmed) || digits.length < 7 || digits.length > 15) {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      `${label} must be a valid phone number (7–15 digits) or left blank.`
    );
  }
  return trimmed;
}

function validateOptionalEmail(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length > 160 || !EMAIL_REGEX.test(trimmed)) {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      'Public contact email must be a valid email address or left blank.'
    );
  }
  return trimmed;
}

function validateOptionalUrl(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length > 250 || !/^https?:\/\//i.test(trimmed)) {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      'Website URL must start with http:// or https:// or be left blank.'
    );
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) {
      throw new Error('Invalid host');
    }
  } catch {
    throw new SettingsServiceError('VALIDATION_ERROR', 'Website URL must be a valid web address.');
  }
  return trimmed;
}

function validateOptionalPin(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (!PIN_REGEX.test(trimmed)) {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      'PIN / postal code must be 4–10 characters or left blank.'
    );
  }
  return trimmed;
}

function createDefaultFirebaseSettings(): ApplicationSettings {
  const base = createDefaultApplicationSettings();
  return {
    ...base,
    environmentMode: 'firebase_connected',
    notificationPreferences: {
      ...base.notificationPreferences,
      externalChannelsStatus: 'in_app_firestore',
    },
    applicationBranding: {
      ...base.applicationBranding,
      logoConfiguration: {
        mode: 'default_icon',
        storageNotice: FIREBASE_LOGO_NOTICE,
      },
    },
  };
}

function toPublicSettings(s: ApplicationSettings): PublicApplicationSettings {
  return {
    centreProfile: { ...s.centreProfile },
    applicationBranding: {
      ...s.applicationBranding,
      logoConfiguration: { ...s.applicationBranding.logoConfiguration },
    },
    appearanceDefaults: { ...s.appearanceDefaults },
    academicDefaults: { ...s.academicDefaults },
    notificationPreferences: {
      ...s.notificationPreferences,
      enabledCategories: { ...s.notificationPreferences.enabledCategories },
    },
    updatedAt: s.updatedAt,
    environmentMode: 'firebase_connected',
  };
}

export class FirebaseSettingsService implements IApplicationSettingsService {
  private ensureAdmin(actor: AuthPrincipal | null): AuthPrincipal {
    try {
      return requireVerifiedActor(actor, ['admin']);
    } catch (error) {
      throw new SettingsServiceError(
        'UNAUTHORIZED',
        error instanceof Error ? error.message : 'Admin authorization required.'
      );
    }
  }

  async getPublicBrandingAndSettings(): Promise<PublicApplicationSettings> {
    const db = getFirestoreDb();
    if (!db) {
      return toPublicSettings(createDefaultFirebaseSettings());
    }
    try {
      const snap = await getDoc(doc(db, 'applicationSettings', SETTINGS_DOC_ID));
      if (!snap.exists()) {
        return toPublicSettings(createDefaultFirebaseSettings());
      }
      const data = snap.data() as ApplicationSettings;
      return toPublicSettings({
        ...createDefaultFirebaseSettings(),
        ...data,
        environmentMode: 'firebase_connected',
      });
    } catch {
      return toPublicSettings(createDefaultFirebaseSettings());
    }
  }

  subscribePublicSettings(
    onChange: (settings: PublicApplicationSettings) => void
  ): () => void {
    const db = getFirestoreDb();
    if (!db) {
      return () => undefined;
    }
    return onSnapshot(
      doc(db, 'applicationSettings', SETTINGS_DOC_ID),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ApplicationSettings;
          onChange(
            toPublicSettings({
              ...createDefaultFirebaseSettings(),
              ...data,
              environmentMode: 'firebase_connected',
            })
          );
        }
      },
      () => undefined
    );
  }

  async getApplicationSettings(actor: AuthPrincipal | null): Promise<ApplicationSettings> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(
      OperationType.GET,
      `applicationSettings/${SETTINGS_DOC_ID}`,
      async () => {
        const snap = await getDoc(doc(db, 'applicationSettings', SETTINGS_DOC_ID));
        if (!snap.exists()) {
          return createDefaultFirebaseSettings();
        }
        return {
          ...createDefaultFirebaseSettings(),
          ...(snap.data() as Partial<ApplicationSettings>),
          id: SETTINGS_DOC_ID,
          environmentMode: 'firebase_connected',
        };
      }
    );
  }

  private async persistSettingsAndAudit(
    actor: AuthPrincipal,
    nextSettings: ApplicationSettings,
    category: SettingsAuditCategory,
    action: string,
    summary: string,
    previousValues: string,
    newValues: string
  ): Promise<ApplicationSettings> {
    const db = requireFirestoreDb();
    const adminUids = await getActiveAdminUids(db);
    const nowIso = new Date().toISOString();

    const payload: ApplicationSettings = {
      ...nextSettings,
      id: SETTINGS_DOC_ID,
      updatedBy: actor.loginId,
      updatedAt: nowIso,
      environmentMode: 'firebase_connected',
    };

    const auditId = generateSafeDocId('SAUD');

    await withFirestoreErrorHandling(
      OperationType.WRITE,
      `applicationSettings/${SETTINGS_DOC_ID}`,
      async () => {
        await setDoc(doc(db, 'applicationSettings', SETTINGS_DOC_ID), stripUndefinedFields(payload as unknown as Record<string, unknown>));
        await setDoc(doc(db, 'settingsAudit', auditId), {
          id: auditId,
          actorId: actor.loginId,
          actorRole: 'admin',
          action,
          category,
          summary,
          previousValues,
          newValues,
          adminUids,
          createdAt: nowIso,
          timestamp: nowIso,
        });
      }
    );

    return payload;
  }

  async updateCentreProfile(
    actor: AuthPrincipal | null,
    input: CentreProfile
  ): Promise<ApplicationSettings> {
    const admin = this.ensureAdmin(actor);
    const centreName = (input.centreName ?? '').trim();
    const shortName = (input.shortName ?? '').trim();
    const tagline = (input.tagline ?? '').trim();
    if (centreName.length < 2 || centreName.length > 100) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Centre name must be between 2 and 100 characters.'
      );
    }
    if (shortName.length < 2 || shortName.length > 30) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Short name must be between 2 and 30 characters.'
      );
    }
    if (tagline.length > 160) {
      throw new SettingsServiceError('VALIDATION_ERROR', 'Tagline cannot exceed 160 characters.');
    }

    const validatedProfile: CentreProfile = {
      centreName,
      shortName,
      tagline,
      contactNumber: validateOptionalPhone(input.contactNumber, 'Primary contact number'),
      secondaryContactNumber: validateOptionalPhone(
        input.secondaryContactNumber,
        'Secondary contact number'
      ),
      publicEmail: validateOptionalEmail(input.publicEmail),
      address: (input.address ?? '').trim().slice(0, 300),
      city: (input.city ?? '').trim().slice(0, 100),
      state: (input.state ?? '').trim().slice(0, 100),
      pinCode: validateOptionalPin(input.pinCode),
      country: (input.country ?? '').trim().slice(0, 100),
      websiteUrl: validateOptionalUrl(input.websiteUrl),
    };

    const current = await this.getApplicationSettings(actor);
    const updated: ApplicationSettings = {
      ...current,
      centreProfile: validatedProfile,
    };
    return this.persistSettingsAndAudit(
      admin,
      updated,
      'centre_profile',
      'updated_centre_profile',
      `Updated centre profile for ${updated.centreProfile.centreName}`,
      current.centreProfile.centreName,
      updated.centreProfile.centreName
    );
  }

  async updateApplicationBranding(
    actor: AuthPrincipal | null,
    input: ApplicationBranding
  ): Promise<ApplicationSettings> {
    const admin = this.ensureAdmin(actor);
    const displayName = (input.displayName ?? '').trim();
    const shortName = (input.shortName ?? '').trim();
    const tagline = (input.tagline ?? '').trim();
    const loginWelcomeHeading = (input.loginWelcomeHeading ?? '').trim();
    const loginDescription = (input.loginDescription ?? '').trim();
    if (displayName.length < 2 || displayName.length > 100) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Application display name must be between 2 and 100 characters.'
      );
    }
    if (shortName.length < 2 || shortName.length > 30) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Short name must be between 2 and 30 characters.'
      );
    }
    if (tagline.length > 160) {
      throw new SettingsServiceError('VALIDATION_ERROR', 'Tagline cannot exceed 160 characters.');
    }
    if (loginWelcomeHeading.length > 120 || loginDescription.length > 400) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Login heading or description exceeds maximum allowed length.'
      );
    }
    const current = await this.getApplicationSettings(actor);

    const normalizedLogo = { ...input.logoConfiguration };
    if (normalizedLogo.dataUrl) {
      if (
        !ALLOWED_LOGO_DATA_URL_REGEX.test(normalizedLogo.dataUrl) ||
        normalizedLogo.dataUrl.length > 400_000
      ) {
        throw new SettingsServiceError(
          'VALIDATION_ERROR',
          'Logo image must be a valid PNG, JPEG, or WebP file within size limits.'
        );
      }
    }
    if (normalizedLogo.downloadUrl && !/^https:\/\/.+/i.test(normalizedLogo.downloadUrl)) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Logo download URL must use HTTPS.'
      );
    }
    if (
      normalizedLogo.mode === 'custom_local_image' &&
      normalizedLogo.dataUrl &&
      normalizedLogo.dataUrl.startsWith('data:image/')
    ) {
      // If Storage is available and image is a fresh dataUrl, convert and upload cleanly to Firebase Storage
      try {
        const res = await fetch(normalizedLogo.dataUrl);
        const blob = await res.blob();
        const file = new File([blob], normalizedLogo.fileName || 'centre-logo.png', {
          type: blob.type || normalizedLogo.mimeType || 'image/png',
        });
        const uploaded = await firebaseStorageService.uploadValidatedCentreLogo(file, admin.uid);
        normalizedLogo.mode = 'firebase_storage_image';
        normalizedLogo.downloadUrl = uploaded.downloadUrl;
        normalizedLogo.storagePath = uploaded.storagePath;
        normalizedLogo.sizeBytes = uploaded.sizeBytes;
        normalizedLogo.mimeType = uploaded.mimeType;
        normalizedLogo.updatedAt = new Date().toISOString();
        normalizedLogo.storageNotice = FIREBASE_LOGO_NOTICE;
        delete normalizedLogo.dataUrl;
      } catch (storageError) {
        // Storage unavailable or blocked: retain safe explicit notice without claiming cloud sync
        normalizedLogo.storageNotice = `Firebase Storage upload failed (${storageError instanceof Error ? storageError.message : 'unavailable'}). Stored temporarily in browser format until Firebase Storage is enabled.`;
      }
    }

    const updated: ApplicationSettings = {
      ...current,
      applicationBranding: {
        ...input,
        displayName,
        shortName,
        tagline,
        loginWelcomeHeading,
        loginDescription,
        logoConfiguration: normalizedLogo,
      },
    };
    return this.persistSettingsAndAudit(
      admin,
      updated,
      'application_branding',
      'updated_branding',
      `Updated branding (${updated.applicationBranding.displayName})`,
      current.applicationBranding.displayName,
      updated.applicationBranding.displayName
    );
  }

  async updateAppearanceDefaults(
    actor: AuthPrincipal | null,
    input: AppearanceDefaults
  ): Promise<ApplicationSettings> {
    const admin = this.ensureAdmin(actor);
    const current = await this.getApplicationSettings(actor);
    const updated: ApplicationSettings = { ...current, appearanceDefaults: { ...input } };
    return this.persistSettingsAndAudit(
      admin,
      updated,
      'appearance_defaults',
      'updated_appearance_defaults',
      `Default theme set to ${input.defaultTheme}`,
      current.appearanceDefaults.defaultTheme,
      input.defaultTheme
    );
  }

  async updateAcademicDefaults(
    actor: AuthPrincipal | null,
    input: AcademicDefaults
  ): Promise<ApplicationSettings> {
    const admin = this.ensureAdmin(actor);
    const current = await this.getApplicationSettings(actor);
    const updated: ApplicationSettings = { ...current, academicDefaults: { ...input } };
    return this.persistSettingsAndAudit(
      admin,
      updated,
      'academic_defaults',
      'updated_academic_defaults',
      `Academic year set to ${input.academicYearDisplay}`,
      current.academicDefaults.academicYearDisplay,
      input.academicYearDisplay
    );
  }

  async updateNotificationPreferences(
    actor: AuthPrincipal | null,
    input: NotificationPreferences
  ): Promise<ApplicationSettings> {
    const admin = this.ensureAdmin(actor);
    const current = await this.getApplicationSettings(actor);
    const updated: ApplicationSettings = {
      ...current,
      notificationPreferences: { ...input, externalChannelsStatus: 'in_app_firestore' },
    };
    return this.persistSettingsAndAudit(
      admin,
      updated,
      'notification_preferences',
      'updated_notification_preferences',
      `Updated notification preferences (${input.defaultFilterView})`,
      current.notificationPreferences.defaultFilterView,
      input.defaultFilterView
    );
  }

  async resetBrandingToDefaults(actor: AuthPrincipal | null): Promise<ApplicationSettings> {
    const admin = this.ensureAdmin(actor);
    const current = await this.getApplicationSettings(actor);
    if (current.applicationBranding.logoConfiguration.storagePath) {
      await firebaseStorageService.deleteLogoAsset(
        current.applicationBranding.logoConfiguration.storagePath
      );
    }
    const defaults = createDefaultFirebaseSettings();
    const updated: ApplicationSettings = {
      ...current,
      applicationBranding: defaults.applicationBranding,
    };
    return this.persistSettingsAndAudit(
      admin,
      updated,
      'branding_reset',
      'reset_branding',
      'Reset application branding to defaults',
      current.applicationBranding.displayName,
      defaults.applicationBranding.displayName
    );
  }

  async listSettingsAuditHistory(actor: AuthPrincipal | null): Promise<SettingsAuditEntry[]> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'settingsAudit', async () => {
      const snap = await getDocs(query(collection(db, 'settingsAudit'), limit(250)));
      return snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            actorId: String(data.actorId || ''),
            action: String(data.action || ''),
            category: (data.category || 'centre_profile') as SettingsAuditCategory,
            summary: String(data.summary || ''),
            previousValues: String(data.previousValues || ''),
            newValues: String(data.newValues || ''),
            timestamp: String(data.timestamp || data.createdAt || ''),
          };
        })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    });
  }

  async getApplicationIntegrationStatus(
    actor: AuthPrincipal | null
  ): Promise<ApplicationIntegrationStatusItem[]> {
    this.ensureAdmin(actor);
    const cfg = validateAndResolveFirebaseConfig();
    const firestoreState = getFirestoreConnectivitySnapshot();
    const functionsActive = isCloudFunctionsEnabled();
    const storageProbe = await firebaseStorageService.probeBucketAvailability();

    return [
      {
        id: 'firebase-auth',
        name: 'Firebase Authentication',
        purpose: 'Google Sign-In for Admin + Teacher/Student ID & Password on Spark Plan',
        status: cfg.mode === 'FIREBASE_CONNECTED' ? 'existing' : 'not_connected',
        detail:
          cfg.mode === 'FIREBASE_CONNECTED'
            ? 'Connected to academy-0007 Firebase Auth (primary Google Admin session + isolated Spark secondary-app provisioning).'
            : 'Firebase configuration missing.',
      },
      {
        id: 'cloud-firestore',
        name: 'Cloud Firestore',
        purpose: 'Production relational-safe multi-collection database (Spark Free Plan)',
        status: firestoreState.state === 'connected' ? 'existing' : 'not_connected',
        detail: `${firestoreState.message} (Database: ${cfg.config?.firestoreDatabaseId ?? 'unconfigured'})`,
      },
      {
        id: 'firebase-storage',
        name: 'Firebase Storage (Optional)',
        purpose: 'Centre logo upload storage (not required for core modules)',
        status: storageProbe.available ? 'existing' : 'not_connected',
        detail: storageProbe.message,
      },
      {
        id: 'cloud-functions',
        name: 'Cloud Functions (/functions)',
        purpose: 'Excluded in Spark Free Plan Only mode (zero Blaze billing required)',
        status: functionsActive ? 'existing' : 'not_used',
        detail: functionsActive
          ? 'Cloud Functions callable endpoints enabled (VITE_FIREBASE_FUNCTIONS_ENABLED=true).'
          : 'Disabled (VITE_FIREBASE_FUNCTIONS_ENABLED=false). All tuition modules run on the Firebase Spark (free) plan without Cloud Functions.',
      },
      {
        id: 'upi-manual',
        name: 'Direct UPI Link & Manual Verification',
        purpose: 'Fee preparation links verified manually by Admin',
        status: 'existing',
        detail: 'Zero third-party payment gateway or bank APIs.',
      },
      {
        id: 'external-channels',
        name: 'External Messaging (WhatsApp / SMS / Email)',
        purpose: 'Not used in this architecture',
        status: 'not_used',
        detail: 'Notifications remain strictly in-app via Firestore.',
      },
    ];
  }

  async getSystemStatusOverview(
    actor: AuthPrincipal | null
  ): Promise<AdminSystemStatusOverview> {
    this.ensureAdmin(actor);
    const db = requireFirestoreDb();
    return withFirestoreErrorHandling(OperationType.LIST, 'systemOverview', async () => {
      const [usersSnap, classesSnap, batchesSnap, subjectsSnap, ttSnap, feeCfgSnap, upiSnap, claimsSnap] =
        await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'classes')),
          getDocs(collection(db, 'batches')),
          getDocs(collection(db, 'subjects')),
          getDocs(collection(db, 'timetableEntries')),
          getDocs(collection(db, 'feeConfigurations')),
          getDocs(collection(db, 'upiConfigurations')),
          getDocs(collection(db, 'paymentClaims')),
        ]);

      const users = usersSnap.docs.map((d) => d.data());
      const activeFee = feeCfgSnap.docs.find((d) => d.data().status === 'active');
      const activeUpi = upiSnap.docs.find((d) => d.data().status === 'active');
      const pendingClaims = claimsSnap.docs.filter(
        (d) => d.data().status === 'verification_pending'
      ).length;

      return {
        activeTeachersCount: users.filter((u) => u.role === 'teacher' && u.status === 'active')
          .length,
        activeStudentsCount: users.filter((u) => u.role === 'student' && u.status === 'active')
          .length,
        configuredClassesCount: classesSnap.size,
        configuredBatchesCount: batchesSnap.size,
        configuredSubjectsCount: subjectsSnap.size,
        activeTimetableEntriesCount: ttSnap.docs.filter((d) => d.data().status === 'active').length,
        feeConfigStatusLabel: activeFee
          ? `Configured (${activeFee.data().billingFrequency || activeFee.data().frequency || 'active'})`
          : 'Not configured',
        upiConfigStatusLabel: activeUpi ? String(activeUpi.data().upiId || 'Active') : 'Not configured',
        pendingClaimsCount: pendingClaims,
      };
    });
  }
}

export const firebaseSettingsService = new FirebaseSettingsService();
