export function applyInitialTheme() {
  let preference = 'system';

  try {
    const storedPreference = window.localStorage.getItem('kitsune.theme');

    if (
      storedPreference === 'dark' ||
      storedPreference === 'light' ||
      storedPreference === 'system'
    ) {
      preference = storedPreference;
    }
  } catch {
    // System preference remains available when storage is unavailable.
  }

  const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = preference === 'dark' || (preference === 'system' && systemIsDark);
  const root = document.documentElement;
  root.dataset.theme = isDark ? 'dark' : 'light';
  root.classList.toggle('dark', isDark);
}

export const themeBootstrapScript = `(${applyInitialTheme.toString()})();`;
