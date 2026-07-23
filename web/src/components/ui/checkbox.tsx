import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Checkbox as ReactAriaCheckbox,
  type CheckboxProps as ReactAriaCheckboxProps
} from 'react-aria-components';

import { cx, focusRing } from './styles';

export interface CheckboxProps extends Omit<ReactAriaCheckboxProps, 'children'> {
  children: ReactNode;
}

export function Checkbox({ children, className, ...props }: CheckboxProps) {
  return (
    <ReactAriaCheckbox
      {...props}
      className={cx(
        'group inline-flex items-start gap-2 rounded-sm text-sm text-text',
        'outline-none disabled:cursor-not-allowed disabled:text-text-subtle',
        focusRing,
        typeof className === 'string' ? className : undefined
      )}
    >
      {({ isIndeterminate, isSelected }) => (
        <>
          <span
            aria-hidden
            className={cx(
              'mt-1 flex size-4 shrink-0 items-center justify-center',
              'rounded-sm border border-border bg-surface-raised',
              'text-text-on-accent transition-colors duration-fast',
              'ease-out-quart group-hover:border-border-strong',
              'group-selected:border-accent group-selected:bg-accent',
              'group-invalid:border-danger'
            )}
          >
            {isIndeterminate ? <Minus className="size-3" /> : null}
            {isSelected && !isIndeterminate ? <Check className="size-3" /> : null}
          </span>
          <span>{children}</span>
        </>
      )}
    </ReactAriaCheckbox>
  );
}
