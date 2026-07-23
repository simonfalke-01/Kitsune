import type { ReactNode } from 'react';
import {
  Cell as ReactAriaCell,
  Column as ReactAriaColumn,
  Row as ReactAriaRow,
  Table as ReactAriaTable,
  TableBody as ReactAriaTableBody,
  TableHeader as ReactAriaTableHeader,
  composeRenderProps,
  type CellProps,
  type ColumnProps,
  type RowProps,
  type TableBodyProps,
  type TableHeaderProps,
  type TableProps as ReactAriaTableProps
} from 'react-aria-components';

import { cx, focusRing } from './styles';

export interface TableProps extends ReactAriaTableProps {
  wrapperLabel?: string;
}

export function Table({ className, wrapperLabel = 'Scrollable data table', ...props }: TableProps) {
  return (
    <div
      aria-label={wrapperLabel}
      className="overflow-x-auto rounded-lg border border-border-subtle"
      role="region"
      tabIndex={0}
    >
      <ReactAriaTable
        {...props}
        className={composeRenderProps(className, (resolvedClassName) =>
          cx('w-full border-collapse text-left text-sm', resolvedClassName)
        )}
      />
    </div>
  );
}

export function TableHeader<T extends object>({ className, ...props }: TableHeaderProps<T>) {
  return (
    <ReactAriaTableHeader
      {...props}
      className={composeRenderProps(className, (resolvedClassName) =>
        cx('border-b border-border-subtle bg-surface-sunken', resolvedClassName)
      )}
    />
  );
}

export function TableColumn({ className, ...props }: ColumnProps) {
  return (
    <ReactAriaColumn
      {...props}
      className={composeRenderProps(className, (resolvedClassName) =>
        cx(
          'px-3 py-2 text-xs font-semibold tracking-wide text-text-muted',
          'outline-none',
          focusRing,
          resolvedClassName
        )
      )}
    />
  );
}

export interface TableBodyWithStatesProps<T extends object> extends TableBodyProps<T> {
  emptyState?: ReactNode;
  errorState?: ReactNode;
  isError?: boolean;
  isLoading?: boolean;
  loadingState?: ReactNode;
}

export function TableBody<T extends object>({
  className,
  emptyState = 'No rows yet',
  errorState = 'Could not load this table',
  isError = false,
  isLoading = false,
  loadingState = 'Loading rows',
  renderEmptyState,
  ...props
}: TableBodyWithStatesProps<T>) {
  let stateContent = emptyState;

  if (isLoading) {
    stateContent = loadingState;
  }

  if (isError) {
    stateContent = errorState;
  }

  return (
    <ReactAriaTableBody
      {...props}
      className={composeRenderProps(className, (resolvedClassName) =>
        cx('divide-y divide-border-subtle', resolvedClassName)
      )}
      renderEmptyState={
        renderEmptyState ??
        (() => <div className="p-6 text-center text-sm text-text-muted">{stateContent}</div>)
      }
    />
  );
}

export function TableRow<T extends object>({ className, ...props }: RowProps<T>) {
  return (
    <ReactAriaRow
      {...props}
      className={composeRenderProps(className, (resolvedClassName) =>
        cx(
          'outline-none transition-colors duration-fast ease-out-quart',
          'hover:bg-surface-hover selected:bg-accent-subtle',
          focusRing,
          resolvedClassName
        )
      )}
    />
  );
}

export function TableCell({ className, ...props }: CellProps) {
  return (
    <ReactAriaCell
      {...props}
      className={composeRenderProps(className, (resolvedClassName) =>
        cx('px-3 py-3 text-text tabular-nums outline-none', focusRing, resolvedClassName)
      )}
    />
  );
}
