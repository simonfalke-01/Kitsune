'use client';

import type { ReactNode } from 'react';
import { Link as ReactAriaLink, type LinkProps as ReactAriaLinkProps } from 'react-aria-components';

import { cx, focusRing } from './styles';

const collectionLinkAppearances = {
  challenge: 'min-h-control rounded-none px-3 py-3',
  row: 'min-h-control rounded-md px-3 py-3',
  tile: 'h-full min-h-control rounded-lg border border-border-subtle bg-surface-raised p-4 shadow-sm hover:border-border'
} as const;

const collectionLinkMarkers = {
  accent: 'bg-accent',
  amber: 'bg-category-amber',
  blue: 'bg-category-blue',
  cyan: 'bg-category-cyan',
  lime: 'bg-category-lime',
  orange: 'bg-category-orange',
  pink: 'bg-category-pink',
  teal: 'bg-category-teal',
  violet: 'bg-category-violet'
} as const;

export interface CollectionLinkProps extends Omit<ReactAriaLinkProps, 'children'> {
  appearance?: keyof typeof collectionLinkAppearances;
  children: ReactNode;
  isSelected?: boolean;
  tone?: keyof typeof collectionLinkMarkers;
}

export function CollectionLink({
  appearance = 'row',
  children,
  className,
  isSelected = false,
  tone = 'accent',
  ...props
}: CollectionLinkProps) {
  return (
    <ReactAriaLink
      {...props}
      aria-current={isSelected ? 'true' : undefined}
      data-tone={tone}
      className={cx(
        'group relative block w-full',
        collectionLinkAppearances[appearance],
        'text-left text-text no-underline outline-none',
        'transition-colors duration-fast ease-out-quart',
        'hover:bg-surface-hover',
        isSelected &&
          (appearance === 'challenge'
            ? 'bg-accent-subtle ring-1 ring-inset ring-accent-border hover:bg-accent-subtle'
            : 'border-accent-border bg-accent-subtle'),
        focusRing,
        typeof className === 'string' ? className : undefined
      )}
    >
      <span
        aria-hidden
        className={cx(
          'absolute rounded-sm bg-transparent',
          appearance === 'tile'
            ? 'inset-x-4 top-0 h-1'
            : appearance === 'challenge'
              ? 'inset-y-0 left-0 w-1 rounded-none'
              : 'inset-y-3 left-0 w-1',
          'transition-colors duration-fast ease-out-quart',
          (appearance === 'tile' || isSelected) &&
            collectionLinkMarkers[appearance === 'challenge' ? 'accent' : tone]
        )}
      />
      <span className="relative block">{children}</span>
    </ReactAriaLink>
  );
}
