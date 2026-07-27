'use client';

import type { ReactNode } from 'react';
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField as ReactAriaTextField,
  type TextFieldProps as ReactAriaTextFieldProps
} from 'react-aria-components';

import {
  cx,
  fieldDescription,
  fieldError,
  fieldGroup,
  fieldInputControl,
  fieldLabel
} from './styles';

export interface TextFieldProps extends Omit<ReactAriaTextFieldProps, 'children'> {
  description?: ReactNode;
  errorMessage?: ReactNode;
  inputId?: string;
  inputClassName?: string;
  label: ReactNode;
  labelHidden?: boolean;
  placeholder?: string;
  reserveErrorSpace?: boolean;
}

export function TextField({
  className,
  description,
  errorMessage,
  inputId,
  inputClassName,
  label,
  labelHidden = false,
  placeholder,
  reserveErrorSpace = false,
  ...props
}: TextFieldProps) {
  return (
    <ReactAriaTextField
      {...props}
      className={cx(fieldGroup, typeof className === 'string' ? className : undefined)}
    >
      <Label className={labelHidden ? 'sr-only' : fieldLabel}>{label}</Label>
      <Input
        className={cx(fieldInputControl, inputClassName)}
        id={inputId}
        placeholder={placeholder}
      />
      {description ? (
        <Text className={fieldDescription} slot="description">
          {description}
        </Text>
      ) : null}
      {reserveErrorSpace ? (
        <div className="min-h-6" data-slot="field-error">
          <FieldError className={fieldError}>{errorMessage}</FieldError>
        </div>
      ) : (
        <FieldError className={fieldError}>{errorMessage}</FieldError>
      )}
    </ReactAriaTextField>
  );
}
