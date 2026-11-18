import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
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
    if (!input.centreName.trim() || !input.shortName.trim()) {
      throw new SettingsServiceError('VALIDATION_ERROR', 'Centre name and short name are required.');
    }
    const current = await this.getApplicationSettings(actor);
    const updated: ApplicationSettings = {
      ...current,
      centreProfile: { ...input, centreName: input.centreName.trim(), shortName: input.shortName.trim() },
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
    if (!input.displayName.trim() || !input.shortName.trim()) {
      throw new SettingsServiceError('VALIDATION_ERROR', 'Display name and short name are required.');
    }
    const current = await this.getApplicationSettings(actor);

    const normalizedLogo = { ...input.logoConfiguration };
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
        displayName: input.displayName.trim(),
        shortName: input.shortName.trim(),
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
      const snap = await getDocs(collection(db, 'settingsAudit'));
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

    return [
      {
        id: 'firebase-auth',
        name: 'Firebase Authentication',
        purpose: 'Verified ID/Password and operator authentication for academy-0007',
        status: cfg.mode === 'FIREBASE_CONNECTED' ? 'existing' : 'not_connected',
        detail:
          cfg.mode === 'FIREBASE_CONNECTED'
            ? 'Connected to academy-0007 Firebase Auth.'
            : 'Firebase configuration missing.',
      },
      {
        id: 'cloud-firestore',
        name: 'Cloud Firestore',
        purpose: 'Production relational-safe multi-collection database',
        status: firestoreState.state === 'connected' ? 'existing' : 'not_connected',
        detail: `${firestoreState.message} (Database: ${cfg.config?.firestoreDatabaseId ?? 'unconfigured'})`,
      },
      {
        id: 'firebase-storage',
        name: 'Firebase Storage',
        purpose: 'Restricted institutional logo storage (branding/centre-logo)',
        status: firebaseStorageService.isConnected() ? 'existing' : 'not_connected',
        detail: firebaseStorageService.isConnected()
          ? `Bucket ${cfg.config?.storageBucket} configured with Admin-only write rules.`
          : 'Storage bucket not initialized.',
      },
      {
        id: 'cloud-functions',
        name: 'Cloud Functions (/functions)',
        purpose: 'Server-side account provisioning, password resets & atomic payment/salary verification',
        status: functionsActive ? 'existing' : 'not_connected',
        detail: functionsActive
          ? 'Cloud Functions callable endpoints enabled (VITE_FIREBASE_FUNCTIONS_ENABLED=true).'
          : 'Source ready in /functions; requires Firebase Blaze plan deployment and VITE_FIREBASE_FUNCTIONS_ENABLED=true.',
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
