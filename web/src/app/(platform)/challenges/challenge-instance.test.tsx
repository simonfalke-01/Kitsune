import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChallengeInstance } from './challenge-instance';

describe('ChallengeInstance', () => {
  it('shows an honest unavailable state without active controls', () => {
    render(
      <ChallengeInstance state="unavailable" unavailableReason="Lifecycle API unavailable." />
    );

    expect(screen.getByText('Lifecycle API unavailable.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Deploy' })).not.toBeInTheDocument();
  });

  it('shows running endpoints and lifecycle actions', () => {
    render(
      <ChallengeInstance
        endpoints={[
          {
            label: 'Endpoint',
            value: 'nc example.test 31337'
          }
        ]}
        expiresAt="2026-07-23T18:00:00Z"
        onExtend={vi.fn().mockResolvedValue(undefined)}
        onStop={vi.fn().mockResolvedValue(undefined)}
        state="running"
      />
    );

    expect(screen.getByText('nc example.test 31337')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Extend' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  });
});
