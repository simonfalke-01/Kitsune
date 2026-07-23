'use client';

import type { ReactNode } from 'react';
import {
  FieldError,
  Label,
  Text,
  TextArea as ReactAriaTextArea,
  TextField,
  type TextFieldProps
} from 'react-aria-components';

import { cx, fieldControl, fieldDescription, fieldError, fieldGroup, fieldLabel } from './styles';

export interface TextAreaProps extends Omit<TextFieldProps, 'children'> {
  description?: ReactNode;
  errorMessage?: ReactNode;
  label: ReactNode;
  placeholder?: string;
  rows?: number;
  textAreaClassName?: string;
}

export function TextArea({
  className,
  description,
  errorMessage,
  label,
  placeholder,
  rows = 4,
  textAreaClassName,
  ...props
}: TextAreaProps) {
  return (
    <TextField
      {...props}
      className={cx(fieldGroup, typeof className === 'string' ? className : undefined)}
    >
      <Label className={fieldLabel}>{label}</Label>
      <ReactAriaTextArea
        className={cx(fieldControl, 'resize-y', textAreaClassName)}
        placeholder={placeholder}
        rows={rows}
      />
      {description ? (
        <Text className={fieldDescription} slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className={fieldError}>{errorMessage}</FieldError>
    </TextField>
  );
}
