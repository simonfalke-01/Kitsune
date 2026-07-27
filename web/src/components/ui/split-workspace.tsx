'use client';

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
  useState
} from 'react';
import { Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components';

import { cx } from './styles';

const splitWorkspaceAppearances = {
  contained: 'overflow-hidden rounded-lg border border-border-subtle bg-surface-raised',
  edge: 'overflow-hidden border-y border-border-subtle bg-surface-raised',
  workspace: 'overflow-hidden rounded-md bg-surface-raised'
} as const;

interface SplitWorkspaceStyle extends CSSProperties {
  '--split-workspace-left'?: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

interface ScrollPaneProps {
  children: ReactNode;
  className?: string;
}

function ScrollPane({ children, className }: ScrollPaneProps) {
  return (
    <div
      className={cx(
        'kitsune-scroll-region min-h-0 min-w-0 overflow-y-auto overscroll-contain',
        className
      )}
    >
      {children}
    </div>
  );
}

export interface SplitWorkspaceProps {
  appearance?: keyof typeof splitWorkspaceAppearances;
  ariaLabel: string;
  className?: string;
  defaultValue?: number;
  left: ReactNode;
  maximum?: number;
  minimum?: number;
  onValueChange?: (value: number) => void;
  right: ReactNode;
  value?: number;
}

export function SplitWorkspace({
  appearance = 'contained',
  ariaLabel,
  className,
  defaultValue = 40,
  left,
  maximum = 52,
  minimum = 32,
  onValueChange,
  right,
  value
}: SplitWorkspaceProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [isDragging, setIsDragging] = useState(false);
  const activePointerRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const resolvedValue = clamp(value ?? uncontrolledValue, minimum, maximum);
  const style: SplitWorkspaceStyle = {
    '--split-workspace-left': `${resolvedValue}%`
  };

  function updateValue(nextValue: number) {
    const boundedValue = clamp(nextValue, minimum, maximum);

    // Pointer movement writes the shared coordinate synchronously so the divider
    // never waits for React scheduling before following the user's hand.
    workspaceRef.current?.style.setProperty('--split-workspace-left', `${boundedValue}%`);

    if (value === undefined) {
      setUncontrolledValue(boundedValue);
    }

    onValueChange?.(boundedValue);
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerRef.current = null;
    setIsDragging(false);
  }

  return (
    <div
      className={cx(
        'kitsune-split-workspace relative grid h-full min-h-0',
        splitWorkspaceAppearances[appearance],
        className
      )}
      ref={workspaceRef}
      style={style}
    >
      <ScrollPane>{left}</ScrollPane>
      <div className="min-h-0 min-w-0 overflow-hidden">{right}</div>
      <Slider
        aria-label={ariaLabel}
        className="pointer-events-none absolute inset-0 z-10"
        maxValue={maximum}
        minValue={minimum}
        onChange={(nextValue) => {
          if (typeof nextValue === 'number') {
            const semanticValue = Math.round(resolvedValue);
            const keyboardValue =
              nextValue === minimum || nextValue === maximum
                ? nextValue
                : resolvedValue + nextValue - semanticValue;
            updateValue(keyboardValue);
          }
        }}
        ref={sliderRef}
        step={1}
        value={Math.round(resolvedValue)}
        orientation="horizontal"
      >
        <SliderOutput className="sr-only">{`${resolvedValue} percent`}</SliderOutput>
        <SliderTrack className="pointer-events-none absolute inset-0 opacity-0">
          <SliderThumb className="kitsune-split-semantic-thumb sr-only" />
        </SliderTrack>
      </Slider>
      {/*
        React Aria normalizes a SliderThumb within its track. The pane divider
        instead needs the literal workspace percentage, so this direct-
        manipulation surface forwards focus and value semantics to the React
        Aria Slider while sharing the grid's exact CSS coordinate.
      */}
      <div
        aria-hidden
        className={cx(
          'kitsune-split-handle group absolute inset-y-0 z-20 flex w-12 -translate-x-6',
          'cursor-col-resize touch-none items-center justify-center'
        )}
        data-dragging={isDragging || undefined}
        onPointerCancel={finishPointerDrag}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
          }

          const workspace = workspaceRef.current;

          if (!workspace) {
            return;
          }

          const bounds = workspace.getBoundingClientRect();

          if (bounds.width <= 0) {
            return;
          }

          const dividerX = bounds.left + (resolvedValue / 100) * bounds.width;
          dragOffsetRef.current = event.clientX - dividerX;
          activePointerRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          sliderRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
          setIsDragging(true);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (activePointerRef.current !== event.pointerId) {
            return;
          }

          const bounds = workspaceRef.current?.getBoundingClientRect();

          if (!bounds || bounds.width <= 0) {
            return;
          }

          const dividerX = event.clientX - dragOffsetRef.current;
          updateValue(((dividerX - bounds.left) / bounds.width) * 100);
        }}
        onPointerUp={finishPointerDrag}
      >
        <span
          className={cx(
            'kitsune-split-grip h-16 w-1 rounded-sm bg-border transition-colors',
            'duration-fast ease-out-quart',
            'group-hover:bg-accent'
          )}
        />
      </div>
    </div>
  );
}
