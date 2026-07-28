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
  fieldDescription,
  fieldError,
  fieldGroup,
  fieldInputControl,
  fieldLabel,
  focusRing
} from './styles';

export interface SearchFieldProps extends Omit<
  ReactAriaSearchFieldProps,
  'children' | 'aria-label'
> {
  description?: ReactNode;
  errorMessage?: ReactNode;
  excludeFromTabOrder?: boolean;
  inputId?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  label: ReactNode;
  labelHidden?: boolean;
  placeholder?: string;
}

export function SearchField({
  className,
  description,
  errorMessage,
  excludeFromTabOrder = false,
  inputId,
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
        <Input
          className={cx(fieldInputControl, 'kitsune-search-input pl-8 pr-8')}
          id={inputId}
          placeholder={placeholder}
          ref={inputRef}
          tabIndex={excludeFromTabOrder ? -1 : undefined}
        />
        <ReactAriaButton
          aria-label="Clear search"
          className={cx(
            'absolute right-2 cursor-pointer rounded-sm p-1 text-text-muted outline-none',
            'hover:bg-surface-hover hover:text-text empty:hidden',
            focusRing
          )}
          excludeFromTabOrder={excludeFromTabOrder}
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
