import type { ReactNode } from 'react';
import {
  FieldError,
  Label,
  Radio as ReactAriaRadio,
  RadioGroup as ReactAriaRadioGroup,
  Text,
  type RadioGroupProps as ReactAriaRadioGroupProps
} from 'react-aria-components';

import { cx, fieldDescription, fieldError, fieldGroup, fieldLabel, focusRing } from './styles';

export interface RadioOption {
  description?: ReactNode;
  label: ReactNode;
  value: string;
}

export interface RadioGroupProps extends Omit<ReactAriaRadioGroupProps, 'children'> {
  description?: ReactNode;
  errorMessage?: ReactNode;
  label: ReactNode;
  options: readonly RadioOption[];
}

export function RadioGroup({
  className,
  description,
  errorMessage,
  label,
  options,
  ...props
}: RadioGroupProps) {
  return (
    <ReactAriaRadioGroup
      {...props}
      className={cx(fieldGroup, typeof className === 'string' ? className : undefined)}
    >
      <Label className={fieldLabel}>{label}</Label>
      {description ? (
        <Text className={fieldDescription} slot="description">
          {description}
        </Text>
      ) : null}
      <div className="grid gap-2">
        {options.map((option) => (
          <ReactAriaRadio
            className={cx(
              'group flex rounded-md border border-border-subtle',
              'bg-surface-raised p-3 text-sm outline-none',
              'transition-colors duration-fast ease-out-quart',
              'hover:border-border selected:border-accent-border',
              'selected:bg-accent-subtle disabled:text-text-subtle',
              focusRing
            )}
            key={option.value}
            value={option.value}
          >
            <span
              aria-hidden
              className={cx(
                'mt-1 size-4 shrink-0 rounded-full border border-border',
                'bg-surface-raised p-1',
                'group-selected:border-accent group-selected:bg-accent'
              )}
            >
              <span className="block size-full rounded-full bg-surface-raised" />
            </span>
            <span className="ml-3 grid gap-1">
              <span className="font-medium text-text">{option.label}</span>
              {option.description ? (
                <span className="text-text-muted">{option.description}</span>
              ) : null}
            </span>
          </ReactAriaRadio>
        ))}
      </div>
      <FieldError className={fieldError}>{errorMessage}</FieldError>
    </ReactAriaRadioGroup>
  );
}
