import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChallengeAdminView } from './challenge-admin-view';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  refreshChallenges: vi.fn()
}));

vi.mock('../../../event-context', () => ({
  useEvent: () => ({
    challenges: [],
    error: null,
    isLoading: false,
    refreshChallenges: mocks.refreshChallenges,
    selectedEvent: {
      id: 'event-a',
      name: 'Finals'
    }
  })
}));

vi.mock('../../../session-context', () => ({
  useSession: () => ({
    can: () => true,
    session: {
      csrf_token: 'csrf-token'
    }
  })
}));

vi.mock('@/lib/api/client', () => ({
  api: {
    GET: mocks.get,
    POST: vi.fn()
  },
  errorMessage: (_error: unknown, fallback: string) => fallback
}));

describe('ChallengeAdminView', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.refreshChallenges.mockReset();
    mocks.get.mockResolvedValue({ data: [] });
  });

  it('protects a dirty create draft before returning to inventory', async () => {
    render(<ChallengeAdminView />);

    const createButton = screen.getAllByRole('button', { name: 'Create challenge' }).at(0);
    if (!createButton) {
      throw new Error('Create challenge action was not rendered.');
    }
    fireEvent.click(createButton);
    expect(screen.getByRole('heading', { name: 'Create challenge' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('Challenge name'), {
      target: { value: 'Unsaved draft' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.getByText('Discard this draft?')).toBeVisible();
    });
    expect(screen.getByRole('heading', { name: 'Create challenge' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(screen.getByText('No challenges')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Create challenge' })).not.toHaveLength(0);
  });
});
