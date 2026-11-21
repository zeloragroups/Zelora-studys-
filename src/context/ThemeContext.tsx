import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  DEFAULT_ACCENT_PALETTE,
  DEFAULT_THEME_MODE,
  isValidAccentPaletteId,
  normalizeAccentPaletteId,
  type AccentPaletteId,
  type ThemeMode,
} from '../design/palettes';
import { APP_SETTINGS_STORAGE_KEY } from '../services';

export type { ThemeMode, AccentPaletteId };

export interface UserThemePreference {
  mode?: ThemeMode;
  palette?: AccentPaletteId;
}

interface AppearancePolicy {
  defaultTheme: ThemeMode;
  defaultAccentPalette?: AccentPaletteId;
  allowPersonalThemePreference: boolean;
}

interface ThemeContextValue {
  theme: ThemeMode;
  accentPalette: AccentPaletteId;
  savedTheme: ThemeMode;
  savedAccentPalette: AccentPaletteId;
  previewTheme: ThemeMode | null;
  previewAccentPalette: AccentPaletteId | null;
  isPreviewingTheme: boolean;
  defaultTheme: ThemeMode;
  defaultAccentPalette: AccentPaletteId;
  allowPersonalThemePreference: boolean;
  hasPersonalPreference: boolean;
  setTheme: (theme: ThemeMode) => void;
  setAccentPalette: (palette: AccentPaletteId) => void;
  setPreviewTheme: (theme: ThemeMode | null) => void;
  setPreviewAccentPalette: (palette: AccentPaletteId | null) => void;
  applyThemeSelection: (mode: ThemeMode, palette: AccentPaletteId) => void;
  cancelThemePreview: () => void;
  toggleTheme: () => void;
  resetToDefaultTheme: () => void;
  applyAppearanceDefaults: (policy: AppearancePolicy) => void;
  setUserThemeScope: (uid: string | null) => void;
}

const THEME_MODE_STORAGE_KEY = 'tuition_ecosystem_theme_v1';
const THEME_PALETTE_STORAGE_KEY = 'zelora_theme_palette_v1';
const USER_THEME_PREFIX = 'zelora_theme_user_';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readUserThemePreference(uid: string | null): UserThemePreference | null {
  if (typeof window === 'undefined') return null;
  try {
    if (uid) {
      const rawUser = window.localStorage.getItem(`${USER_THEME_PREFIX}${uid}`);
      if (!rawUser) return null;
      if (rawUser === 'light' || rawUser === 'dark') {
        return { mode: rawUser };
      }
      const parsed = JSON.parse(rawUser) as { mode?: unknown; palette?: unknown };
      const pref: UserThemePreference = {};
      if (parsed?.mode === 'light' || parsed?.mode === 'dark') {
        pref.mode = parsed.mode;
      }
      if (isValidAccentPaletteId(parsed?.palette)) {
        pref.palette = parsed.palette;
      }
      return pref.mode || pref.palette ? pref : null;
    }

    const savedMode = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    const savedPalette = window.localStorage.getItem(THEME_PALETTE_STORAGE_KEY);
    const pref: UserThemePreference = {};
    if (savedMode === 'light' || savedMode === 'dark') {
      pref.mode = savedMode;
    }
    if (isValidAccentPaletteId(savedPalette)) {
      pref.palette = savedPalette;
    }
    return pref.mode || pref.palette ? pref : null;
  } catch {
    return null;
  }
}

function writeUserThemePreference(uid: string | null, pref: UserThemePreference | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!pref || (!pref.mode && !pref.palette)) {
      window.localStorage.removeItem(THEME_MODE_STORAGE_KEY);
      window.localStorage.removeItem(THEME_PALETTE_STORAGE_KEY);
      if (uid) {
        window.localStorage.removeItem(`${USER_THEME_PREFIX}${uid}`);
      }
      return;
    }

    if (pref.mode) {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, pref.mode);
    }
    if (pref.palette) {
      window.localStorage.setItem(THEME_PALETTE_STORAGE_KEY, pref.palette);
    }
    if (uid) {
      window.localStorage.setItem(
        `${USER_THEME_PREFIX}${uid}`,
        JSON.stringify({ mode: pref.mode, palette: pref.palette })
      );
    }
  } catch {
    // Ignore storage write errors in restricted browser contexts.
  }
}

