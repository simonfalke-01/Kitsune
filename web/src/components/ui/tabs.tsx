'use client';

import type { Ref } from 'react';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs as ReactAriaTabs,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps as ReactAriaTabsProps
} from 'react-aria-components';

import { cx, focusRing } from './styles';

export interface TabsProps extends ReactAriaTabsProps {
  layout?: 'content' | 'workspace';
}

export function Tabs({ className, layout = 'content', ...props }: TabsProps) {
  return (
    <ReactAriaTabs
      {...props}
      className={cx(
        layout === 'content' ? 'grid gap-4' : 'flex min-h-0 flex-1 flex-col gap-0',
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}

export function TabsList<T extends object>({ className, ...props }: TabListProps<T>) {
  return (
    <TabList
      {...props}
      className={cx(
        'flex gap-1 overflow-x-auto border-b border-border-subtle',
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}

export function TabsTab({ className, ...props }: TabProps) {
  return (
    <Tab
      {...props}
      className={cx(
        'shrink-0 border-b-2 border-transparent',
        'kitsune-optical-py-3 px-3 text-sm font-medium text-text-muted outline-none',
        'transition-colors duration-fast ease-out-quart',
        'hover:text-text',
        'selected:border-accent selected:text-text',
        'disabled:text-text-subtle',
        focusRing,
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}

export interface TabsPanelProps extends TabPanelProps {
  panelRef?: Ref<HTMLDivElement>;
}

export function TabsPanel({ className, panelRef, ...props }: TabsPanelProps) {
  return (
    <TabPanel
      {...props}
      className={cx(
        'rounded-md outline-none inert:hidden',
        focusRing,
        typeof className === 'string' ? className : undefined
      )}
      ref={panelRef}
    />
  );
}
