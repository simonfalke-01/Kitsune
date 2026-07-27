'use client';

import {
  Dialog as ReactAriaDialog,
  Popover as ReactAriaPopover,
  type DialogProps as ReactAriaDialogProps,
  type PopoverProps as ReactAriaPopoverProps
} from 'react-aria-components';

import { cx, overlaySurface } from './styles';

const popoverSizes = {
  content: 'min-w-menu max-w-prose',
  wide: 'w-full max-w-detail'
} as const;

export interface PopoverProps extends ReactAriaPopoverProps {
  size?: keyof typeof popoverSizes;
}

export function Popover({ className, size = 'content', ...props }: PopoverProps) {
  return (
    <ReactAriaPopover
      {...props}
      className={cx(
        overlaySurface,
        popoverSizes[size],
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}

const popoverDialogSizes = {
  content: 'max-w-prose',
  wide: 'w-full max-w-detail'
} as const;

export interface PopoverDialogProps extends ReactAriaDialogProps {
  size?: keyof typeof popoverDialogSizes;
}

export function PopoverDialog({ className, size = 'content', ...props }: PopoverDialogProps) {
  return (
    <ReactAriaDialog
      {...props}
      className={cx(
        'p-3 text-sm text-text outline-none',
        popoverDialogSizes[size],
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}
