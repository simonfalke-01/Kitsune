import { fireEvent, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ScrollEdgeDock } from './scroll-edge-dock';

function DockFixture() {
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div data-scroll-region data-testid="scroll-region">
      <div data-testid="anchor" ref={anchorRef}>
        Natural row
      </div>
      <ScrollEdgeDock anchorRef={anchorRef}>
        <div>Docked row</div>
      </ScrollEdgeDock>
    </div>
  );
}

describe('ScrollEdgeDock', () => {
  it('mirrors the anchor as soon as either scroll-region edge clips it', async () => {
    const { getByTestId } = render(<DockFixture />);
    const region = getByTestId('scroll-region');
    const anchor = getByTestId('anchor');
    const anchorBounds = vi.spyOn(anchor, 'getBoundingClientRect');

    vi.spyOn(region, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 600, 400));

    anchorBounds.mockReturnValue(new DOMRect(124, 460, 552, 64));
    fireEvent.scroll(region);

    await waitFor(() => {
      expect(document.querySelector('[data-scroll-edge-dock="bottom"]')).toHaveStyle({
        left: '124px',
        top: '436px',
        width: '552px'
      });
    });

    anchorBounds.mockReturnValue(new DOMRect(124, 60, 552, 64));
    fireEvent.scroll(region);

    await waitFor(() => {
      const dock = document.querySelector('[data-scroll-edge-dock="top"]');
      expect(dock).toHaveAttribute('aria-hidden', 'true');
      expect(dock).toHaveClass('fixed', 'z-sticky');
      expect(dock).toHaveStyle({ left: '124px', top: '100px', width: '552px' });
    });

    anchorBounds.mockReturnValue(new DOMRect(124, 220, 552, 64));
    fireEvent.scroll(region);

    await waitFor(() => {
      expect(document.querySelector('[data-scroll-edge-dock]')).not.toBeInTheDocument();
    });
  });
});
