'use client';

import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ComboBox as ReactAriaComboBox,
  FieldError,
  Group,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Text,
  type ComboBoxProps as ReactAriaComboBoxProps
} from 'react-aria-components';

import { Button } from './button';
import { Popover } from './popover';
import {
  collectionItem,
  cx,
  fieldControl,
  fieldDescription,
  fieldError,
  fieldGroup,
  fieldLabel
} from './styles';

export interface ComboBoxOption {
  description?: ReactNode;
  id: number | string;
  label: string;
}

export interface ComboBoxProps extends Omit<
  ReactAriaComboBoxProps<ComboBoxOption>,
  'children' | 'items'
> {
  description?: ReactNode;
  emptyMessage?: string;
  errorMessage?: ReactNode;
  label: ReactNode;
  options: readonly ComboBoxOption[];
  placeholder?: string;
}

export function ComboBox({
  className,
  description,
  emptyMessage = 'No matching options',
  errorMessage,
  label,
  options,
  placeholder,
  ...props
}: ComboBoxProps) {
  return (
    <ReactAriaComboBox
      {...props}
      className={cx(fieldGroup, typeof className === 'string' ? className : undefined)}
    >
      <Label className={fieldLabel}>{label}</Label>
      <Group className="flex">
        <Input className={cx(fieldControl, 'rounded-r-none')} placeholder={placeholder} />
        <Button
          aria-label="Open options"
          className="min-h-control rounded-l-none border-l-0"
          size="icon"
          tone="secondary"
        >
          <ChevronDown aria-hidden className="size-4" />
        </Button>
      </Group>
      {description ? (
        <Text className={fieldDescription} slot="description">
          {description}
        </Text>
      ) : null}
      <FieldError className={fieldError}>{errorMessage}</FieldError>
      <Popover className="w-full">
        <ListBox
          className="grid gap-1 outline-none"
          items={options}
          renderEmptyState={() => (
            <div className="px-3 py-2 text-sm text-text-muted">{emptyMessage}</div>
          )}
        >
          {(option) => (
            <ListBoxItem className={collectionItem} id={option.id} textValue={option.label}>
              {({ isSelected }) => (
                <>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="text-text-muted">{option.description}</span>
                    ) : null}
                  </span>
                  {isSelected ? <Check aria-hidden className="size-4 shrink-0" /> : null}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ReactAriaComboBox>
  );
}
