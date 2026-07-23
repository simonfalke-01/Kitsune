import type { HTMLAttributes } from 'react';

import { cx } from './styles';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-hidden
      className={cx('animate-pulse rounded-md bg-surface-active', className)}
    />
  );
}

export function TextSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-label="Loading content" className="grid gap-2" role="status">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton className={index === lines - 1 ? 'h-3 w-2/3' : 'h-3 w-full'} key={index} />
      ))}
    </div>
  );
}
