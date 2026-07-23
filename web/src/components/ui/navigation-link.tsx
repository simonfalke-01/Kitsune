'use client';

import { Link as ReactAriaLink, type LinkProps as ReactAriaLinkProps } from 'react-aria-components';

import { cx, focusRing } from './styles';

export interface NavigationLinkProps extends ReactAriaLinkProps {
  isCurrent?: boolean;
}

export function NavigationLink({ className, isCurrent = false, ...props }: NavigationLinkProps) {
  return (
    <ReactAriaLink
      {...props}
      aria-current={isCurrent ? 'page' : undefined}
      className={cx(
        'flex min-h-control items-center gap-3 rounded-md border border-transparent px-3',
        'text-sm font-medium text-text-muted no-underline outline-none',
        'transition-colors duration-fast ease-out-quart',
        'hover:bg-surface-hover hover:text-text',
        isCurrent && 'border-border-subtle bg-surface-raised text-text',
        focusRing,
        typeof className === 'string' ? className : undefined
      )}
    >
      {({ defaultChildren }) => <span className="min-w-0 flex-1 truncate">{defaultChildren}</span>}
    </ReactAriaLink>
  );
}
