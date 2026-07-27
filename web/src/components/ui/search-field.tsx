'use client';

import { Search, X } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import {
  Button as ReactAriaButton,
  FieldError,
  Input,
  Label,
  SearchField as ReactAriaSearchField,
  Text,
  type SearchFieldProps as ReactAriaSearchFieldProps
} from 'react-aria-components';

import {
  cx,
  fieldControl,
  fieldDescription,
  fieldError,
  fieldGroup,
  fieldLabel,
  focusRing
} from './styles';

export interface SearchFieldProps extends Omit<
  ReactAriaSearchFieldProps,
  'children' | 'aria-label'
> {
  description?: ReactNode;
  errorMessage?: ReactNode;
  inputRef?: RefObject<HTMLInputElement | null>;
  label: ReactNode;
  labelHidden?: boolean;
  placeholder?: string;
}

export function SearchField({
  className,
  description,
  errorMessage,
  inputRef,
  label,
  labelHidden = false,
  placeholder,
  ...props
}: SearchFieldProps) {
  return (
    <ReactAriaSearchField
      {...props}
      className={cx(fieldGroup, typeof className === 'string' ? className : undefined)}
    >
      <Label className={labelHidden ? 'sr-only' : fieldLabel}>{label}</Label>
      <div className="relative flex items-center">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 size-4 text-text-subtle"
        />
        <Input className={cx(fieldControl, 'pl-8 pr-8')} placeholder={placeholder} ref={inputRef} />
        <ReactAriaButton
          aria-label="Clear search"
          className={cx(
            'absolute right-2 rounded-sm p-1 text-text-muted outline-none',
            'hover:bg-surface-hover hover:text-text empty:hidden',
            focusRing
          )}
        >
          <X aria-hidden className="size-4" />
        </ReactAriaButton>
      </div>
      {description ? (
        <Text className={fieldDescription} slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className={fieldError}>{errorMessage}</FieldError>
    </ReactAriaSearchField>
  );
}
