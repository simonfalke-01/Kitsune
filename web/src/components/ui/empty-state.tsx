import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cx } from './styles';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  action?: ReactNode;
  description: ReactNode;
  icon?: LucideIcon;
  title: ReactNode;
}

export function EmptyState({
  action,
  className,
  description,
  icon: Icon,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div
      {...props}
      className={cx(
        'flex flex-col items-center justify-center gap-4 rounded-lg',
        'border border-dashed border-border p-8 text-center',
        className
      )}
    >
      {Icon ? (
        <div className="rounded-lg border border-border-subtle bg-surface-sunken p-3">
          <Icon aria-hidden className="size-6 text-text-muted" />
        </div>
      ) : null}
      <div className="grid max-w-prose gap-2">
        <h3 className="m-0 font-display text-lg font-semibold text-text">{title}</h3>
        <p className="m-0 text-sm text-text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
