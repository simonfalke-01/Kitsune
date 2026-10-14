import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/app/session-context';
import { ThemeProvider } from '@/app/theme-context';
import { AppHeader, AppShell } from './app-shell';

const navigationMocks = vi.hoisted(() => ({
  pathname: '/overview'
}));

vi.mock('@/app/event-context', () => ({
  useEvent: () => ({
    selectedEvent: null
  })
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn()
  })
}));

beforeEach(() => {
  navigationMocks.pathname = '/overview';
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    matches: false,
    media: query,
    removeEventListener: vi.fn()
  }));
});

describe('AppHeader', () => {
  it('uses the inset workspace navbar styling on standard routes', () => {
    render(
      <ThemeProvider>
        <SessionProvider initialSession={null}>
          <AppHeader />
        </SessionProvider>
      </ThemeProvider>
    );

    const header = screen.getByRole('banner');

    expect(header).toHaveClass(
      'sticky',
      'top-3',
      'mx-3',
      'mt-3',
      'overflow-hidden',
      'rounded-md',
      'bg-surface-raised'
    );
    expect(header).not.toHaveClass('border-b');
    expect(header.firstElementChild).toHaveClass('px-4');
    expect(header.firstElementChild).not.toHaveClass('sm:px-6', 'lg:px-8');
    expect(screen.getByRole('link', { name: 'Kitsune' })).toHaveClass('text-text');
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    expect(screen.getByRole('menuitemradio', { name: 'Overview' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('uses the floating shell and rounded main surface on every standard route', () => {
    navigationMocks.pathname = '/team';

    render(
      <ThemeProvider>
        <SessionProvider initialSession={null}>
          <AppShell>
            <span>Overview content</span>
          </AppShell>
        </SessionProvider>
      </ThemeProvider>
    );

    expect(screen.getByRole('link', { name: 'SML' })).toBeVisible();
    expect(screen.getByText('Overview content')).toBeVisible();
    expect(screen.getByRole('main')).toHaveClass(
      'm-3',
      'flex-1',
      'rounded-md',
      'bg-surface-raised',
      'p-4',
      'sm:p-6',
      'lg:p-8'
    );
  });
});
