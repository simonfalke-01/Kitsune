'use client';

import {
  Tooltip as ReactAriaTooltip,
  TooltipTrigger,
  type TooltipProps as ReactAriaTooltipProps
} from 'react-aria-components';

import { cx } from './styles';

export { TooltipTrigger };

export type TooltipProps = ReactAriaTooltipProps;

export function Tooltip({ className, ...props }: TooltipProps) {
  return (
    <ReactAriaTooltip
      {...props}
      className={cx(
        'max-w-prose rounded-md border border-border-subtle',
        'bg-surface-raised px-3 py-2 text-sm text-text shadow-md',
        'entering:translate-y-1 entering:opacity-0',
        'exiting:translate-y-1 exiting:opacity-0',
        'transition duration-fast ease-out-quart',
        typeof className === 'string' ? className : undefined
      )}
      offset={8}
    />
  );
}
