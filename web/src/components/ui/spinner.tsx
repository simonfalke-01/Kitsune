import { LoaderCircle } from 'lucide-react';
import type { HTMLAttributes } from 'react';

import { cx } from './styles';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  label?: string;
}

export function Spinner({ className, label = 'Loading', ...props }: SpinnerProps) {
  return (
    <span
      {...props}
      aria-label={label}
      className={cx('inline-flex items-center justify-center text-text-muted', className)}
      role="status"
    >
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
    </span>
  );
}