function readStoredAdminPolicy(): {
  defaultTheme: ThemeMode;
  defaultAccentPalette: AccentPaletteId;
  allowPersonalThemePreference: boolean;
} {
  if (typeof window === 'undefined') {
    return {
      defaultTheme: DEFAULT_THEME_MODE,
      defaultAccentPalette: DEFAULT_ACCENT_PALETTE,
      allowPersonalThemePreference: true,
    };
  }
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        settings?: {
          appearanceDefaults?: {
            defaultTheme?: unknown;
            defaultAccentPalette?: unknown;
            allowPersonalThemePreference?: unknown;
          };
        };
      };
      const ap = parsed?.settings?.appearanceDefaults;
      return {
        defaultTheme: ap?.defaultTheme === 'light' ? 'light' : DEFAULT_THEME_MODE,
        defaultAccentPalette: normalizeAccentPaletteId(ap?.defaultAccentPalette),
        allowPersonalThemePreference:
          typeof ap?.allowPersonalThemePreference === 'boolean'
            ? ap.allowPersonalThemePreference
            : true,
      };
    }
  } catch {
    // Fall back safely to Luxury Academic defaults
  }
  return {
    defaultTheme: DEFAULT_THEME_MODE,
    defaultAccentPalette: DEFAULT_ACCENT_PALETTE,
    allowPersonalThemePreference: true,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [userScopeUid, setUserScopeUidState] = useState<string | null>(null);
  const [policy, setPolicy] = useState(readStoredAdminPolicy);
  const [personalPref, setPersonalPref] = useState<UserThemePreference | null>(() =>
    readUserThemePreference(null)
  );
  const [previewTheme, setPreviewThemeState] = useState<ThemeMode | null>(null);
  const [previewAccentPalette, setPreviewAccentPaletteState] =
    useState<AccentPaletteId | null>(null);

  const savedTheme: ThemeMode =
    policy.allowPersonalThemePreference && personalPref?.mode
      ? personalPref.mode
      : policy.defaultTheme;

  const savedAccentPalette: AccentPaletteId =
    policy.allowPersonalThemePreference && personalPref?.palette
      ? personalPref.palette
      : policy.defaultAccentPalette;

  const effectiveTheme: ThemeMode =
    policy.allowPersonalThemePreference && previewTheme ? previewTheme : savedTheme;

  const effectiveAccentPalette: AccentPaletteId =
    policy.allowPersonalThemePreference && previewAccentPalette
      ? previewAccentPalette
      : savedAccentPalette;

  const isPreviewingTheme =
    policy.allowPersonalThemePreference &&
    (previewTheme !== null || previewAccentPalette !== null);

  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-palette', effectiveAccentPalette);
    root.style.colorScheme = effectiveTheme;
  }, [effectiveTheme, effectiveAccentPalette]);

  const setUserThemeScope = useCallback((uid: string | null) => {
    setUserScopeUidState(uid);
    setPreviewThemeState(null);
    setPreviewAccentPaletteState(null);
    if (uid) {
      const userPref = readUserThemePreference(uid);
      setPersonalPref(userPref);
      if (userPref?.mode) {
        try {
          window.localStorage.setItem(THEME_MODE_STORAGE_KEY, userPref.mode);
        } catch {
          // Ignore storage error
        }
      }
      if (userPref?.palette) {
        try {
          window.localStorage.setItem(THEME_PALETTE_STORAGE_KEY, userPref.palette);
        } catch {
          // Ignore storage error
        }
      }
    } else {
      // Clear active user-specific in-memory preference cleanly on sign-out
      setPersonalPref(null);
    }
  }, []);

  const setTheme = useCallback(
    (next: ThemeMode) => {
      if (!policy.allowPersonalThemePreference) {
        return;
      }
      setPreviewThemeState(null);
      setPersonalPref((prev) => {
        const updated: UserThemePreference = {
          mode: next,
          palette: prev?.palette ?? policy.defaultAccentPalette,
        };
        writeUserThemePreference(userScopeUid, updated);
        return updated;
      });
    },
    [policy.allowPersonalThemePreference, policy.defaultAccentPalette, userScopeUid]
  );

  const setAccentPalette = useCallback(
    (next: AccentPaletteId) => {
      if (!policy.allowPersonalThemePreference) {
        return;
      }
      const normalized = normalizeAccentPaletteId(next);
      setPreviewAccentPaletteState(null);
      setPersonalPref((prev) => {
        const updated: UserThemePreference = {
          mode: prev?.mode ?? policy.defaultTheme,
          palette: normalized,
        };
        writeUserThemePreference(userScopeUid, updated);
        return updated;
      });
    },
    [policy.allowPersonalThemePreference, policy.defaultTheme, userScopeUid]
  );

  const applyThemeSelection = useCallback(
    (mode: ThemeMode, palette: AccentPaletteId) => {
      if (!policy.allowPersonalThemePreference) {
        return;
      }
      const normalizedPalette = normalizeAccentPaletteId(palette);
      const updated: UserThemePreference = { mode, palette: normalizedPalette };
      setPersonalPref(updated);
      setPreviewThemeState(null);
      setPreviewAccentPaletteState(null);
      writeUserThemePreference(userScopeUid, updated);
    },
    [policy.allowPersonalThemePreference, userScopeUid]
  );

  const setPreviewTheme = useCallback(
    (mode: ThemeMode | null) => {
      if (!policy.allowPersonalThemePreference) return;
      setPreviewThemeState(mode);
    },
    [policy.allowPersonalThemePreference]
  );

  const setPreviewAccentPalette = useCallback(
    (palette: AccentPaletteId | null) => {
      if (!policy.allowPersonalThemePreference) return;
      setPreviewAccentPaletteState(palette ? normalizeAccentPaletteId(palette) : null);
    },
    [policy.allowPersonalThemePreference]
  );

  const cancelThemePreview = useCallback(() => {
    setPreviewThemeState(null);
    setPreviewAccentPaletteState(null);
  }, []);

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = effectiveTheme === 'light' ? 'dark' : 'light';
    setTheme(next);
  }, [effectiveTheme, setTheme]);

  const resetToDefaultTheme = useCallback(() => {
    setPreviewThemeState(null);
    setPreviewAccentPaletteState(null);
    setPersonalPref(null);
    writeUserThemePreference(userScopeUid, null);
  }, [userScopeUid]);

  const applyAppearanceDefaults = useCallback((nextPolicy: AppearancePolicy) => {
    const normalized = {
      defaultTheme: nextPolicy.defaultTheme,
      defaultAccentPalette: normalizeAccentPaletteId(nextPolicy.defaultAccentPalette),
      allowPersonalThemePreference: nextPolicy.allowPersonalThemePreference,
    };
    setPolicy((prev) =>
      prev.defaultTheme === normalized.defaultTheme &&
      prev.defaultAccentPalette === normalized.defaultAccentPalette &&
      prev.allowPersonalThemePreference === normalized.allowPersonalThemePreference
        ? prev
        : normalized
    );
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: effectiveTheme,
        accentPalette: effectiveAccentPalette,
        savedTheme,
        savedAccentPalette,
        previewTheme,
        previewAccentPalette,
        isPreviewingTheme,
        defaultTheme: policy.defaultTheme,
        defaultAccentPalette: policy.defaultAccentPalette,
        allowPersonalThemePreference: policy.allowPersonalThemePreference,
        hasPersonalPreference: personalPref !== null,
        setTheme,
        setAccentPalette,
        setPreviewTheme,
        setPreviewAccentPalette,
        applyThemeSelection,
        cancelThemePreview,
        toggleTheme,
        resetToDefaultTheme,
        applyAppearanceDefaults,
        setUserThemeScope,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
