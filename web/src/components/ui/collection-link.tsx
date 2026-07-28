'use client';

import type { ReactNode } from 'react';
import { Link as ReactAriaLink, type LinkProps as ReactAriaLinkProps } from 'react-aria-components';

import { cx, focusRing } from './styles';

const collectionLinkAppearances = {
  challenge: 'kitsune-optical-py-3 min-h-control rounded-none pr-3 pl-4',
  row: 'kitsune-optical-py-3 min-h-control rounded-md px-3',
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

const challengeFocusRing =
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-text';

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
  onKeyDown,
  tone = 'accent',
  ...props
}: CollectionLinkProps) {
  return (
    <ReactAriaLink
      {...props}
      aria-current={isSelected ? 'true' : undefined}
      data-tone={tone}
      onKeyDown={(event) => {
        onKeyDown?.(event);

        if (
          appearance === 'challenge' &&
          event.key === ' ' &&
          !event.defaultPrevented &&
          !event.repeat
        ) {
          event.preventDefault();
          const link = event.currentTarget as HTMLAnchorElement;
          link.click();
        }
      }}
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
        appearance === 'challenge' ? challengeFocusRing : focusRing,
        typeof className === 'string' ? className : undefined
      )}
    >
      <span
        aria-hidden
        className={cx(
          'kitsune-collection-marker absolute bg-transparent',
          appearance === 'tile'
            ? 'inset-x-4 top-0 h-1 rounded-sm'
            : appearance === 'challenge'
              ? 'inset-y-0 left-0 w-rail rounded-none'
              : 'inset-y-3 left-0 w-1 rounded-sm',
          'transition-colors duration-fast ease-out-quart',
          (appearance === 'tile' || isSelected) &&
            collectionLinkMarkers[appearance === 'challenge' ? 'accent' : tone]
        )}
      />
      <span className="relative block">{children}</span>
    </ReactAriaLink>
  );
}
