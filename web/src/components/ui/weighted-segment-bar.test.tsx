import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WeightedSegmentBar } from './weighted-segment-bar';

describe('WeightedSegmentBar', () => {
  it('preserves numeric weights and exposes details to focus and navigation', async () => {
    render(
      <WeightedSegmentBar
        ariaLabel="Web challenge points"
        maximumValue={3_000}
        items={[
          {
            href: '/challenges?challenge=cache',
            id: 'cache',
            label: 'Open Cache rules, 1000 pts, 12 solves, Unsolved',
            tone: 'blue',
            tooltip: 'Cache rules, 1000 points, 12 solves, Unsolved',
            value: 1_000
          },
          {
            href: '/challenges?challenge=origin',
            id: 'origin',
            isEmphasized: true,
            label: 'Open Origin story, 500 pts, 5 solves, Solved',
            tone: 'blue',
            tooltip: 'Origin story, 500 points, 5 solves, Solved',
            value: 500
          }
        ]}
      />
    );

    const cache = screen.getByRole('link', { name: /Open Cache rules/ });
    const origin = screen.getByRole('link', { name: /Open Origin story/ });

    expect(cache).toHaveAttribute('href', '/challenges?challenge=cache');
    expect(cache.closest('ol')).toHaveStyle({ '--segment-bar-width': '50%' });
    expect(cache.closest('li')).toHaveStyle({ '--segment-weight': '1000' });
    expect(origin.closest('li')).toHaveStyle({ '--segment-weight': '500' });

    fireEvent.pointerMove(document.body, { pointerType: 'mouse' });
    fireEvent.pointerEnter(cache, { pointerType: 'mouse' });
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Cache rules, 1000 points, 12 solves, Unsolved'
    );
  });
});
