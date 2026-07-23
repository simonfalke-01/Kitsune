import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from './button';

export interface PaginationProps {
  currentPage: number;
  isDisabled?: boolean;
  label?: string;
  onPageChange: (page: number) => void;
  totalPages: number;
}

export function Pagination({
  currentPage,
  isDisabled = false,
  label = 'Pagination',
  onPageChange,
  totalPages
}: PaginationProps) {
  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-4 text-sm">
      <span className="text-xs text-text-muted tabular-nums">
        Page {currentPage} of {Math.max(1, totalPages)}
      </span>
      <div className="flex items-center gap-2">
        <Button
          isDisabled={isDisabled || currentPage <= 1}
          onPress={() => {
            onPageChange(previousPage);
          }}
          size="small"
          tone="secondary"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </Button>
        <Button
          isDisabled={isDisabled || currentPage >= totalPages}
          onPress={() => {
            onPageChange(nextPage);
          }}
          size="small"
          tone="secondary"
        >
          Next
          <ChevronRight aria-hidden className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
