import { isValidAccentPaletteId, normalizeAccentPaletteId } from '../../design/palettes';
import { hasPermission } from '../../types';
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
import { validateRequiredText } from '../../utils/validation';
import {
  type IApplicationSettingsService,
  SettingsServiceError,
} from '../contracts/settingsService';
import { LocalAcademicStore, sharedLocalAcademicStore } from './localAcademicStore';
import { LocalAccountStore, sharedLocalAccountStore } from './localAccountStore';
import { LocalFinanceStore, sharedLocalFinanceStore } from './localFinanceStore';
import {
  APP_SETTINGS_SCHEMA_VERSION,
  cloneSettings,
  createDefaultApplicationSettings,
  LOCAL_LOGO_NOTICE,
  LocalSettingsStore,
  sharedLocalSettingsStore,
} from './localSettingsStore';

const PHONE_REGEX = /^[+\d\s().-]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_REGEX = /^[A-Za-z0-9\s-]{4,10}$/;
const MAX_LOGO_BYTES = 256 * 1024;
const ALLOWED_LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function validateOptionalPhone(value: string, label: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!PHONE_REGEX.test(trimmed) || digits.length < 7 || digits.length > 15) {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      `${label} must be a valid phone number (7–15 digits) or left blank.`,
      field
    );
  }
  return trimmed;
}

function validateOptionalEmail(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!EMAIL_REGEX.test(trimmed)) {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      'Public contact email must be a valid email address or left blank.',
      field
    );
  }
  return trimmed;
}

function validateOptionalUrl(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      'Website URL must start with http:// or https:// or be left blank.',
      field
    );
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) {
      throw new Error('Invalid host');
    }
  } catch {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      'Website URL must be a valid web address.',
      field
    );
  }
  return trimmed;
}

function validateOptionalPin(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!PIN_REGEX.test(trimmed)) {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      'PIN / postal code must be 4–10 characters or left blank.',
      field
    );
  }
  return trimmed;
}

function formatAuditId(seq: number): string {
  return `SAUD-${String(seq).padStart(4, '0')}`;
}

function validateBoundedText(
  value: string,
  label: string,
  minLen: number,
  maxLen: number,
  field: string
): string {
  const base = validateRequiredText(value, label, minLen);
  if (!base.valid) {
    throw new SettingsServiceError('VALIDATION_ERROR', base.error!, field);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new SettingsServiceError(
      'VALIDATION_ERROR',
      `${label} cannot exceed ${maxLen} characters.`,
      field
    );
  }
  return trimmed;
}

export interface LocalSettingsServiceDependencies {
  settingsStore?: LocalSettingsStore;
  accountStore?: LocalAccountStore;
  academicStore?: LocalAcademicStore;
  financeStore?: LocalFinanceStore;
}

export class LocalDevApplicationSettingsService implements IApplicationSettingsService {
  private readonly store: LocalSettingsStore;
  private readonly accountStore: LocalAccountStore;
  private readonly academicStore: LocalAcademicStore;
  private readonly financeStore: LocalFinanceStore;

  constructor(deps: LocalSettingsServiceDependencies = {}) {
    this.store = deps.settingsStore ?? sharedLocalSettingsStore;
    this.accountStore = deps.accountStore ?? sharedLocalAccountStore;
    this.academicStore = deps.academicStore ?? sharedLocalAcademicStore;
    this.financeStore = deps.financeStore ?? sharedLocalFinanceStore;
  }

  private requireAdminActor(actor: AuthPrincipal | null): AuthPrincipal {
    if (
      !actor ||
      actor.role !== 'admin' ||
      actor.status !== 'active' ||
      !hasPermission(actor.role, 'branding:configure')
    ) {
      throw new SettingsServiceError(
        'UNAUTHORIZED',
        'Access denied. Only active Administrators may view or modify application settings.'
      );
    }
    const principal = this.accountStore.findAuthPrincipalByLoginId(actor.loginId);
    if (!principal || principal.role !== 'admin' || principal.status !== 'active') {
      throw new SettingsServiceError(
        'UNAUTHORIZED',
        'Active Administrator account verification failed.'
      );
    }
    return actor;
  }

  private appendAudit(
    actorId: string,
    action: string,
    category: SettingsAuditCategory,
    summary: string,
    previousValues: string,
    newValues: string
  ): void {
    const id = formatAuditId(this.store.auditSeq);
    this.store.auditSeq += 1;
    const entry: SettingsAuditEntry = {
      id,
      actorId,
      action,
      category,
      summary,
      previousValues,
      newValues,
      timestamp: new Date().toISOString(),
    };
    this.store.auditEntries = [entry, ...this.store.auditEntries];
  }

