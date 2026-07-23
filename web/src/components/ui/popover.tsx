'use client';

import {
  Dialog as ReactAriaDialog,
  Popover as ReactAriaPopover,
  type DialogProps as ReactAriaDialogProps,
  type PopoverProps as ReactAriaPopoverProps
} from 'react-aria-components';

import { cx, overlaySurface } from './styles';

export type PopoverProps = ReactAriaPopoverProps;

export function Popover({ className, ...props }: PopoverProps) {
  return (
    <ReactAriaPopover
      {...props}
      className={cx(
        overlaySurface,
        'min-w-menu max-w-prose',
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}

export type PopoverDialogProps = ReactAriaDialogProps;

export function PopoverDialog({ className, ...props }: PopoverDialogProps) {
  return (
    <ReactAriaDialog
      {...props}
      className={cx(
        'max-w-prose p-3 text-sm text-text outline-none',
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}
