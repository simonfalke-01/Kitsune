'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
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

export { DialogTrigger as SheetTrigger };

export interface SheetProps extends Omit<ReactAriaDialogProps, 'children' | 'aria-label'> {
  children: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  title: string;
}

export function Sheet({ children, className, description, footer, title, ...props }: SheetProps) {
  return (
    <ModalOverlay
      className={cx(
        'fixed inset-0 z-overlay flex justify-end bg-overlay',
        'entering:opacity-0 exiting:opacity-0',
        'transition-opacity duration-normal ease-out-quart'
      )}
      isDismissable
    >
      <Modal
        className={cx(
          'h-full w-full max-w-prose overflow-y-auto border-l border-border-subtle',
          'bg-surface-raised shadow-lg outline-none',
          'entering:translate-x-6 exiting:translate-x-6',
          'transition-transform duration-normal ease-out-quart'
        )}
      >
        <ReactAriaDialog
          {...props}
          aria-label={title}
          className={cx(
            'flex min-h-full flex-col outline-none',
            typeof className === 'string' ? className : undefined
          )}
        >
          <header
            className={cx(
              'sticky top-0 flex items-start justify-between gap-4',
              'border-b border-border-subtle bg-surface-raised p-6'
            )}
          >
            <div className="grid min-w-0 flex-1 gap-2">
              <Heading
                className="m-0 font-display text-xl font-semibold tracking-tight"
                slot="title"
              >
                {title}
              </Heading>
              {description ? <p className="m-0 text-sm text-text-muted">{description}</p> : null}
            </div>
            <Button aria-label="Close panel" size="icon" slot="close" tone="quiet">
              <X aria-hidden className="size-4" />
            </Button>
          </header>
          <div className="flex-1 p-6">{children}</div>
          {footer ? (
            <footer
              className={cx(
                'sticky bottom-0 flex flex-wrap justify-end gap-2',
                'border-t border-border-subtle bg-surface-raised p-4'
              )}
            >
              {footer}
            </footer>
          ) : null}
        </ReactAriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
