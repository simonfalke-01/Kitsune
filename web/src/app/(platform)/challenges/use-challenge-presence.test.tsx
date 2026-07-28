import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChallengePresence } from './use-challenge-presence';
import { api } from '@/lib/api/client';

const teammate = {
  challenge_id: '019c0000-0000-7000-8000-000000000002',
  display_name: 'Mina Park',
  updated_at: '2026-07-28T04:00:00Z',
  user_id: '019c0000-0000-7000-8000-000000000003'
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useChallengePresence', () => {
  it('publishes selection and accepts the team-scoped presence response', async () => {
    const get = vi.spyOn(api, 'GET').mockResolvedValue({
      data: { members: [teammate] },
      response: new Response(null, { status: 200 })
    });
    const put = vi.spyOn(api, 'PUT').mockResolvedValue({
      data: { members: [teammate] },
      response: new Response(null, { status: 200 })
    });

    const { result } = renderHook(() =>
      useChallengePresence({
        csrfToken: 'csrf',
        eventId: '019c0000-0000-7000-8000-000000000001',
        isEnabled: true,
        selectedChallengeId: teammate.challenge_id
      })
    );

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
      expect(result.current.members).toEqual([teammate]);
    });
    expect(get).toHaveBeenCalled();
    expect(put).toHaveBeenCalledWith(
      '/api/v1/events/{event_id}/challenge-presence',
      expect.objectContaining({
        body: {
          challenge_id: teammate.challenge_id
        },
        headers: {
          'x-csrf-token': 'csrf'
        }
      })
    );

    act(() => {
      result.current.selectChallenge('019c0000-0000-7000-8000-000000000004');
    });

    await waitFor(() => {
      expect(put).toHaveBeenLastCalledWith(
        '/api/v1/events/{event_id}/challenge-presence',
        expect.objectContaining({
          body: {
            challenge_id: '019c0000-0000-7000-8000-000000000004'
          }
        })
      );
    });
  });

  it('stays idle when presence is not authorized for the current session', () => {
    const get = vi.spyOn(api, 'GET');
    const put = vi.spyOn(api, 'PUT');

    const { result } = renderHook(() =>
      useChallengePresence({
        csrfToken: null,
        eventId: 'demo-event',
        isEnabled: false,
        selectedChallengeId: null
      })
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.members).toEqual([]);
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
