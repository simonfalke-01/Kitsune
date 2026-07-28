'use client';

import { ChevronRight } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import {
  Button as ReactAriaButton,
  Tree as ReactAriaTree,
  TreeItem as ReactAriaTreeItem,
  TreeItemContent as ReactAriaTreeItemContent,
  type TreeItemProps as ReactAriaTreeItemProps,
  type TreeProps as ReactAriaTreeProps
} from 'react-aria-components';

import { cx, insetFocusRing } from './styles';

const collectionTreeTones = {
  accent: 'border-l-accent',
  amber: 'border-l-category-amber',
  blue: 'border-l-category-blue',
  cyan: 'border-l-category-cyan',
  lime: 'border-l-category-lime',
  orange: 'border-l-category-orange',
  pink: 'border-l-category-pink',
  teal: 'border-l-category-teal',
  violet: 'border-l-category-violet'
} as const;

export interface CollectionTreeProps<T> extends Omit<
  ReactAriaTreeProps<T>,
  'children' | 'className'
> {
  children: ReactNode;
  className?: string;
}

/**
 * A single-tab-stop hierarchical collection. React Aria owns roving focus,
 * selection, expansion, typeahead, and press semantics for every item.
 */
export function CollectionTree<T>({ children, className, ...props }: CollectionTreeProps<T>) {
  return (
    <ReactAriaTree
      {...props}
      className={cx('m-0 grid list-none bg-surface-raised p-0 outline-none', className)}
    >
      {children}
    </ReactAriaTree>
  );
}

export interface CollectionTreeItemProps<T> extends Omit<
  ReactAriaTreeItemProps<T>,
  'children' | 'className'
> {
  appearance: 'category' | 'challenge';
  children?: ReactNode;
  content: ReactNode;
  itemRef?: Ref<HTMLDivElement>;
  meta?: ReactNode;
  tone?: keyof typeof collectionTreeTones;
}

export function CollectionTreeItem<T>({
  appearance,
  children,
  content,
  itemRef,
  meta,
  tone = 'accent',
  ...props
}: CollectionTreeItemProps<T>) {
  return (
    <ReactAriaTreeItem
      {...props}
      className={({ isSelected }) =>
        cx(
          'group relative w-full text-left text-text outline-none',
          'transition-colors duration-fast ease-out-quart',
          insetFocusRing,
          appearance === 'category'
            ? cx(
                'sticky top-challenge-list-header z-sticky bg-surface-sunken',
                'border-l-2',
                collectionTreeTones[tone]
              )
            : cx(
                'kitsune-challenge-row kitsune-optical-py-3 min-h-control cursor-pointer',
                'rounded-none pr-3 pl-4',
                isSelected &&
                  'bg-accent-subtle ring-1 ring-inset ring-accent-border hover:bg-accent-subtle'
              )
        )
      }
      ref={itemRef}
    >
      <ReactAriaTreeItemContent>
        {({ isExpanded, isSelected }) =>
          appearance === 'category' ? (
            <ReactAriaButton
              className={cx(
                'kitsune-optical-py-2 flex w-full cursor-pointer items-start',
                'justify-between gap-4 px-3 text-left text-sm text-inherit outline-none',
                'transition-colors duration-fast ease-out-quart',
                'hover:bg-surface-hover pressed:bg-surface-active',
                insetFocusRing
              )}
              slot="chevron"
            >
              <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
                <span className="min-w-0 font-medium">{content}</span>
                {meta ? (
                  <span className="shrink-0 text-sm font-normal tabular-nums text-inherit">
                    {meta}
                  </span>
                ) : null}
              </span>
              <ChevronRight
                aria-hidden
                className={cx(
                  'mt-1 size-4 shrink-0 transition-transform duration-fast',
                  isExpanded && 'rotate-90'
                )}
              />
            </ReactAriaButton>
          ) : (
            <>
              <span
                aria-hidden
                className={cx(
                  'kitsune-collection-marker absolute inset-y-0 left-0 w-rail rounded-none',
                  'bg-transparent transition-colors duration-fast ease-out-quart',
                  isSelected && 'bg-accent'
                )}
              />
              <span className="relative block">{content}</span>
            </>
          )
        }
      </ReactAriaTreeItemContent>
      {children}
    </ReactAriaTreeItem>
  );
}
