import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Select as ReactAriaSelect,
  SelectValue,
  Text,
  type SelectProps as ReactAriaSelectProps
} from 'react-aria-components';

import { Button } from './button';
import { Popover } from './popover';
import { collectionItem, cx, fieldDescription, fieldError, fieldGroup, fieldLabel } from './styles';

export interface SelectOption {
  description?: ReactNode;
  id: number | string;
  label: string;
}

export interface SelectProps extends Omit<
  ReactAriaSelectProps<SelectOption>,
  'children' | 'items'
> {
  description?: ReactNode;
  errorMessage?: ReactNode;
  label: ReactNode;
  options: readonly SelectOption[];
}

export function Select({
  className,
  description,
  errorMessage,
  label,
  options,
  ...props
}: SelectProps) {
  return (
    <ReactAriaSelect
      {...props}
      className={cx(fieldGroup, typeof className === 'string' ? className : undefined)}
    >
      <Label className={fieldLabel}>{label}</Label>
      <Button className="min-h-control w-full justify-between" tone="secondary">
        <SelectValue className="truncate text-left" />
        <ChevronDown aria-hidden className="size-4 shrink-0" />
      </Button>
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
            <div className="px-3 py-2 text-sm text-text-muted">No options available</div>
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
    </ReactAriaSelect>
  );
}
