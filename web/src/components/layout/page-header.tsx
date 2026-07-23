import type { ReactNode } from 'react';

import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui';

export interface PageHeaderProps {
  actions?: ReactNode;
  breadcrumbs?: readonly BreadcrumbItem[];
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
}

export function PageHeader({ actions, breadcrumbs, description, eyebrow, title }: PageHeaderProps) {
  return (
    <header className="grid gap-4 border-b border-border-subtle pb-6">
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid max-w-prose gap-2">
          {eyebrow ? (
            <div className="text-xs font-semibold tracking-wide text-accent-text">{eyebrow}</div>
          ) : null}
          <h1 className="m-0 font-display text-2xl font-semibold tracking-tight text-text">
            {title}
          </h1>
          {description ? <p className="m-0 text-base text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
