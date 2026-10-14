import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationCenter } from './notification-center';

const mocks = vi.hoisted(() => ({
  canRead: true,
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock('@/app/realtime-context', () => ({
  useRealtime: () => ({
    isConnected: true,
    latest: null
  })
}));

vi.mock('@/app/session-context', () => ({
  useSession: () => ({
    can: (permission: string) => permission === 'event_read' && mocks.canRead,
    session: {
      csrf_token: 'csrf-token'
    }
  })
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    GET: mocks.get,
    POST: mocks.post
  },
  errorMessage: (_error: unknown, fallback: string) => fallback
}));

describe('NotificationCenter', () => {
  beforeEach(() => {
    mocks.canRead = true;
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it('loads the feed and exposes the unread count on the bell', async () => {
    mocks.get.mockResolvedValue({
      data: {
        items: [
          {
            created_at: '2026-07-27T12:00:00Z',
            data: {
              body: 'Scoring is now live.',
              title: 'Round starts'
            },
            event_id: null,
            expires_at: null,
            id: '018f0000-0000-7000-8000-000000000001',
            priority: 2,
            read_at: null,
            template: 'announcement'
          }
        ],
        next_cursor: null,
        unread_count: 1
      }
    });

    render(<NotificationCenter />);

    expect(
      await screen.findByRole('button', {
        name: 'Notifications, 1 unread'
      })
    ).toBeVisible();
    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledWith('/api/v1/notifications', {
        params: {
          query: {
            cursor: undefined,
            limit: 25
          }
        }
      });
    });
  });

  it('renders nothing without event read permission', () => {
    mocks.canRead = false;

    const { container } = render(<NotificationCenter />);

    expect(container).toBeEmptyDOMElement();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
