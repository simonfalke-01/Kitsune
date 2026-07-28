import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChallengeSolveStatus } from './challenge-solve-status';

describe('ChallengeSolveStatus', () => {
  it('uses the shared success treatment for an ordinary solve', () => {
    render(<ChallengeSolveStatus firstBloodHighlightColor="achievement" />);

    expect(screen.getByText('Solved')).toHaveClass('text-success-text');
  });

  it('owns first-blood copy and presentation state', () => {
    render(<ChallengeSolveStatus bloodRank={1} firstBloodHighlightColor="rainbow" />);

    expect(screen.getByText('First blood')).toHaveClass('kitsune-first-blood-copy');
    expect(screen.getByText('First blood')).toHaveAttribute('data-first-blood-color', 'rainbow');
  });

  it('keeps podium labels and tones consistent', () => {
    render(<ChallengeSolveStatus bloodRank={3} firstBloodHighlightColor="achievement" />);

    expect(screen.getByText('Third blood')).toHaveClass('text-podium-third');
  });
});
