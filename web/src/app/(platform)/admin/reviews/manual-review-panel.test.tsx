import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ManualReviewPanel } from './manual-review-panel';

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

describe('ManualReviewPanel', () => {
  it('loads a manual submission and rejects it through the review dialog', async () => {
    mocks.get.mockResolvedValue({
      data: [
        {
          answer: 'kit{candidate-evidence}',
          challenge_id: 'challenge',
          challenge_name: 'Packet trail',
          competitor_id: 'competitor',
          competitor_kind: 'user',
          competitor_name: 'River',
          id: 'submission',
          submitted_at: '2026-07-27T10:00:00Z'
        }
      ]
    });
    mocks.patch.mockResolvedValue({
      data: {
        attempts_remaining: null,
        awarded_points: 0,
        challenge_id: 'challenge',
        first_blood: false,
        id: 'submission',
        outcome: 'incorrect',
        replayed: false,
        submitted_at: '2026-07-27T10:00:00Z'
      }
    });

    render(<ManualReviewPanel csrfToken="csrf" eventId="event" />);

    expect(await screen.findByText('Packet trail')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText('kit{candidate-evidence}')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Reviewer note'), {
      target: {
        value: 'Evidence does not match the challenge target.'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject submission' }));
    expect(await screen.findByText('Reject this submission?')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }));

    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith(
        '/api/v1/events/{event_id}/manual-reviews/{submission_id}',
        expect.objectContaining({
          body: {
            accepted: false,
            note: 'Evidence does not match the challenge target.'
          },
          headers: {
            'x-csrf-token': 'csrf'
          },
          params: {
            path: {
              event_id: 'event',
              submission_id: 'submission'
            }
          }
        })
      );
    });
    expect(await screen.findByText('No submissions awaiting review')).toBeVisible();
  });
});
