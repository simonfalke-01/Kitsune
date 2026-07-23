import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Link } from './link';

export interface BreadcrumbItem {
  href?: string;
  label: ReactNode;
}

export interface BreadcrumbsProps {
  items: readonly BreadcrumbItem[];
  label?: string;
}

export function Breadcrumbs({ items, label = 'Breadcrumbs' }: BreadcrumbsProps) {
  return (
    <nav aria-label={label}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0 text-sm">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <li className="flex items-center gap-2" key={index}>
              {index > 0 ? <ChevronRight aria-hidden className="size-3 text-text-subtle" /> : null}
              {item.href && !isCurrent ? (
                <Link href={item.href} tone="muted">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? 'page' : undefined}
                  className="font-medium text-text"
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
