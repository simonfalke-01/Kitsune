import type { ReactNode } from 'react';
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField as ReactAriaTextField,
  type TextFieldProps as ReactAriaTextFieldProps
} from 'react-aria-components';

import { cx, fieldControl, fieldDescription, fieldError, fieldGroup, fieldLabel } from './styles';

export interface TextFieldProps extends Omit<ReactAriaTextFieldProps, 'children'> {
  description?: ReactNode;
  errorMessage?: ReactNode;
  inputClassName?: string;
  label: ReactNode;
  placeholder?: string;
}

export function TextField({
  className,
  description,
  errorMessage,
  inputClassName,
  label,
  placeholder,
  ...props
}: TextFieldProps) {
  return (
    <ReactAriaTextField
      {...props}
      className={cx(fieldGroup, typeof className === 'string' ? className : undefined)}
    >
      <Label className={fieldLabel}>{label}</Label>
      <Input className={cx(fieldControl, inputClassName)} placeholder={placeholder} />
      {description ? (
        <Text className={fieldDescription} slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className={fieldError}>{errorMessage}</FieldError>
    </ReactAriaTextField>
  );
}
