import type { HTMLAttributes } from 'react';

import { cx } from './styles';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <article
      {...props}
      className={cx(
        'rounded-lg border border-border-subtle bg-surface-raised',
        'text-text',
        className
      )}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <header {...props} className={cx('grid gap-3 p-6 pb-4', className)} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      {...props}
      className={cx('m-0 font-display text-lg font-semibold tracking-tight text-text', className)}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={cx('m-0 max-w-prose text-sm text-text-muted', className)} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx('px-6 pb-6', className)} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <footer
      {...props}
      className={cx(
        'flex flex-wrap items-center justify-end gap-2',
        'border-t border-border-subtle px-6 py-4',
        className
      )}
    />
  );
}
