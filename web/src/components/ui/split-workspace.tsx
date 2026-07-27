'use client';

import { type CSSProperties, type ReactNode, useState } from 'react';
import { Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components';

import { cx } from './styles';

const splitWorkspaceAppearances = {
  contained: 'overflow-hidden rounded-lg border border-border-subtle bg-surface-raised',
  edge: 'overflow-hidden border-y border-border-subtle bg-surface-raised',
  workspace: 'overflow-hidden rounded-md bg-surface-raised'
} as const;

interface SplitWorkspaceStyle extends CSSProperties {
  '--split-workspace-left'?: string;
  '--split-workspace-maximum-inset'?: string;
  '--split-workspace-minimum'?: string;
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
  const resolvedValue = value ?? uncontrolledValue;
  const style: SplitWorkspaceStyle = {
    '--split-workspace-left': `${resolvedValue}%`,
    '--split-workspace-maximum-inset': `${100 - maximum}%`,
    '--split-workspace-minimum': `${minimum}%`
  };

  return (
    <div
      className={cx(
        'kitsune-split-workspace relative grid h-full min-h-0',
        splitWorkspaceAppearances[appearance],
        className
      )}
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
            if (value === undefined) {
              setUncontrolledValue(nextValue);
            }

            onValueChange?.(nextValue);
          }
        }}
        step={1}
        value={resolvedValue}
        orientation="horizontal"
      >
        <SliderOutput className="sr-only">
          {({ state }) => `${state.getThumbValue(0)} percent`}
        </SliderOutput>
        <SliderTrack className="kitsune-split-track absolute inset-y-0 touch-none">
          <SliderThumb
            className={cx(
              'kitsune-split-thumb group pointer-events-auto top-0 flex h-full w-12 -translate-x-6',
              'cursor-col-resize touch-none items-center justify-center outline-none'
            )}
          >
            <span
              className={cx(
                'kitsune-split-grip h-16 w-1 rounded-sm bg-border transition-colors',
                'duration-fast ease-out-quart',
                'group-hover:bg-accent group-focus-visible:bg-accent'
              )}
            />
          </SliderThumb>
        </SliderTrack>
      </Slider>
    </div>
  );
}
