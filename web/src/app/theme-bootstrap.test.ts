import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyInitialTheme, themeBootstrapScript } from './theme-bootstrap';

function useSystemTheme(isDark: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: isDark
  });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  delete document.documentElement.dataset.theme;
});

describe('theme bootstrap', () => {
  it('applies a stored dark preference before the app hydrates', () => {
    window.localStorage.setItem('kitsune.theme', 'dark');
    useSystemTheme(false);

    applyInitialTheme();

    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('keeps an explicit light preference when the system is dark', () => {
    window.localStorage.setItem('kitsune.theme', 'light');
    useSystemTheme(true);

    applyInitialTheme();

    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('resolves system dark mode and emits a self-contained head script', () => {
    window.localStorage.setItem('kitsune.theme', 'system');
    useSystemTheme(true);

    applyInitialTheme();

    expect(document.documentElement).toHaveClass('dark');
    expect(themeBootstrapScript).toContain('kitsune.theme');
    expect(themeBootstrapScript).toContain('document.documentElement');
  });
});
