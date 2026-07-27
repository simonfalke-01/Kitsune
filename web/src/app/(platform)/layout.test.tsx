import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serverMocks = vi.hoisted(() => ({
  getPlatformBootstrap: vi.fn(),
  getServerSession: vi.fn()
}));
const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

vi.mock('@/lib/api/server', () => serverMocks);

vi.mock('../platform-providers', () => ({
  PlatformProviders: ({
    children,
    initialSession
  }: {
    children: ReactNode;
    initialSession: unknown;
  }) => <div data-session={initialSession ? 'authenticated' : 'guest'}>{children}</div>
}));

vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

beforeEach(() => {
  vi.resetModules();
  serverMocks.getPlatformBootstrap.mockReset();
  serverMocks.getServerSession.mockReset();
  redirectMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PlatformLayout access', () => {
  it('renders the public demo without requesting a login session', async () => {
    vi.stubEnv('KITSUNE_PUBLIC_DEMO', 'true');
    const { default: PlatformLayout } = await import('./layout');

    render(await PlatformLayout({ children: <span>Challenge demo</span> }));

    expect(screen.getByText('Challenge demo')).toBeVisible();
    expect(screen.getByText('Challenge demo').closest('[data-session]')).toHaveAttribute(
      'data-session',
      'guest'
    );
    expect(serverMocks.getServerSession).not.toHaveBeenCalled();
    expect(serverMocks.getPlatformBootstrap).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('preserves the login gate when public demo mode is disabled', async () => {
    vi.stubEnv('KITSUNE_PUBLIC_DEMO', 'false');
    serverMocks.getServerSession.mockResolvedValue(null);
    redirectMock.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
    const { default: PlatformLayout } = await import('./layout');

    await expect(PlatformLayout({ children: <span>Private</span> })).rejects.toThrow(
      'NEXT_REDIRECT'
    );
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });
});
