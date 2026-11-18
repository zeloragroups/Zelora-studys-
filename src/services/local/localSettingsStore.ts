import { DEFAULT_BRANDING_CONFIG } from '../../config/branding';
import type { ApplicationSettings, SettingsAuditEntry } from '../../types';

export const APP_SETTINGS_STORAGE_KEY = 'tuition_ecosystem_dev_app_settings_v1';
export const APP_SETTINGS_SCHEMA_VERSION = 1;

export const LOCAL_LOGO_NOTICE =
  'Device-local demo configuration only — stored in this browser and not synced across devices until Firebase Storage is connected in Phase 10.';

export function createDefaultApplicationSettings(): ApplicationSettings {
  return {
    id: 'APP-SETTINGS-001',
    centreProfile: {
      centreName: DEFAULT_BRANDING_CONFIG.centreName,
      shortName: DEFAULT_BRANDING_CONFIG.shortName,
      tagline: DEFAULT_BRANDING_CONFIG.tagline,
      contactNumber: '',
      secondaryContactNumber: '',
      publicEmail: '',
      address: '',
      city: '',
      state: '',
      pinCode: '',
      country: '',
      websiteUrl: '',
    },
    applicationBranding: {
      displayName: DEFAULT_BRANDING_CONFIG.centreName,
      shortName: DEFAULT_BRANDING_CONFIG.shortName,
      tagline: DEFAULT_BRANDING_CONFIG.tagline,
      loginWelcomeHeading: 'Welcome Back',
      loginDescription:
        "Sign in with your assigned Teacher ID or Student ID. Parents use their child's Student ID and password.",
      logoConfiguration: {
        mode: 'default_icon',
        storageNotice: LOCAL_LOGO_NOTICE,
      },
    },
    appearanceDefaults: {
      defaultTheme: 'light',
      allowPersonalThemePreference: true,
    },
    academicDefaults: {
      academicYearDisplay: DEFAULT_BRANDING_CONFIG.academicYearLabel,
      defaultTimetableView: 'weekly',
      academicTermLabel: 'Annual Academic Session',
    },
    notificationPreferences: {
      enabledCategories: {
        attendance: true,
        homeworkTests: true,
        examsResults: true,
        feesReceipts: true,
      },
      defaultFilterView: 'all',
      showUnreadBadgesInNavigation: true,
      externalChannelsStatus: 'disabled_local_demo',
    },
    updatedBy: 'SYSTEM-DEFAULT',
    updatedAt: '2026-11-01T00:00:00.000Z',
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    environmentMode: 'local_demo_adapter',
  };
}

