'use client';

import type { ReactNode, Ref } from 'react';
import {
  Button as ReactAriaButton,
  type ButtonProps as ReactAriaButtonProps
} from 'react-aria-components';

import { cx, insetFocusRing } from './styles';

export interface CollectionButtonProps extends Omit<
  ReactAriaButtonProps,
  'children' | 'className'
> {
  children: ReactNode;
  className?: string;
  isSelected?: boolean;
  itemRef?: Ref<HTMLButtonElement>;
}

/** A full-row React Aria action that remains programmatically focusable. */
export function CollectionButton({
  children,
  className,
  isSelected = false,
  itemRef,
  ...props
}: CollectionButtonProps) {
  return (
    <ReactAriaButton
      {...props}
      aria-current={isSelected ? 'true' : undefined}
      className={cx(
        'group relative block w-full cursor-pointer',
        'kitsune-optical-py-3 min-h-control rounded-none pr-3 pl-4',
        'text-left text-text outline-none',
        'transition-colors duration-fast ease-out-quart hover:bg-surface-hover',
        isSelected &&
          'bg-accent-subtle ring-1 ring-inset ring-accent-border hover:bg-accent-subtle',
        insetFocusRing,
        className
      )}
      ref={itemRef}
    >
      <span
        aria-hidden
        className={cx(
          'kitsune-collection-marker absolute inset-y-0 left-0 w-rail rounded-none',
          'bg-transparent transition-colors duration-fast ease-out-quart',
          isSelected && 'bg-accent'
        )}
      />
      <span className="relative block">{children}</span>
    </ReactAriaButton>
  );
}
