'use client';

import { type CSSProperties, type ReactNode, type RefObject, useEffect, useState } from 'react';

import { cx } from './styles';

export type ScrollEdge = 'bottom' | 'top';

interface DockGeometry {
  edge: ScrollEdge;
  left: number;
  top: number;
  width: number;
}

function sameGeometry(current: DockGeometry | null, next: DockGeometry | null): boolean {
  return (
    current?.edge === next?.edge &&
    current?.left === next?.left &&
    current?.top === next?.top &&
    current?.width === next?.width
  );
}

export interface ScrollEdgeDockProps {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
}

/**
 * Mirrors an item at the nearest declared scroll-region edge while its natural
 * box is clipped. The dock is visual-only; the natural item retains semantics.
 */
export function ScrollEdgeDock({ anchorRef, children, className }: ScrollEdgeDockProps) {
  const [geometry, setGeometry] = useState<DockGeometry | null>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const scrollRegion = anchor?.closest<HTMLElement>('[data-scroll-region]');

    if (!anchor || !scrollRegion) {
      return;
    }

    const observedAnchor = anchor;
    const observedRegion = scrollRegion;
    let animationFrame = 0;

    function measure() {
      const anchorBounds = observedAnchor.getBoundingClientRect();
      const regionBounds = observedRegion.getBoundingClientRect();
      const edge: ScrollEdge | null =
        anchorBounds.top < regionBounds.top
          ? 'top'
          : anchorBounds.bottom > regionBounds.bottom
            ? 'bottom'
            : null;
      const next = edge
        ? {
            edge,
            left: anchorBounds.left,
            top: edge === 'top' ? regionBounds.top : regionBounds.bottom - anchorBounds.height,
            width: anchorBounds.width
          }
        : null;

      setGeometry((current) => (sameGeometry(current, next) ? current : next));
    }

    function scheduleMeasure() {
      if (animationFrame) {
        return;
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        measure();
      });
    }

    measure();
    observedRegion.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(observedAnchor);
    resizeObserver?.observe(observedRegion);

    return () => {
      observedRegion.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      resizeObserver?.disconnect();

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [anchorRef]);

  if (!geometry) {
    return null;
  }

  const style: CSSProperties = {
    left: geometry.left,
    top: geometry.top,
    width: geometry.width
  };

  return (
    <div
      aria-hidden="true"
      className={cx('pointer-events-none fixed z-sticky', className)}
      data-scroll-edge-dock={geometry.edge}
      style={style}
    >
      {children}
    </div>
  );
}
