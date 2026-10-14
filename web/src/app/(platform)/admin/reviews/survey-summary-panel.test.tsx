import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SurveySummaryPanel } from './survey-summary-panel';
import type { ChallengeSummary } from '@/lib/api/client';

const mocks = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    GET: mocks.get
  },
  errorMessage: (_error: unknown, fallback: string) => fallback
}));

function challenge(): ChallengeSummary {
  return {
    category: 'Web',
    description: 'Trace the packet path.',
    event_id: 'event',
    id: 'challenge',
    kind: {
      type: 'static_flag'
    },
    max_attempts: null,
    name: 'Packet trail',
    position: 0,
    scoring: {
      kind: 'static',
      points: 300
    },
    solved: false,
    state: 'published',
    survey: [
      {
        key: 'clarity',
        prompt: 'How clear was the challenge?',
        range: [1, 5],
        required: true
      }
    ],
    tags: [],
    visibility: {
      division_ids: [],
      prerequisites: [],
      visible_from: null,
      visible_until: null
    },
    writeups_enabled: true
  };
}

describe('SurveySummaryPanel', () => {
  it('loads aggregate responses for authored challenge surveys', async () => {
    mocks.get.mockResolvedValue({
      data: {
        questions: [
          {
            average: 4.25,
            key: 'clarity',
            maximum: 5,
            minimum: 3,
            prompt: 'How clear was the challenge?',
            responses: 4
          }
        ],
        response_count: 4
      }
    });

    render(<SurveySummaryPanel challenges={[challenge()]} eventId="event" />);

    expect(await screen.findByText('How clear was the challenge?')).toBeVisible();
    expect(screen.getByText('4 responses')).toBeVisible();
    expect(screen.getByText('4.25')).toBeVisible();
    expect(screen.getByText('3 to 5')).toBeVisible();
    expect(mocks.get).toHaveBeenCalledWith(
      '/api/v1/events/{event_id}/challenges/{challenge_id}/survey-summary',
      {
        params: {
          path: {
            challenge_id: 'challenge',
            event_id: 'event'
          }
        }
      }
    );
  });
});
