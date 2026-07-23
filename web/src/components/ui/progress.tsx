'use client';

import {
  Label,
  ProgressBar as ReactAriaProgressBar,
  type ProgressBarProps as ReactAriaProgressBarProps
} from 'react-aria-components';

import { cx, variantClass } from './styles';

const progressTones = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger'
} as const;

export type ProgressTone = keyof typeof progressTones;

function scaleFor(percentage: number | undefined): string {
  return `scaleX(${(percentage ?? 0) / 100})`;
}

export interface ProgressProps extends ReactAriaProgressBarProps {
  label: string;
  tone?: ProgressTone;
}

export function Progress({ className, label, tone = 'accent', ...props }: ProgressProps) {
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
              style={{
                transform: scaleFor(percentage)
              }}
            />
          </div>
        </>
      )}
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
              style={{
                transform: scaleFor(percentage)
              }}
            />
          </div>
        </>
      )}
    </ReactAriaProgressBar>
  );
}
