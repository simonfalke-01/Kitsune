import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button as ReactAriaButton,
  Disclosure as ReactAriaDisclosure,
  DisclosureGroup as ReactAriaDisclosureGroup,
  DisclosurePanel as ReactAriaDisclosurePanel,
  Heading,
  type DisclosureGroupProps as ReactAriaDisclosureGroupProps,
  type DisclosureProps as ReactAriaDisclosureProps
} from 'react-aria-components';

import { cx, focusRing } from './styles';

export type DisclosureGroupProps = ReactAriaDisclosureGroupProps;

export function DisclosureGroup({ className, ...props }: DisclosureGroupProps) {
  return (
    <ReactAriaDisclosureGroup
      {...props}
      className={cx(
        'divide-y divide-border-subtle rounded-lg border border-border-subtle',
        'bg-surface-raised',
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}

export interface DisclosureProps extends Omit<ReactAriaDisclosureProps, 'children' | 'title'> {
  children: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}

export function Disclosure({ children, className, description, title, ...props }: DisclosureProps) {
  return (
    <ReactAriaDisclosure
      {...props}
      className={cx('group w-full', typeof className === 'string' ? className : undefined)}
    >
      <Heading className="m-0 flex w-full">
        <ReactAriaButton
          className={cx(
            'flex w-full flex-1 items-start justify-between gap-4 px-4 py-4 text-left',
            'text-sm text-text outline-none',
            'transition-colors duration-fast ease-out-quart',
            'hover:text-accent-text pressed:text-accent-text',
            focusRing
          )}
          slot="trigger"
        >
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="font-medium text-text">{title}</span>
            {description ? (
              <span className="text-sm font-normal text-text-muted">{description}</span>
            ) : null}
          </span>
          <ChevronRight
            aria-hidden
            className="mt-1 size-4 shrink-0 transition-transform duration-fast group-expanded:rotate-90"
          />
        </ReactAriaButton>
      </Heading>
      <ReactAriaDisclosurePanel className="kitsune-disclosure-panel text-sm text-text-muted">
        <div className="px-4 pb-4 pr-12">{children}</div>
      </ReactAriaDisclosurePanel>
    </ReactAriaDisclosure>
  );
}
