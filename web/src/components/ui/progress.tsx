'use client';

import type { CSSProperties } from 'react';
import {
  Label,
  ProgressBar as ReactAriaProgressBar,
  type ProgressBarProps as ReactAriaProgressBarProps
} from 'react-aria-components';

import { cx, variantClass } from './styles';

const progressTones = {
  accent: 'bg-accent',
  amber: 'bg-category-amber',
  blue: 'bg-category-blue',
  cyan: 'bg-category-cyan',
  danger: 'bg-danger',
  lime: 'bg-category-lime',
  orange: 'bg-category-orange',
  pink: 'bg-category-pink',
  success: 'bg-success',
  teal: 'bg-category-teal',
  violet: 'bg-category-violet',
  warning: 'bg-warning'
} as const;

export type ProgressTone = keyof typeof progressTones;

function scaleFor(percentage: number | undefined): string {
  return `scaleX(${(percentage ?? 0) / 100})`;
}

function progressStyle(percentage: number | undefined): CSSProperties {
  return {
    transform: scaleFor(percentage)
  };
}

export interface ProgressProps extends ReactAriaProgressBarProps {
  appearance?: 'compact' | 'standard' | 'trail';
  label: string;
  tone?: ProgressTone;
}

export function Progress({
  appearance = 'standard',
  className,
  label,
  tone = 'accent',
  ...props
}: ProgressProps) {
  return (
    <ReactAriaProgressBar
      {...props}
      className={cx(
        appearance === 'standard' ? 'grid gap-2 text-sm' : 'block',
        typeof className === 'string' ? className : undefined
      )}
    >
      {({ percentage, valueText }) =>
        appearance === 'trail' || appearance === 'compact' ? (
          <>
            <Label className="sr-only">{label}</Label>
            <div
              className={cx(
                'h-1 overflow-hidden bg-surface-active',
                appearance === 'compact' ? 'rounded-sm' : null
              )}
            >
              <div
                className={cx(
                  'h-full origin-left transition-transform',
                  appearance === 'compact' ? 'rounded-sm' : null,
                  'duration-normal ease-out-quart',
                  variantClass(progressTones, tone)
                )}
                style={progressStyle(percentage)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <Label className="font-medium text-text">{label}</Label>
              <span className="text-xs text-text-muted tabular-nums">{valueText}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-sm bg-surface-active">
              <div
                className={cx(
                  'h-full origin-left rounded-sm transition-transform',
                  'duration-normal ease-out-quart',
                  variantClass(progressTones, tone)
                )}
                style={progressStyle(percentage)}
              />
            </div>
          </>
        )
      }
    </ReactAriaProgressBar>
  );
}

export interface MeterProps extends ReactAriaProgressBarProps {
  label: string;
  tone?: ProgressTone;
}

export function Meter({ className, label, tone = 'accent', ...props }: MeterProps) {
  return (
    <ReactAriaProgressBar
      {...props}
      className={cx('grid gap-2 text-sm', typeof className === 'string' ? className : undefined)}
    >
      {({ percentage, valueText }) => (
        <>
          <div className="flex items-center justify-between gap-4">
            <Label className="font-medium text-text">{label}</Label>
            <span className="text-xs text-text-muted tabular-nums">{valueText}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-sm bg-surface-active">
            <div
              className={cx(
                'h-full origin-left rounded-sm transition-transform',
                'duration-normal ease-out-quart',
                variantClass(progressTones, tone)
              )}
              style={progressStyle(percentage)}
            />
          </div>
        </>
      )}
    </ReactAriaProgressBar>
  );
}