  async getPublicBrandingAndSettings(): Promise<PublicApplicationSettings> {
    const cloned = cloneSettings(this.store.settings);
    return {
      centreProfile: cloned.centreProfile,
      applicationBranding: cloned.applicationBranding,
      appearanceDefaults: cloned.appearanceDefaults,
      academicDefaults: cloned.academicDefaults,
      notificationPreferences: cloned.notificationPreferences,
      updatedAt: cloned.updatedAt,
      environmentMode: cloned.environmentMode,
    };
  }

  async getApplicationSettings(
    actor: AuthPrincipal | null
  ): Promise<ApplicationSettings> {
    this.requireAdminActor(actor);
    return cloneSettings(this.store.settings);
  }

  async updateCentreProfile(
    actor: AuthPrincipal | null,
    input: CentreProfile
  ): Promise<ApplicationSettings> {
    const admin = this.requireAdminActor(actor);

    const centreName = validateBoundedText(
      input.centreName,
      'Tuition centre name',
      2,
      100,
      'centreName'
    );
    const shortName = validateBoundedText(
      input.shortName,
      'Short name',
      2,
      30,
      'shortName'
    );

    const tagline = input.tagline.trim();
    if (tagline.length > 120) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Tagline cannot exceed 120 characters.',
        'tagline'
      );
    }

    const validated: CentreProfile = {
      centreName,
      shortName,
      tagline,
      contactNumber: validateOptionalPhone(
        input.contactNumber,
        'Primary contact number',
        'contactNumber'
      ),
      secondaryContactNumber: validateOptionalPhone(
        input.secondaryContactNumber,
        'Secondary contact number',
        'secondaryContactNumber'
      ),
      publicEmail: validateOptionalEmail(input.publicEmail, 'publicEmail'),
      address: input.address.trim().slice(0, 200),
      city: input.city.trim().slice(0, 60),
      state: input.state.trim().slice(0, 60),
      pinCode: validateOptionalPin(input.pinCode, 'pinCode'),
      country: input.country.trim().slice(0, 60),
      websiteUrl: validateOptionalUrl(input.websiteUrl, 'websiteUrl'),
    };

    const prev = this.store.settings.centreProfile;
    const nowIso = new Date().toISOString();

    this.store.settings = {
      ...cloneSettings(this.store.settings),
      centreProfile: validated,
      updatedBy: admin.loginId,
      updatedAt: nowIso,
      schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    };

    // Sync active centre name for newly generated receipts without mutating existing paid records
    this.financeStore.centreName = validated.centreName;

    this.appendAudit(
      admin.loginId,
      'updated_centre_profile',
      'centre_profile',
      `Updated tuition centre profile (${validated.centreName})`,
      `${prev.centreName} (${prev.shortName})${prev.contactNumber ? ` · ${prev.contactNumber}` : ''}`,
      `${validated.centreName} (${validated.shortName})${validated.contactNumber ? ` · ${validated.contactNumber}` : ''}`
    );
    this.store.save();

    return cloneSettings(this.store.settings);
  }

  async updateApplicationBranding(
    actor: AuthPrincipal | null,
    input: ApplicationBranding
  ): Promise<ApplicationSettings> {
    const admin = this.requireAdminActor(actor);

    const displayName = validateBoundedText(
      input.displayName,
      'Application display name',
      2,
      80,
      'displayName'
    );
    const shortName = validateBoundedText(
      input.shortName,
      'Short application name',
      2,
      30,
      'shortName'
    );
    const loginWelcomeHeading = validateBoundedText(
      input.loginWelcomeHeading,
      'Login welcome heading',
      2,
      80,
      'loginWelcomeHeading'
    );
    const loginDescription = validateBoundedText(
      input.loginDescription,
      'Login supporting description',
      5,
      240,
      'loginDescription'
    );

    const tagline = input.tagline.trim();
    if (tagline.length > 120) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Application tagline cannot exceed 120 characters.',
        'tagline'
      );
    }

    let normalizedLogo = {
      mode: 'default_icon' as const,
      storageNotice: LOCAL_LOGO_NOTICE,
    } as ApplicationBranding['logoConfiguration'];

    if (input.logoConfiguration?.mode === 'custom_local_image') {
      const dataUrl = input.logoConfiguration.dataUrl ?? '';
      const mimeType = input.logoConfiguration.mimeType;
      const sizeBytes = input.logoConfiguration.sizeBytes ?? dataUrl.length;

      if (!mimeType || !ALLOWED_LOGO_MIMES.has(mimeType)) {
        throw new SettingsServiceError(
          'VALIDATION_ERROR',
          'Logo image must be PNG, JPEG, or WebP.',
          'logoConfiguration'
        );
      }
      if (!/^data:image\/(png|jpeg|webp);base64,/i.test(dataUrl)) {
        throw new SettingsServiceError(
          'VALIDATION_ERROR',
          'Invalid local image format for logo.',
          'logoConfiguration'
        );
      }
      if (sizeBytes > MAX_LOGO_BYTES || dataUrl.length > MAX_LOGO_BYTES * 1.45) {
        throw new SettingsServiceError(
          'VALIDATION_ERROR',
          'Logo image file size must be 250 KB or smaller for local demo storage.',
          'logoConfiguration'
        );
      }
      normalizedLogo = {
        mode: 'custom_local_image',
        dataUrl,
        fileName: input.logoConfiguration.fileName?.trim() || 'centre-logo',
        mimeType,
        sizeBytes,
        updatedAt: new Date().toISOString(),
        storageNotice: LOCAL_LOGO_NOTICE,
      };
    }

    const validated: ApplicationBranding = {
      displayName,
      shortName,
      tagline,
      loginWelcomeHeading,
      loginDescription,
      logoConfiguration: normalizedLogo,
    };

    const prev = this.store.settings.applicationBranding;
    const nowIso = new Date().toISOString();

    this.store.settings = {
      ...cloneSettings(this.store.settings),
      applicationBranding: validated,
      updatedBy: admin.loginId,
      updatedAt: nowIso,
      schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    };

    this.appendAudit(
      admin.loginId,
      'updated_application_branding',
      'application_branding',
      `Updated application branding (${validated.displayName})`,
      `${prev.displayName} · Logo: ${prev.logoConfiguration.mode}`,
      `${validated.displayName} · Logo: ${validated.logoConfiguration.mode}`
    );
    this.store.save();

    return cloneSettings(this.store.settings);
  }

  async updateAppearanceDefaults(
    actor: AuthPrincipal | null,
    input: AppearanceDefaults
  ): Promise<ApplicationSettings> {
    const admin = this.requireAdminActor(actor);

    if (input.defaultTheme !== 'light' && input.defaultTheme !== 'dark') {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Default theme must be either light or dark.',
        'defaultTheme'
      );
    }

    if (
      input.defaultAccentPalette !== undefined &&
      !isValidAccentPaletteId(input.defaultAccentPalette)
    ) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Default accent palette is invalid.',
        'defaultAccentPalette'
      );
    }

    const prev = this.store.settings.appearanceDefaults;
    const validated: AppearanceDefaults = {
      defaultTheme: input.defaultTheme,
      defaultAccentPalette:
        input.defaultAccentPalette ??
        normalizeAccentPaletteId(prev.defaultAccentPalette),
      allowPersonalThemePreference: Boolean(input.allowPersonalThemePreference),
    };

    const nowIso = new Date().toISOString();

    this.store.settings = {
      ...cloneSettings(this.store.settings),
      appearanceDefaults: validated,
      updatedBy: admin.loginId,
      updatedAt: nowIso,
      schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    };

    this.appendAudit(
      admin.loginId,
      'updated_appearance_defaults',
      'appearance_defaults',
      `Default theme set to ${validated.defaultTheme} · palette ${validated.defaultAccentPalette} (personal override: ${
        validated.allowPersonalThemePreference ? 'allowed' : 'locked'
      })`,
      `theme=${prev.defaultTheme}, palette=${normalizeAccentPaletteId(prev.defaultAccentPalette)}, personal=${prev.allowPersonalThemePreference}`,
      `theme=${validated.defaultTheme}, palette=${validated.defaultAccentPalette}, personal=${validated.allowPersonalThemePreference}`
    );
    this.store.save();

    return cloneSettings(this.store.settings);
  }

  async updateAcademicDefaults(
    actor: AuthPrincipal | null,
    input: AcademicDefaults
  ): Promise<ApplicationSettings> {
    const admin = this.requireAdminActor(actor);

    const academicYearDisplay = validateBoundedText(
      input.academicYearDisplay,
      'Academic year display',
      4,
      60,
      'academicYearDisplay'
    );

    if (input.defaultTimetableView !== 'weekly' && input.defaultTimetableView !== 'today') {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Default timetable view must be weekly or today.',
        'defaultTimetableView'
      );
    }

    const termLabel = input.academicTermLabel.trim();
    if (termLabel.length > 60) {
      throw new SettingsServiceError(
        'VALIDATION_ERROR',
        'Academic term label cannot exceed 60 characters.',
        'academicTermLabel'
      );
    }

    const validated: AcademicDefaults = {
      academicYearDisplay,
      defaultTimetableView: input.defaultTimetableView,
      academicTermLabel: termLabel,
    };

    const prev = this.store.settings.academicDefaults;
    const nowIso = new Date().toISOString();

    this.store.settings = {
      ...cloneSettings(this.store.settings),
      academicDefaults: validated,
      updatedBy: admin.loginId,
      updatedAt: nowIso,
      schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    };

    this.appendAudit(
      admin.loginId,
      'updated_academic_defaults',
      'academic_defaults',
      `Updated academic defaults (${validated.academicYearDisplay})`,
      `${prev.academicYearDisplay} · timetable=${prev.defaultTimetableView}`,
      `${validated.academicYearDisplay} · timetable=${validated.defaultTimetableView}`
    );
    this.store.save();

    return cloneSettings(this.store.settings);
  }

  async updateNotificationPreferences(
    actor: AuthPrincipal | null,
    input: NotificationPreferences
  ): Promise<ApplicationSettings> {
    const admin = this.requireAdminActor(actor);

    const validated: NotificationPreferences = {
      enabledCategories: {
        attendance: Boolean(input.enabledCategories?.attendance),
        homeworkTests: Boolean(input.enabledCategories?.homeworkTests),
        examsResults: Boolean(input.enabledCategories?.examsResults),
        feesReceipts: Boolean(input.enabledCategories?.feesReceipts),
      },
      defaultFilterView:
        input.defaultFilterView === 'unread_only' ? 'unread_only' : 'all',
      showUnreadBadgesInNavigation: Boolean(input.showUnreadBadgesInNavigation),
      externalChannelsStatus: 'disabled_local_demo',
    };

    const prev = this.store.settings.notificationPreferences;
    const nowIso = new Date().toISOString();

    this.store.settings = {
      ...cloneSettings(this.store.settings),
      notificationPreferences: validated,
      updatedBy: admin.loginId,
      updatedAt: nowIso,
      schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    };

    this.appendAudit(
      admin.loginId,
      'updated_notification_preferences',
      'notification_preferences',
      'Updated in-app notification visibility preferences',
      `att=${prev.enabledCategories.attendance}, hw=${prev.enabledCategories.homeworkTests}, ex=${prev.enabledCategories.examsResults}, fee=${prev.enabledCategories.feesReceipts}, filter=${prev.defaultFilterView}`,
      `att=${validated.enabledCategories.attendance}, hw=${validated.enabledCategories.homeworkTests}, ex=${validated.enabledCategories.examsResults}, fee=${validated.enabledCategories.feesReceipts}, filter=${validated.defaultFilterView}`
    );
    this.store.save();

    return cloneSettings(this.store.settings);
  }

  async resetBrandingToDefaults(
    actor: AuthPrincipal | null
  ): Promise<ApplicationSettings> {
    const admin = this.requireAdminActor(actor);
    const defaults = createDefaultApplicationSettings();
    const prev = this.store.settings.applicationBranding;
    const nowIso = new Date().toISOString();

    this.store.settings = {
      ...cloneSettings(this.store.settings),
      applicationBranding: defaults.applicationBranding,
      updatedBy: admin.loginId,
      updatedAt: nowIso,
      schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    };

    this.appendAudit(
      admin.loginId,
      'reset_branding_to_defaults',
      'branding_reset',
      'Restored default application branding and logo icon',
      `${prev.displayName} (${prev.logoConfiguration.mode})`,
      `${defaults.applicationBranding.displayName} (${defaults.applicationBranding.logoConfiguration.mode})`
    );
    this.store.save();

    return cloneSettings(this.store.settings);
  }

  async listSettingsAuditHistory(
    actor: AuthPrincipal | null
  ): Promise<SettingsAuditEntry[]> {
    this.requireAdminActor(actor);
    return this.store.auditEntries.map((entry) => ({ ...entry }));
  }

  async getApplicationIntegrationStatus(
    actor: AuthPrincipal | null
  ): Promise<ApplicationIntegrationStatusItem[]> {
    this.requireAdminActor(actor);
    return [
      {
        id: 'react-ts-vite',
        name: 'React 19, TypeScript, Vite 8 & Tailwind CSS v4',
        purpose: 'UI components, Dual-Theme Design System & responsive shells',
        status: 'existing',
        detail: 'Active and compiled.',
      },
      {
        id: 'local-adapters',
        name: 'Local Development Adapters (tuition_ecosystem_dev_*)',
        purpose: 'Device-local DEMO DATA persistence for accounts, academics, attendance, assessments, finance & settings',
        status: 'local_only',
        detail: 'Browser storage only; does not sync across devices.',
      },
      {
        id: 'firebase-auth',
        name: 'Firebase Authentication',
        purpose: 'Production identity authentication & password recovery',
        status: 'not_connected',
        detail: 'Disconnected until manually connected in Phase 10.',
      },
      {
        id: 'cloud-firestore',
        name: 'Cloud Firestore',
        purpose: 'Production cloud database & role security rules',
        status: 'not_connected',
        detail: 'Disconnected until manually connected in Phase 10.',
      },
      {
        id: 'cloud-functions',
        name: 'Cloud Functions / Scheduled Jobs',
        purpose: 'Trusted server triggers, verification & scheduled reminders',
        status: 'not_connected',
        detail: 'Disconnected; required before production launch.',
      },
      {
        id: 'firebase-storage',
        name: 'Firebase Storage',
        purpose: 'Cross-device logo & asset storage',
        status: 'not_connected',
        detail: 'Disconnected; logos remain browser-local demo data.',
      },
      {
        id: 'payment-gateway',
        name: 'Payment Gateways / Bank APIs',
        purpose: 'Automated UPI verification or bank webhooks',
        status: 'not_used',
        detail: 'Excluded; Admin manual verification only.',
      },
      {
        id: 'ai-apis',
        name: 'AI APIs (Gemini / OpenAI / Others)',
        purpose: 'AI generation or tutoring assistants',
        status: 'not_used',
        detail: 'Not connected or used in this application.',
      },
      {
        id: 'external-messaging',
        name: 'WhatsApp / SMS / Email Services',
        purpose: 'External parent or student messaging',
        status: 'not_used',
        detail: 'In-app notifications only; external channels not connected.',
      },
      {
        id: 'postgresql',
        name: 'PostgreSQL / External SQL Database',
        purpose: 'Relational database engine',
        status: 'not_used',
        detail: 'Not used in this architecture.',
      },
    ];
  }

  async getSystemStatusOverview(
    actor: AuthPrincipal | null
  ): Promise<AdminSystemStatusOverview> {
    this.requireAdminActor(actor);

    const allAccounts = this.accountStore.getAllAccounts();
    const activeTeachersCount = allAccounts.filter(
      (a) => a.role === 'teacher' && a.status === 'active'
    ).length;
    const activeStudentsCount = allAccounts.filter(
      (a) => a.role === 'student' && a.status === 'active'
    ).length;

    const configuredClassesCount = this.academicStore.classes.filter(
      (c) => c.status === 'active'
    ).length;
    const configuredBatchesCount = this.academicStore.batches.filter(
      (b) => b.status === 'active'
    ).length;
    const configuredSubjectsCount = this.academicStore.subjects.filter(
      (s) => s.status === 'active'
    ).length;
    const activeTimetableEntriesCount = this.academicStore.timetable.filter(
      (t) => t.status === 'active'
    ).length;

    const activeFeeConfig = this.financeStore.feeConfigurations.find(
      (c) => c.status === 'active'
    );
    const activeUpi = this.financeStore.upiConfigurations[0];
    const pendingClaimsCount = this.financeStore.paymentClaims.filter(
      (c) => c.status === 'verification_pending'
    ).length;

    return {
      activeTeachersCount,
      activeStudentsCount,
      configuredClassesCount,
      configuredBatchesCount,
      configuredSubjectsCount,
      activeTimetableEntriesCount,
      feeConfigStatusLabel: activeFeeConfig
        ? `₹${(activeFeeConfig.amountPaise / 100).toLocaleString('en-IN')} / ${activeFeeConfig.frequency}`
        : 'Not configured',
      upiConfigStatusLabel:
        activeUpi && activeUpi.status === 'active'
          ? `Active (${activeUpi.upiId})`
          : activeUpi
            ? `Inactive (${activeUpi.upiId})`
            : 'Not configured',
      pendingClaimsCount,
    };
  }
}

export const localSettingsService = new LocalDevApplicationSettingsService();
