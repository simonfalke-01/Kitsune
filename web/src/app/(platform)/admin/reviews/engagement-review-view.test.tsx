import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EngagementReviewView } from './engagement-review-view';

vi.mock('../../../event-context', () => ({
  useEvent: () => ({
    challenges: [],
    selectedEvent: null
  })
}));

vi.mock('../../../session-context', () => ({
  useSession: () => ({
    can: () => false,
    session: null
  })
}));

describe('EngagementReviewView', () => {
  it('blocks review surfaces without submission management permission', () => {
    render(<EngagementReviewView />);

    expect(screen.getByText('Engagement review is unavailable for this account.')).toBeVisible();
  });
});
