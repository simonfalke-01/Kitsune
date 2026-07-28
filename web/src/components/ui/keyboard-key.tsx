import type { HTMLAttributes } from 'react';

import { cx } from './styles';

export function KeyboardKey({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      {...props}
      className={cx(
        'min-w-8 rounded-sm border border-border-subtle bg-surface-sunken px-2 py-1',
        'text-center font-mono text-xs font-medium tabular-nums text-text',
        className
      )}
    />
  );
}
