'use client';

import { Check } from 'lucide-react';
import {
  Menu as ReactAriaMenu,
  MenuItem as ReactAriaMenuItem,
  MenuTrigger,
  type MenuProps as ReactAriaMenuProps
} from 'react-aria-components';

import { Popover } from './popover';
import { collectionItem, cx } from './styles';

export { MenuTrigger };

export interface MenuOption {
  href?: string;
  id: number | string;
  isDisabled?: boolean;
  label: string;
  onAction?: () => void;
}

export interface MenuProps extends Omit<ReactAriaMenuProps<MenuOption>, 'children' | 'items'> {
  emptyMessage?: string;
  options: readonly MenuOption[];
}

export function Menu({
  className,
  emptyMessage = 'No actions available',
  options,
  ...props
}: MenuProps) {
  return (
    <Popover>
      <ReactAriaMenu
        {...props}
        className={cx(
          'grid min-w-menu gap-1 outline-none',
          typeof className === 'string' ? className : undefined
        )}
        items={options}
        renderEmptyState={() => (
          <div className="px-3 py-2 text-sm text-text-muted">{emptyMessage}</div>
        )}
      >
        {(option) => (
          <ReactAriaMenuItem
            className={collectionItem}
            href={option.href}
            id={option.id}
            isDisabled={option.isDisabled}
            onAction={option.onAction}
            textValue={option.label}
          >
            {({ isSelected }) => (
              <>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected ? <Check aria-hidden className="size-4 shrink-0" /> : null}
              </>
            )}
          </ReactAriaMenuItem>
        )}
      </ReactAriaMenu>
    </Popover>
  );
}
