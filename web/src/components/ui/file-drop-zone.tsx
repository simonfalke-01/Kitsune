'use client';

import type { ReactNode } from 'react';
import {
  DropZone as ReactAriaDropZone,
  FileTrigger,
  type DropZoneProps as ReactAriaDropZoneProps,
  type FileTriggerProps
} from 'react-aria-components';

import { Button } from './button';
import { cx, focusRing } from './styles';

export interface FileDropZoneProps
  extends
    Omit<ReactAriaDropZoneProps, 'children' | 'aria-label'>,
    Pick<
      FileTriggerProps,
      'acceptedFileTypes' | 'allowsMultiple' | 'onSelect' | 'acceptDirectory'
    > {
  description: ReactNode;
  label: string;
}

export function FileDropZone({
  acceptDirectory,
  acceptedFileTypes,
  allowsMultiple,
  className,
  description,
  label,
  onSelect,
  ...props
}: FileDropZoneProps) {
  return (
    <ReactAriaDropZone
      {...props}
      aria-label={label}
      className={cx(
        'flex flex-col items-center justify-center gap-4 rounded-lg',
        'border border-dashed border-border bg-surface-sunken p-8',
        'text-center outline-none transition-colors duration-fast',
        'drop-target:border-accent drop-target:bg-accent-subtle',
        'disabled:text-text-subtle',
        focusRing,
        typeof className === 'string' ? className : undefined
      )}
    >
      <div className="grid max-w-prose gap-1">
        <strong className="text-sm font-semibold text-text">{label}</strong>
        <span className="text-sm text-text-muted">{description}</span>
      </div>
      <FileTrigger
        acceptDirectory={acceptDirectory}
        acceptedFileTypes={acceptedFileTypes}
        allowsMultiple={allowsMultiple}
        onSelect={onSelect}
      >
        <Button tone="secondary">Choose files</Button>
      </FileTrigger>
    </ReactAriaDropZone>
  );
}
