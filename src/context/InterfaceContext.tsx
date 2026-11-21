import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_BRANDING_CONFIG, type BrandingConfig } from '../config/branding';
import type { WebInterfaceId } from '../config/navigation';
import {
  createDefaultApplicationSettings,
  firebaseSettingsService,
  isFirebaseConnectedMode,
  settingsService,
} from '../services';
import type {
  ApplicationBranding,
  CentreProfile,
  PublicApplicationSettings,
} from '../types';
import { useTheme } from './ThemeContext';

interface BrandingPreviewDraft {
  centreProfile?: Partial<CentreProfile>;
  applicationBranding?: Partial<ApplicationBranding>;
}

interface InterfaceContextValue {
  activeInterface: WebInterfaceId;
  setActiveInterface: (id: WebInterfaceId) => void;
  branding: BrandingConfig;
  publicSettings: PublicApplicationSettings;
  isPreviewActive: boolean;
  setBrandingDraftPreview: (draft: BrandingPreviewDraft | null) => void;
  refreshAppSettings: () => Promise<PublicApplicationSettings>;
  updateBrandingPreview: (partial: Partial<BrandingConfig>) => void;
}

const InterfaceContext = createContext<InterfaceContextValue | null>(null);

function toInitialPublicSettings(): PublicApplicationSettings {
  const s = createDefaultApplicationSettings();
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
    environmentMode: isFirebaseConnectedMode() ? 'firebase_connected' : 'local_demo_adapter',
  };
}

export function InterfaceProvider({ children }: { children: ReactNode }) {
  const { applyAppearanceDefaults } = useTheme();
  const [activeInterface, setActiveInterface] = useState<WebInterfaceId>('foundation-hub');
  const [persistedSettings, setPersistedSettings] = useState<PublicApplicationSettings>(
    toInitialPublicSettings
  );
  const [previewDraft, setPreviewDraft] = useState<BrandingPreviewDraft | null>(null);
  const [legacyPreviewPatch, setLegacyPreviewPatch] = useState<Partial<BrandingConfig> | null>(
    null
  );

  const refreshAppSettings = useCallback(async () => {
    const latest = await settingsService.getPublicBrandingAndSettings();
    setPersistedSettings(latest);
    setPreviewDraft(null);
    setLegacyPreviewPatch(null);
    applyAppearanceDefaults({
      defaultTheme: latest.appearanceDefaults.defaultTheme,
      defaultAccentPalette: latest.appearanceDefaults.defaultAccentPalette,
      allowPersonalThemePreference: latest.appearanceDefaults.allowPersonalThemePreference,
    });
    return latest;
  }, [applyAppearanceDefaults]);

  useEffect(() => {
    void refreshAppSettings();
    if (!isFirebaseConnectedMode()) {
      return undefined;
    }
    return firebaseSettingsService.subscribePublicSettings((latest) => {
      setPersistedSettings(latest);
      applyAppearanceDefaults({
        defaultTheme: latest.appearanceDefaults.defaultTheme,
        defaultAccentPalette: latest.appearanceDefaults.defaultAccentPalette,
        allowPersonalThemePreference: latest.appearanceDefaults.allowPersonalThemePreference,
      });
    });
  }, [refreshAppSettings, applyAppearanceDefaults]);

  const effectivePublicSettings = useMemo<PublicApplicationSettings>(() => {
    if (!previewDraft) {
      return persistedSettings;
    }
    return {
      ...persistedSettings,
      centreProfile: {
        ...persistedSettings.centreProfile,
        ...(previewDraft.centreProfile ?? {}),
      },
      applicationBranding: {
        ...persistedSettings.applicationBranding,
        ...(previewDraft.applicationBranding ?? {}),
        logoConfiguration: previewDraft.applicationBranding?.logoConfiguration
          ? { ...previewDraft.applicationBranding.logoConfiguration }
          : { ...persistedSettings.applicationBranding.logoConfiguration },
      },
    };
  }, [persistedSettings, previewDraft]);

  const branding = useMemo<BrandingConfig>(() => {
    const base: BrandingConfig = {
      ...DEFAULT_BRANDING_CONFIG,
      centreName:
        effectivePublicSettings.applicationBranding.displayName ||
        effectivePublicSettings.centreProfile.centreName,
      shortName:
        effectivePublicSettings.applicationBranding.shortName ||
        effectivePublicSettings.centreProfile.shortName,
      tagline:
        effectivePublicSettings.applicationBranding.tagline ||
        effectivePublicSettings.centreProfile.tagline,
      academicYearLabel: effectivePublicSettings.academicDefaults.academicYearDisplay,
      supportEmailPlaceholder:
        effectivePublicSettings.centreProfile.publicEmail ||
        DEFAULT_BRANDING_CONFIG.supportEmailPlaceholder,
      defaultTheme: effectivePublicSettings.appearanceDefaults.defaultTheme,
      defaultAccentPalette:
        effectivePublicSettings.appearanceDefaults.defaultAccentPalette ??
        DEFAULT_BRANDING_CONFIG.defaultAccentPalette,
    };
    return legacyPreviewPatch ? { ...base, ...legacyPreviewPatch } : base;
  }, [effectivePublicSettings, legacyPreviewPatch]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = branding.centreName || 'ZELORA STUDYS';
    }
  }, [branding.centreName]);

  const setBrandingDraftPreview = useCallback((draft: BrandingPreviewDraft | null) => {
    setPreviewDraft(draft);
  }, []);

  const updateBrandingPreview = useCallback((partial: Partial<BrandingConfig>) => {
    setLegacyPreviewPatch((prev) => ({ ...(prev ?? {}), ...partial }));
  }, []);

  return (
    <InterfaceContext.Provider
      value={{
        activeInterface,
        setActiveInterface,
        branding,
        publicSettings: effectivePublicSettings,
        isPreviewActive: Boolean(previewDraft),
        setBrandingDraftPreview,
        refreshAppSettings,
        updateBrandingPreview,
      }}
    >
      {children}
    </InterfaceContext.Provider>
  );
}

export function useInterface(): InterfaceContextValue {
  const ctx = useContext(InterfaceContext);
  if (!ctx) {
    throw new Error('useInterface must be used inside InterfaceProvider');
  }
  return ctx;
}
