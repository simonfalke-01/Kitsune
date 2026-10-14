import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WriteupReviewPanel } from './writeup-review-panel';
import type { Writeup } from '@/lib/api/client';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn()
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    GET: mocks.get,
    PATCH: mocks.patch
  },
  errorMessage: (_error: unknown, fallback: string) => fallback
}));

function submittedWriteup(): Writeup {
  return {
    body: 'Trace the request and normalize the final endpoint.',
    challenge_id: 'challenge',
    challenge_name: 'Shrine gate',
    competitor_id: 'competitor',
    competitor_kind: 'team',
    competitor_name: 'Foxfire',
    created_at: '2026-07-27T10:00:00Z',
    feedback: null,
    id: 'writeup',
    reviewer_id: null,
    state: 'submitted',
    updated_at: '2026-07-27T10:00:00Z'
  };
}

describe('WriteupReviewPanel', () => {
  it('loads the submitted queue and requests changes with required feedback', async () => {
    const writeup = submittedWriteup();
    mocks.get.mockResolvedValue({
      data: [writeup]
    });
    mocks.patch.mockResolvedValue({
      data: {
        ...writeup,
        feedback: 'Explain how the final endpoint was normalized.',
        state: 'changes_requested'
      }
    });

    render(<WriteupReviewPanel csrfToken="csrf" eventId="event" />);

    expect(await screen.findByText('Shrine gate')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    fireEvent.change(await screen.findByLabelText('Reviewer feedback'), {
      target: {
        value: 'Explain how the final endpoint was normalized.'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith(
        '/api/v1/events/{event_id}/writeups/{writeup_id}',
        expect.objectContaining({
          body: {
            feedback: 'Explain how the final endpoint was normalized.',
            state: 'changes_requested'
          },
          headers: {
            'x-csrf-token': 'csrf'
          },
          params: {
            path: {
              event_id: 'event',
              writeup_id: 'writeup'
            }
          }
        })
      );
    });
    expect(await screen.findByText('No submitted writeups')).toBeVisible();
  });
});
