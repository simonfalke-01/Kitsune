import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventAdminView } from './event-admin-view';
import type { EventSummary } from '@/lib/api/client';

const mocks = vi.hoisted(() => ({
  canManageEvents: true,
  canManageScoreboard: true,
  delete: vi.fn(),
  eventContext: {
    error: null as string | null,
    events: [] as EventSummary[],
    isLoading: false,
    refresh: vi.fn(),
    selectEvent: vi.fn(),
    selectedEvent: null as EventSummary | null
  },
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn()
}));

vi.mock('../../../event-context', () => ({
  useEvent: () => mocks.eventContext
}));

vi.mock('../../../session-context', () => ({
  useSession: () => ({
    can: (permission: string) => {
      if (permission === 'event_manage') {
        return mocks.canManageEvents;
      }

      if (permission === 'scoreboard_manage') {
        return mocks.canManageScoreboard;
      }

      return false;
    },
    session: {
      csrf_token: 'csrf',
      permissions: ['event_manage', 'scoreboard_manage']
    }
  })
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    DELETE: mocks.delete,
    GET: mocks.get,
    PATCH: mocks.patch,
    POST: mocks.post
  },
  errorMessage: (_error: unknown, fallback: string) => fallback
}));

function event(): EventSummary {
  return {
    description: 'Four-mode invitational',
    ends_at: '2026-08-01T18:00:00.000Z',
    id: 'event',
    modes: ['jeopardy', 'koth', 'attack_defense', 'workshop'],
    name: 'Foxden Invitational',
    participation: 'team',
    scoreboard_frozen: true,
    scoreboard_hidden: false,
    slug: 'foxden-invitational',
    starts_at: '2026-08-01T12:00:00.000Z',
    state: 'scheduled',
    team_size_limit: 6
  };
}

describe('EventAdminView', () => {
  beforeEach(() => {
    mocks.canManageEvents = true;
    mocks.canManageScoreboard = true;
    mocks.delete.mockReset();
    mocks.get.mockReset();
    mocks.patch.mockReset();
    mocks.post.mockReset();
    mocks.eventContext.error = null;
    mocks.eventContext.events = [];
    mocks.eventContext.isLoading = false;
    mocks.eventContext.refresh.mockReset();
    mocks.eventContext.selectEvent.mockReset();
    mocks.eventContext.selectedEvent = null;
  });

  it('blocks event administration without event management permission', () => {
    mocks.canManageEvents = false;

    render(<EventAdminView />);

    expect(screen.getByText('Event management is unavailable for this account.')).toBeVisible();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('shows the event loading error without presenting a false empty state', () => {
    mocks.eventContext.error = 'Events could not be loaded.';

    render(<EventAdminView />);

    expect(screen.getByText('Events could not be loaded.')).toBeVisible();
    expect(screen.queryByText('No events')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('loads selected-event divisions and brackets with lifecycle context', async () => {
    const selectedEvent = event();
    mocks.eventContext.events = [selectedEvent];
    mocks.eventContext.selectedEvent = selectedEvent;
    mocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/divisions')) {
        return Promise.resolve({
          data: [
            {
              event_id: 'event',
              id: 'division',
              name: 'Open',
              position: 0
            }
          ]
        });
      }

      return Promise.resolve({
        data: [
          {
            advancement_slots: 8,
            event_id: 'event',
            id: 'bracket',
            name: 'Final'
          }
        ]
      });
    });

    render(<EventAdminView />);

    expect(screen.getByRole('heading', { name: 'Foxden Invitational' })).toBeVisible();
    expect(screen.getAllByText('Scheduled')).not.toHaveLength(0);
    expect(screen.getByText('Frozen')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit event' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete event' })).toBeDisabled();
    expect(screen.getByText('Delete API pending')).toBeVisible();
    expect(await screen.findAllByText('Open')).not.toHaveLength(0);
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/events/{event_id}/divisions', {
      params: {
        path: {
          event_id: 'event'
        }
      }
    });
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/events/{event_id}/brackets', {
      params: {
        path: {
          event_id: 'event'
        }
      }
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Brackets' }));

    expect(await screen.findAllByText('Final')).not.toHaveLength(0);
  });

  it('creates a division through the generated event endpoint', async () => {
    const selectedEvent = event();
    mocks.eventContext.events = [selectedEvent];
    mocks.eventContext.selectedEvent = selectedEvent;
    mocks.get.mockResolvedValue({
      data: []
    });
    mocks.post.mockResolvedValue({
      data: {
        event_id: 'event',
        id: 'division',
        name: 'Open',
        position: 0
      }
    });

    render(<EventAdminView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Create division' }));
    fireEvent.change(screen.getByLabelText('Division name'), {
      target: {
        value: 'Open'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create division' }));

    await waitFor(() => {
      expect(mocks.post).toHaveBeenCalledWith('/api/v1/events/{event_id}/divisions', {
        body: {
          name: 'Open',
          position: 0
        },
        headers: {
          'x-csrf-token': 'csrf'
        },
        params: {
          path: {
            event_id: 'event'
          }
        }
      });
    });
  });

  it('requires confirmation before deleting a bracket', async () => {
    const selectedEvent = event();
    mocks.eventContext.events = [selectedEvent];
    mocks.eventContext.selectedEvent = selectedEvent;
    mocks.get.mockImplementation((path: string) => {
      return Promise.resolve({
        data: path.endsWith('/brackets')
          ? [
              {
                advancement_slots: 8,
                event_id: 'event',
                id: 'bracket',
                name: 'Final'
              }
            ]
          : []
      });
    });
    mocks.delete.mockResolvedValue({
      response: {
        ok: true
      }
    });

    render(<EventAdminView />);

    await screen.findByRole('tab', { name: 'Brackets' });
    fireEvent.click(screen.getByRole('tab', { name: 'Brackets' }));
    const [deleteButton] = await screen.findAllByRole('button', { name: 'Delete' });

    expect(deleteButton).toBeDefined();
    fireEvent.click(deleteButton!);

    expect(screen.getByText('Delete this bracket?')).toBeVisible();
    expect(mocks.delete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete bracket' }));

    await waitFor(() => {
      expect(mocks.delete).toHaveBeenCalledWith('/api/v1/events/{event_id}/brackets/{bracket_id}', {
        headers: {
          'x-csrf-token': 'csrf'
        },
        params: {
          path: {
            bracket_id: 'bracket',
            event_id: 'event'
          }
        }
      });
    });
  });
});
