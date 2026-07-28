'use client';

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

import { cx, focusRing, variantClass } from './styles';

const disclosureGroupAppearances = {
  card: 'divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface-raised',
  plain: 'grid gap-0'
} as const;

const disclosureDensities = {
  compact: {
    panel: 'p-0',
    trigger: 'kitsune-optical-py-2 px-3 text-sm'
  },
  standard: {
    panel: 'px-4 pb-4 pr-12',
    trigger: 'kitsune-optical-py-4 px-4 text-sm'
  },
  spacious: {
    panel: 'px-6 pb-6 pr-12',
    trigger: 'kitsune-optical-py-6 px-6 text-base'
  }
} as const;

export type DisclosureDensity = keyof typeof disclosureDensities;

export interface DisclosureGroupProps extends ReactAriaDisclosureGroupProps {
  appearance?: keyof typeof disclosureGroupAppearances;
}

export function DisclosureGroup({
  appearance = 'card',
  className,
  ...props
}: DisclosureGroupProps) {
  return (
    <ReactAriaDisclosureGroup
      {...props}
      className={cx(
        variantClass(disclosureGroupAppearances, appearance),
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}

export interface DisclosureProps extends Omit<ReactAriaDisclosureProps, 'children' | 'title'> {
  children: ReactNode;
  density?: DisclosureDensity;
  description?: ReactNode;
  headingClassName?: string;
  headingLevel?: 2 | 3 | 4;
  meta?: ReactNode;
  title: ReactNode;
  tone?: 'default' | 'inherit';
  triggerClassName?: string;
}

export function Disclosure({
  children,
  className,
  density = 'standard',
  description,
  headingClassName,
  headingLevel = 3,
  meta,
  title,
  tone = 'default',
  triggerClassName,
  ...props
}: DisclosureProps) {
  return (
    <ReactAriaDisclosure
      {...props}
      className={cx('group w-full', typeof className === 'string' ? className : undefined)}
    >
      <Heading className={cx('m-0 flex w-full', headingClassName)} level={headingLevel}>
        <ReactAriaButton
          className={cx(
            'flex w-full flex-1 items-start justify-between gap-4 text-left',
            tone === 'inherit' ? 'text-inherit' : 'text-text',
            'cursor-pointer outline-none disabled:cursor-not-allowed',
            variantClass(
              {
                compact: disclosureDensities.compact.trigger,
                spacious: disclosureDensities.spacious.trigger,
                standard: disclosureDensities.standard.trigger
              },
              density
            ),
            'transition-colors duration-fast ease-out-quart',
            tone === 'inherit'
              ? 'hover:bg-surface-hover hover:text-inherit pressed:bg-surface-active pressed:text-inherit'
              : 'hover:text-accent-text pressed:text-accent-text',
            focusRing,
            triggerClassName
          )}
          slot="trigger"
        >
          <span className="flex min-w-0 flex-1 items-center justify-between gap-4">
            <span className="grid min-w-0 gap-1">
              <span
                className={cx('font-medium', tone === 'inherit' ? 'text-inherit' : 'text-text')}
              >
                {title}
              </span>
              {description ? (
                <span
                  className={cx(
                    'text-sm font-normal',
                    tone === 'inherit' ? 'text-inherit' : 'text-text-muted'
                  )}
                >
                  {description}
                </span>
              ) : null}
            </span>
            {meta ? (
              <span
                className={cx(
                  'shrink-0 text-sm font-normal tabular-nums',
                  tone === 'inherit' ? 'text-inherit' : 'text-text-muted'
                )}
              >
                {meta}
              </span>
            ) : null}
          </span>
          <ChevronRight
            aria-hidden
            className="mt-1 size-4 shrink-0 transition-transform duration-fast group-expanded:rotate-90"
          />
        </ReactAriaButton>
      </Heading>
      <ReactAriaDisclosurePanel className="kitsune-disclosure-panel text-base text-text-muted">
        <div
          className={variantClass(
            {
              compact: disclosureDensities.compact.panel,
              spacious: disclosureDensities.spacious.panel,
              standard: disclosureDensities.standard.panel
            },
            density
          )}
        >
          {children}
        </div>
      </ReactAriaDisclosurePanel>
    </ReactAriaDisclosure>
  );
}
