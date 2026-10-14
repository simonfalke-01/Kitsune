import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnnouncementAdminView } from './announcement-admin-view';

const mocks = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock('../../../event-context', () => ({
  useEvent: () => ({
    events: []
  })
}));

vi.mock('../../../realtime-context', () => ({
  useRealtime: () => ({
    isConnected: true,
    latest: null
  })
}));

vi.mock('../../../session-context', () => ({
  useSession: () => ({
    can: () => false,
    session: null
  })
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    DELETE: vi.fn(),
    GET: mocks.get,
    POST: vi.fn()
  },
  errorMessage: (_error: unknown, fallback: string) => fallback
}));

describe('AnnouncementAdminView', () => {
  it('blocks the workspace without event management permission', () => {
    render(<AnnouncementAdminView />);

    expect(
      screen.getByText('Announcement management is unavailable for this account.')
    ).toBeVisible();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
