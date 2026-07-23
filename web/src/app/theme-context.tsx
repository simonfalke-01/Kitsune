'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
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

interface ThemeProviderProps {
  children: ReactNode;
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

function resolveDark(preference: ThemePreference): boolean {
  if (preference === 'dark') {
    return true;
  }

  if (preference === 'light') {
    return false;
  }

  return typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const storedPreference = window.localStorage.getItem(themePreferenceKey);
  return isThemePreference(storedPreference) ? storedPreference : 'system';
}

function subscribeToTheme(onStoreChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleStorage = (event: StorageEvent) => {
    if (event.key === themePreferenceKey) {
      onStoreChange();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(themePreferenceEvent, onStoreChange);
  media.addEventListener('change', onStoreChange);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(themePreferenceEvent, onStoreChange);
    media.removeEventListener('change', onStoreChange);
  };
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribeToTheme,
    getThemePreference,
    () => 'system'
  );
  const isDark = resolveDark(preference);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    window.localStorage.setItem(themePreferenceKey, nextPreference);
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
