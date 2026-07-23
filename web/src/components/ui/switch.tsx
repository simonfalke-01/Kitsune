'use client';

import type { ReactNode } from 'react';
import {
  Switch as ReactAriaSwitch,
  type SwitchProps as ReactAriaSwitchProps
} from 'react-aria-components';

import { cx, focusRing } from './styles';

export interface SwitchProps extends Omit<ReactAriaSwitchProps, 'children'> {
  description?: ReactNode;
  label: ReactNode;
}

export function Switch({ className, description, label, ...props }: SwitchProps) {
  return (
    <ReactAriaSwitch
      {...props}
      className={cx(
        'group flex items-start gap-3 rounded-md',
        'text-sm text-text outline-none',
        'disabled:cursor-not-allowed disabled:text-text-subtle',
        focusRing,
        typeof className === 'string' ? className : undefined
      )}
    >
      <span
        aria-hidden
        className={cx(
          'mt-1 flex w-8 shrink-0 rounded-full border border-border',
          'bg-surface-active p-1 transition-colors duration-fast',
          'ease-out-quart group-selected:border-accent',
          'group-selected:bg-accent'
        )}
      >
        <span
          className={cx(
            'size-3 rounded-full bg-surface-raised shadow-sm',
            'transition-transform duration-fast ease-out-quart',
            'group-selected:translate-x-3'
          )}
        />
      </span>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="font-medium">{label}</span>
        {description ? <span className="text-text-muted">{description}</span> : null}
      </span>
    </ReactAriaSwitch>
  );
}
