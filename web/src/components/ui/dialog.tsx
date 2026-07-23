'use client';

import { X } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import {
  Dialog as ReactAriaDialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  type DialogProps as ReactAriaDialogProps
} from 'react-aria-components';

import { Button } from './button';
import { cx } from './styles';

export { DialogTrigger };

const overlayClass = cx(
  'fixed inset-0 z-overlay flex min-h-full items-center justify-center',
  'bg-overlay p-4 entering:opacity-0 exiting:opacity-0',
  'transition-opacity duration-normal ease-out-quart'
);

const modalClass = cx(
  'w-full max-w-prose rounded-lg border border-border-subtle',
  'bg-surface-raised p-6 shadow-lg outline-none',
  'entering:translate-y-1 entering:opacity-0',
  'exiting:translate-y-1 exiting:opacity-0',
  'transition duration-normal ease-out-quart'
);

const dialogClass = 'grid gap-6 outline-none';

export interface DialogProps extends Omit<ReactAriaDialogProps, 'children' | 'aria-label'> {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  title: string;
}

export function Dialog({
  actions,
  children,
  className,
  description,
  title,
  ...props
}: DialogProps) {
  const descriptionId = useId();

  return (
    <ModalOverlay className={overlayClass} isDismissable>
      <Modal className={modalClass}>
        <ReactAriaDialog
          {...props}
          aria-describedby={description ? descriptionId : undefined}
          aria-label={title}
          className={cx(dialogClass, typeof className === 'string' ? className : undefined)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="grid min-w-0 flex-1 gap-2">
              <Heading className="font-display text-xl font-semibold tracking-tight" slot="title">
                {title}
              </Heading>
              {description ? (
                <p className="m-0 max-w-prose text-sm text-text-muted" id={descriptionId}>
                  {description}
                </p>
              ) : null}
            </div>
            <Button aria-label="Close dialog" size="icon" slot="close" tone="quiet">
              <X aria-hidden className="size-4" />
            </Button>
          </div>
          <div>{children}</div>
          {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
        </ReactAriaDialog>
      </Modal>
    </ModalOverlay>
  );
}

export interface AlertDialogProps extends Omit<
  ReactAriaDialogProps,
  'children' | 'aria-label' | 'role'
> {
  actions: ReactNode;
  children?: ReactNode;
  description: ReactNode;
  title: string;
}

export function AlertDialog({
  actions,
  children,
  className,
  description,
  title,
  ...props
}: AlertDialogProps) {
  const descriptionId = useId();

  return (
    <ModalOverlay className={overlayClass}>
      <Modal className={modalClass}>
        <ReactAriaDialog
          {...props}
          aria-describedby={descriptionId}
          aria-label={title}
          className={cx(dialogClass, typeof className === 'string' ? className : undefined)}
          role="alertdialog"
        >
          <div className="grid gap-2">
            <Heading className="font-display text-xl font-semibold tracking-tight" slot="title">
              {title}
            </Heading>
            <p className="m-0 max-w-prose text-sm text-text-muted" id={descriptionId}>
              {description}
            </p>
          </div>
          {children ? <div>{children}</div> : null}
          <div className="flex flex-wrap justify-end gap-2">{actions}</div>
        </ReactAriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
