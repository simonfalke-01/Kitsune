'use client';

import type { ReactNode, Ref } from 'react';
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
  inputRef?: Ref<HTMLInputElement>;
}

export function TextField({
  className,
  description,
  errorMessage,
  inputId,
  inputClassName,
  inputRef,
  label,
  labelHidden = false,
  placeholder,
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
        ref={inputRef}
      />
      {description ? (
        <Text className={fieldDescription} slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className={fieldError}>{errorMessage}</FieldError>
    </ReactAriaTextField>
  );
}
