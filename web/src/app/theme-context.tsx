import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const themePreferenceKey = 'kitsune.theme';

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

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const storedPreference = window.localStorage.getItem(themePreferenceKey);
  const initialPreference = isThemePreference(storedPreference) ? storedPreference : 'system';
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [isDark, setIsDark] = useState(() => resolveDark(initialPreference));

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const nextIsDark = resolveDark(preference);

      setIsDark(nextIsDark);
      document.documentElement.dataset.theme = nextIsDark ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', nextIsDark);
    };

    applyTheme();
    media.addEventListener('change', applyTheme);

    return () => {
      media.removeEventListener('change', applyTheme);
    };
  }, [preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    window.localStorage.setItem(themePreferenceKey, nextPreference);
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
