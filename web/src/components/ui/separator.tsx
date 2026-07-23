import type { HTMLAttributes } from 'react';

import { cx } from './styles';

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}

export function Separator({ className, orientation = 'horizontal', ...props }: SeparatorProps) {
  return (
    <div
      {...props}
      aria-orientation={orientation}
      className={cx(
        'shrink-0 bg-border-subtle',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      role="separator"
    />
  );
}
