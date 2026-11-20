import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { APP_SETTINGS_STORAGE_KEY } from '../services';

export type ThemeMode = 'light' | 'dark';

interface AppearancePolicy {
  defaultTheme: ThemeMode;
  allowPersonalThemePreference: boolean;
}

interface ThemeContextValue {
  theme: ThemeMode;
  defaultTheme: ThemeMode;
  allowPersonalThemePreference: boolean;
  hasPersonalPreference: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  resetToDefaultTheme: () => void;
  applyAppearanceDefaults: (policy: AppearancePolicy) => void;
  setUserThemeScope: (uid: string | null) => void;
}

const THEME_STORAGE_KEY = 'tuition_ecosystem_theme_v1';
const USER_THEME_PREFIX = 'zelora_theme_user_';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSavedPersonalTheme(uid: string | null = null): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    if (uid) {
      const userSaved = window.localStorage.getItem(`${USER_THEME_PREFIX}${uid}`);
      if (userSaved === 'light' || userSaved === 'dark') {
        return userSaved;
      }
      return null;
    }
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

function readStoredAdminPolicy(): AppearancePolicy {
  if (typeof window === 'undefined') {
    return { defaultTheme: 'dark', allowPersonalThemePreference: true };
  }
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        settings?: {
          appearanceDefaults?: {
            defaultTheme?: unknown;
            allowPersonalThemePreference?: unknown;
          };
        };
      };
      const ap = parsed?.settings?.appearanceDefaults;
      return {
        defaultTheme: ap?.defaultTheme === 'light' ? 'light' : 'dark',
        allowPersonalThemePreference:
          typeof ap?.allowPersonalThemePreference === 'boolean'
            ? ap.allowPersonalThemePreference
            : true,
      };
    }
  } catch {
    // Fall back safely to dark default
  }
  return { defaultTheme: 'dark', allowPersonalThemePreference: true };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [userScopeUid, setUserScopeUidState] = useState<string | null>(null);
  const [policy, setPolicy] = useState<AppearancePolicy>(readStoredAdminPolicy);
  const [personalTheme, setPersonalTheme] = useState<ThemeMode | null>(() => readSavedPersonalTheme(null));

  const effectiveTheme: ThemeMode =
    policy.allowPersonalThemePreference && personalTheme ? personalTheme : policy.defaultTheme;

  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = effectiveTheme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, effectiveTheme);
    } catch {
      // Ignore storage errors
    }
  }, [effectiveTheme]);

  const setUserThemeScope = useCallback((uid: string | null) => {
    setUserScopeUidState(uid);
    if (uid) {
      const userTheme = readSavedPersonalTheme(uid);
      setPersonalTheme(userTheme);
    } else {
      setPersonalTheme(readSavedPersonalTheme(null));
    }
  }, []);

  const setTheme = useCallback(
    (next: ThemeMode) => {
      if (!policy.allowPersonalThemePreference) {
        return;
      }
      setPersonalTheme(next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
        if (userScopeUid) {
          window.localStorage.setItem(`${USER_THEME_PREFIX}${userScopeUid}`, next);
        }
      } catch {
        // Ignore storage write errors in restricted contexts.
      }
    },
    [policy.allowPersonalThemePreference, userScopeUid]
  );

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = effectiveTheme === 'light' ? 'dark' : 'light';
    setTheme(next);
  }, [effectiveTheme, setTheme]);

  const resetToDefaultTheme = useCallback(() => {
    setPersonalTheme(null);
    try {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      if (userScopeUid) {
        window.localStorage.removeItem(`${USER_THEME_PREFIX}${userScopeUid}`);
      }
    } catch {
      // Ignore storage errors
    }
  }, [userScopeUid]);

  const applyAppearanceDefaults = useCallback((nextPolicy: AppearancePolicy) => {
    setPolicy((prev) =>
      prev.defaultTheme === nextPolicy.defaultTheme &&
      prev.allowPersonalThemePreference === nextPolicy.allowPersonalThemePreference
        ? prev
        : nextPolicy
    );
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: effectiveTheme,
        defaultTheme: policy.defaultTheme,
        allowPersonalThemePreference: policy.allowPersonalThemePreference,
        hasPersonalPreference: personalTheme !== null,
        setTheme,
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
