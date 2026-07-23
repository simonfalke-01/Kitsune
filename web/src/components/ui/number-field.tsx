'use client';

import { Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  FieldError,
  Group,
  Input,
  Label,
  NumberField as ReactAriaNumberField,
  Text,
  type NumberFieldProps as ReactAriaNumberFieldProps
} from 'react-aria-components';

import { Button } from './button';
import { cx, fieldControl, fieldDescription, fieldError, fieldGroup, fieldLabel } from './styles';

export interface NumberFieldProps extends Omit<ReactAriaNumberFieldProps, 'children'> {
  description?: ReactNode;
  errorMessage?: ReactNode;
  label: ReactNode;
}

export function NumberField({
  className,
  description,
  errorMessage,
  label,
  ...props
}: NumberFieldProps) {
  return (
    <ReactAriaNumberField
      {...props}
      className={cx(fieldGroup, typeof className === 'string' ? className : undefined)}
    >
      <Label className={fieldLabel}>{label}</Label>
      <Group className="flex">
        <Button
          aria-label="Decrease value"
          className="min-h-control rounded-r-none"
          size="icon"
          slot="decrement"
          tone="secondary"
        >
          <Minus aria-hidden className="size-4" />
        </Button>
        <Input className={cx(fieldControl, 'rounded-none border-x-0 text-center tabular-nums')} />
        <Button
          aria-label="Increase value"
          className="min-h-control rounded-l-none"
          size="icon"
          slot="increment"
          tone="secondary"
        >
          <Plus aria-hidden className="size-4" />
        </Button>
      </Group>
      {description ? (
        <Text className={fieldDescription} slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className={fieldError}>{errorMessage}</FieldError>
    </ReactAriaNumberField>
  );
}
