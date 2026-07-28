import type { HTMLAttributes, ReactNode } from 'react';

import { cx } from './styles';

const emptyStateAppearances = {
  bounded: 'rounded-lg border border-dashed border-border p-8',
  plain: 'p-6'
} as const;

const emptyStateTitleAppearances = {
  bounded: 'text-text',
  plain: 'text-text-muted'
} as const;

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  action?: ReactNode;
  appearance?: keyof typeof emptyStateAppearances;
  description?: ReactNode;
  title: ReactNode;
}

export function EmptyState({
  action,
  appearance = 'bounded',
  className,
  description,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div
      {...props}
      className={cx(
        'flex flex-col items-center justify-center gap-4 text-center',
        emptyStateAppearances[appearance],
        className
      )}
    >
      <div className="grid max-w-prose gap-2">
        <h3
          className={cx(
            'm-0 font-display text-lg font-semibold',
            emptyStateTitleAppearances[appearance]
          )}
        >
          {title}
        </h3>
        {description ? <p className="m-0 text-sm text-text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
