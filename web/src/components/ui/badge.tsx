import type { HTMLAttributes } from 'react';

import { cx, variantClass } from './styles';

const badgeTones = {
  neutral: 'border-border-subtle bg-surface-sunken text-text-muted',
  accent: 'border-accent-border bg-accent-subtle text-accent-text',
  success: 'border-success-border bg-success-subtle text-success-text',
  warning: 'border-warning-border bg-warning-subtle text-warning-text',
  danger: 'border-danger-border bg-danger-subtle text-danger-text',
  info: 'border-info-border bg-info-subtle text-info-text'
} as const;

export type BadgeTone = keyof typeof badgeTones;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cx(
        'inline-flex w-fit items-center gap-1 rounded-sm border px-2 py-1',
        'text-xs font-medium',
        variantClass(badgeTones, tone),
        className
      )}
    />
  );
}
