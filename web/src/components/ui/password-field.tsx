'use client';

import { Eye, EyeOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  FieldError,
  Group,
  Input,
  Label,
  Text,
  TextField as ReactAriaTextField,
  type TextFieldProps as ReactAriaTextFieldProps
} from 'react-aria-components';

import { Button } from './button';
import { cx, fieldControl, fieldDescription, fieldError, fieldGroup, fieldLabel } from './styles';

export interface PasswordFieldProps extends Omit<ReactAriaTextFieldProps, 'children' | 'type'> {
  description?: ReactNode;
  errorMessage?: ReactNode;
  label: ReactNode;
  placeholder?: string;
}

export function PasswordField({
  className,
  description,
  errorMessage,
  label,
  placeholder,
  ...props
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <ReactAriaTextField
      {...props}
      className={cx(fieldGroup, typeof className === 'string' ? className : undefined)}
    >
      <Label className={fieldLabel}>{label}</Label>
      <Group className="flex">
        <Input
          className={cx(fieldControl, 'rounded-r-none')}
          placeholder={placeholder}
          type={isVisible ? 'text' : 'password'}
        />
        <Button
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          className="min-h-control rounded-l-none border-l-0"
          onPress={() => {
            setIsVisible((value) => !value);
          }}
          size="icon"
          tone="secondary"
        >
          {isVisible ? (
            <EyeOff aria-hidden className="size-4" />
          ) : (
            <Eye aria-hidden className="size-4" />
          )}
        </Button>
      </Group>
      {description ? (
        <Text className={fieldDescription} slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className={fieldError}>{errorMessage}</FieldError>
    </ReactAriaTextField>
  );
}