interface PersistedSettingsState {
  schemaVersion: number;
  demoDataLabel: 'DEMO DATA';
  settings: ApplicationSettings;
  auditEntries: SettingsAuditEntry[];
  auditSeq: number;
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

export function cloneSettings(settings: ApplicationSettings): ApplicationSettings {
  return {
    ...settings,
    centreProfile: { ...settings.centreProfile },
    applicationBranding: {
      ...settings.applicationBranding,
      logoConfiguration: { ...settings.applicationBranding.logoConfiguration },
    },
    appearanceDefaults: { ...settings.appearanceDefaults },
    academicDefaults: { ...settings.academicDefaults },
    notificationPreferences: {
      ...settings.notificationPreferences,
      enabledCategories: { ...settings.notificationPreferences.enabledCategories },
    },
  };
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function sanitizeRestoredSettings(raw: unknown): ApplicationSettings {
  const defaults = createDefaultApplicationSettings();
  if (!isPlainRecord(raw)) {
    return defaults;
  }

  const cp = isPlainRecord(raw.centreProfile) ? raw.centreProfile : {};
  const ab = isPlainRecord(raw.applicationBranding) ? raw.applicationBranding : {};
  const logoRaw = isPlainRecord(ab.logoConfiguration) ? ab.logoConfiguration : {};
  const ap = isPlainRecord(raw.appearanceDefaults) ? raw.appearanceDefaults : {};
  const ac = isPlainRecord(raw.academicDefaults) ? raw.academicDefaults : {};
  const np = isPlainRecord(raw.notificationPreferences)
    ? raw.notificationPreferences
    : {};
  const npCats = isPlainRecord(np.enabledCategories) ? np.enabledCategories : {};

  const str = (v: unknown, fallback: string) =>
    typeof v === 'string' ? v : fallback;
  const nonEmptyStr = (v: unknown, fallback: string) =>
    typeof v === 'string' && v.trim().length > 0 ? v : fallback;

  const validLogo =
    logoRaw.mode === 'custom_local_image' &&
    typeof logoRaw.dataUrl === 'string' &&
    /^data:image\/(png|jpeg|webp);base64,/i.test(logoRaw.dataUrl);

  return {
    id: 'APP-SETTINGS-001',
    centreProfile: {
      centreName: nonEmptyStr(cp.centreName, defaults.centreProfile.centreName),
      shortName: nonEmptyStr(cp.shortName, defaults.centreProfile.shortName),
      tagline: str(cp.tagline, defaults.centreProfile.tagline),
      contactNumber: str(cp.contactNumber, ''),
      secondaryContactNumber: str(cp.secondaryContactNumber, ''),
      publicEmail: str(cp.publicEmail, ''),
      address: str(cp.address, ''),
      city: str(cp.city, ''),
      state: str(cp.state, ''),
      pinCode: str(cp.pinCode, ''),
      country: str(cp.country, ''),
      websiteUrl: str(cp.websiteUrl, ''),
    },
    applicationBranding: {
      displayName: nonEmptyStr(
        ab.displayName,
        defaults.applicationBranding.displayName
      ),
      shortName: nonEmptyStr(ab.shortName, defaults.applicationBranding.shortName),
      tagline: str(ab.tagline, defaults.applicationBranding.tagline),
      loginWelcomeHeading: nonEmptyStr(
        ab.loginWelcomeHeading,
        defaults.applicationBranding.loginWelcomeHeading
      ),
      loginDescription: nonEmptyStr(
        ab.loginDescription,
        defaults.applicationBranding.loginDescription
      ),
      logoConfiguration: validLogo
        ? {
            mode: 'custom_local_image',
            dataUrl: logoRaw.dataUrl as string,
            fileName: typeof logoRaw.fileName === 'string' ? logoRaw.fileName : undefined,
            mimeType:
              logoRaw.mimeType === 'image/png' ||
              logoRaw.mimeType === 'image/jpeg' ||
              logoRaw.mimeType === 'image/webp'
                ? logoRaw.mimeType
                : undefined,
            sizeBytes:
              typeof logoRaw.sizeBytes === 'number' ? logoRaw.sizeBytes : undefined,
            updatedAt:
              typeof logoRaw.updatedAt === 'string' ? logoRaw.updatedAt : undefined,
            storageNotice: LOCAL_LOGO_NOTICE,
          }
        : {
            mode: 'default_icon',
            storageNotice: LOCAL_LOGO_NOTICE,
          },
    },
    appearanceDefaults: {
      defaultTheme: ap.defaultTheme === 'dark' ? 'dark' : 'light',
      allowPersonalThemePreference:
        typeof ap.allowPersonalThemePreference === 'boolean'
          ? ap.allowPersonalThemePreference
          : true,
    },
    academicDefaults: {
      academicYearDisplay: nonEmptyStr(
        ac.academicYearDisplay,
        defaults.academicDefaults.academicYearDisplay
      ),
      defaultTimetableView: ac.defaultTimetableView === 'today' ? 'today' : 'weekly',
      academicTermLabel: str(
        ac.academicTermLabel,
        defaults.academicDefaults.academicTermLabel
      ),
    },
    notificationPreferences: {
      enabledCategories: {
        attendance:
          typeof npCats.attendance === 'boolean' ? npCats.attendance : true,
        homeworkTests:
          typeof npCats.homeworkTests === 'boolean' ? npCats.homeworkTests : true,
        examsResults:
          typeof npCats.examsResults === 'boolean' ? npCats.examsResults : true,
        feesReceipts:
          typeof npCats.feesReceipts === 'boolean' ? npCats.feesReceipts : true,
      },
      defaultFilterView:
        np.defaultFilterView === 'unread_only' ? 'unread_only' : 'all',
      showUnreadBadgesInNavigation:
        typeof np.showUnreadBadgesInNavigation === 'boolean'
          ? np.showUnreadBadgesInNavigation
          : true,
      externalChannelsStatus: 'disabled_local_demo',
    },
    updatedBy: nonEmptyStr(raw.updatedBy, defaults.updatedBy),
    updatedAt: nonEmptyStr(raw.updatedAt, defaults.updatedAt),
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    environmentMode: 'local_demo_adapter',
  };
}

export class LocalSettingsStore {
  settings: ApplicationSettings = createDefaultApplicationSettings();
  auditEntries: SettingsAuditEntry[] = [];
  auditSeq = 1;

  private readonly skipPersistence: boolean;

  constructor(options?: { skipPersistence?: boolean; rawStorageOverride?: string | null }) {
    this.skipPersistence = Boolean(options?.skipPersistence);
    this.load(options?.rawStorageOverride);
  }

  private load(rawOverride?: string | null): void {
    const storage = this.skipPersistence ? null : getSafeStorage();
    const raw =
      rawOverride !== undefined
        ? rawOverride
        : storage?.getItem(APP_SETTINGS_STORAGE_KEY) ?? null;

    if (!raw) {
      this.settings = createDefaultApplicationSettings();
      this.auditEntries = [];
      this.auditSeq = 1;
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<PersistedSettingsState>;
      this.settings = sanitizeRestoredSettings(parsed?.settings);
      this.auditEntries = Array.isArray(parsed?.auditEntries)
        ? parsed.auditEntries
            .filter(
              (entry): entry is SettingsAuditEntry =>
                isPlainRecord(entry) &&
                typeof entry.id === 'string' &&
                typeof entry.actorId === 'string' &&
                typeof entry.action === 'string'
            )
            .map((e) => ({ ...e }))
        : [];
      this.auditSeq =
        typeof parsed?.auditSeq === 'number' && parsed.auditSeq >= 1
          ? parsed.auditSeq
          : this.auditEntries.length + 1;
    } catch {
      // Recover cleanly from corrupted local JSON without clearing unrelated storage
      this.settings = createDefaultApplicationSettings();
      this.auditEntries = [];
      this.auditSeq = 1;
      storage?.removeItem(APP_SETTINGS_STORAGE_KEY);
    }
  }

  save(): void {
    if (this.skipPersistence) return;
    const storage = getSafeStorage();
    if (!storage) return;
    const payload: PersistedSettingsState = {
      schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
      demoDataLabel: 'DEMO DATA',
      settings: this.settings,
      auditEntries: this.auditEntries,
      auditSeq: this.auditSeq,
    };
    storage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  }
}

export const sharedLocalSettingsStore = new LocalSettingsStore();
