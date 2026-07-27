'use client';

import { type ReactNode, useId } from 'react';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';

import { cx, fieldDescription, fieldError, fieldGroup, fieldLabel, focusRing } from './styles';

export interface RatingGroupProps {
  description?: ReactNode;
  errorMessage?: ReactNode;
  isDisabled?: boolean;
  label: ReactNode;
  maximum?: number;
  minimum?: number;
  onChange: (value: number | null) => void;
  value: number | null;
}

export function RatingGroup({
  description,
  errorMessage,
  isDisabled = false,
  label,
  maximum = 5,
  minimum = 1,
  onChange,
  value
}: RatingGroupProps) {
  const labelId = useId();
  const options = Array.from(
    {
      length: Math.max(0, maximum - minimum + 1)
    },
    (_, index) => minimum + index
  );

  return (
    <div className={fieldGroup}>
      <span className={fieldLabel} id={labelId}>
        {label}
      </span>
      {description ? <span className={fieldDescription}>{description}</span> : null}
      <ToggleButtonGroup
        aria-labelledby={labelId}
        className="flex flex-wrap gap-2"
        disallowEmptySelection
        isDisabled={isDisabled}
        onSelectionChange={(keys) => {
          const selected = [...keys][0];
          onChange(typeof selected === 'number' ? selected : null);
        }}
        selectedKeys={value === null ? [] : [value]}
        selectionMode="single"
      >
        {options.map((option) => (
          <ToggleButton
            className={cx(
              'min-h-control min-w-control rounded-md border border-border-subtle',
              'bg-surface-raised px-3 text-base font-medium text-text outline-none',
              'transition-colors duration-fast ease-out-quart',
              'hover:border-border hover:bg-surface-hover',
              'selected:border-accent selected:bg-accent selected:text-text-on-accent',
              'disabled:bg-surface-active disabled:text-text-subtle',
              focusRing
            )}
            id={option}
            key={option}
          >
            <span className="kitsune-optical-center">{option}</span>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {errorMessage ? (
        <span className={fieldError} role="alert">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
