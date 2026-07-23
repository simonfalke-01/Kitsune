import type { HTMLAttributes, ReactNode } from 'react';

import { cx } from './styles';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  action?: ReactNode;
  description: ReactNode;
  title: ReactNode;
}

export function EmptyState({ action, className, description, title, ...props }: EmptyStateProps) {
  return (
    <div
      {...props}
      className={cx(
        'flex flex-col items-center justify-center gap-4 rounded-lg',
        'border border-dashed border-border p-8 text-center',
        className
      )}
    >
      <div className="grid max-w-prose gap-2">
        <h3 className="m-0 font-display text-lg font-semibold text-text">{title}</h3>
        <p className="m-0 text-sm text-text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
