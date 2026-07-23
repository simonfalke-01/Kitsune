import type { HTMLAttributes } from 'react';

import { cx, variantClass } from './styles';

const statusTones = {
  neutral: 'bg-text-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger'
} as const;

export type StatusTone = keyof typeof statusTones;

export interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  tone?: StatusTone;
}

export function StatusIndicator({
  className,
  label,
  tone = 'neutral',
  ...props
}: StatusIndicatorProps) {
  return (
    <span {...props} className={cx('inline-flex items-center gap-2 text-sm text-text', className)}>
      <span
        aria-hidden
        className={cx('size-2 shrink-0 rounded-full', variantClass(statusTones, tone))}
      />
      <span>{label}</span>
    </span>
  );
}
