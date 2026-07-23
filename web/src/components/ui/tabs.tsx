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

export type TabsProps = ReactAriaTabsProps;

export function Tabs({ className, ...props }: TabsProps) {
  return (
    <ReactAriaTabs
      {...props}
      className={cx('grid gap-4', typeof className === 'string' ? className : undefined)}
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
        'shrink-0 rounded-t-md border-b-2 border-transparent',
        'px-3 py-2 text-sm font-medium text-text-muted outline-none',
        'transition-colors duration-fast ease-out-quart',
        'hover:bg-surface-hover hover:text-text',
        'selected:border-accent selected:text-text',
        'disabled:text-text-subtle',
        focusRing,
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}

export function TabsPanel({ className, ...props }: TabPanelProps) {
  return (
    <TabPanel
      {...props}
      className={cx(
        'rounded-md outline-none',
        focusRing,
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}
