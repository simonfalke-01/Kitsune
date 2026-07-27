'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore
} from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const themePreferenceKey = 'kitsune.theme';
const themePreferenceEvent = 'kitsune-theme-preference';
let volatileThemePreference: ThemePreference | null = null;

interface ThemeProviderProps {
  children: ReactNode;
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

function resolveDark(preference: ThemePreference, systemIsDark: boolean): boolean {
  if (preference === 'dark') {
    return true;
  }

  if (preference === 'light') {
    return false;
  }

  return systemIsDark;
}

function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  try {
    const storedPreference = window.localStorage.getItem(themePreferenceKey);
    return isThemePreference(storedPreference) ? storedPreference : 'system';
  } catch {
    return volatileThemePreference ?? 'system';
  }
}

function applyResolvedTheme(): void {
  const isDark = resolveDark(getThemePreference(), getSystemIsDark());
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', isDark);
}

function subscribeToTheme(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === themePreferenceKey) {
      applyResolvedTheme();
      onStoreChange();
    }
  };
  const handlePreferenceChange = () => {
    applyResolvedTheme();
    onStoreChange();
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(themePreferenceEvent, handlePreferenceChange);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(themePreferenceEvent, handlePreferenceChange);
  };
}

function getSystemIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function subscribeToSystemTheme(onStoreChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    applyResolvedTheme();
    onStoreChange();
  };
  media.addEventListener('change', handleChange);

  return () => {
    media.removeEventListener('change', handleChange);
  };
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribeToTheme,
    getThemePreference,
    () => 'system'
  );
  const systemIsDark = useSyncExternalStore(subscribeToSystemTheme, getSystemIsDark, () => false);
  const isDark = resolveDark(preference, systemIsDark);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    try {
      window.localStorage.setItem(themePreferenceKey, nextPreference);
      volatileThemePreference = null;
    } catch {
      volatileThemePreference = nextPreference;
    }

    window.dispatchEvent(new Event(themePreferenceEvent));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDark,
      preference,
      setPreference
    }),
    [isDark, preference, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider.');
  }

  return value;
}
