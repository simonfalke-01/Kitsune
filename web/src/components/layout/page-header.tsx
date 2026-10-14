import type { ReactNode } from 'react';

import { Breadcrumbs, type BreadcrumbItem } from '@/components/ui';
import { cx, variantClass } from '@/components/ui/styles';

const pageHeaderDensities = {
  standard: {
    heading: 'text-2xl',
    root: 'gap-4 pb-6'
  },
  workspace: {
    heading: 'text-xl',
    root: 'gap-3 px-4 pb-4 sm:px-6 lg:px-8'
  }
} as const;

export interface PageHeaderProps {
  actions?: ReactNode;
  breadcrumbs?: readonly BreadcrumbItem[];
  description?: ReactNode;
  density?: keyof typeof pageHeaderDensities;
  title: ReactNode;
}

export function PageHeader({
  actions,
  breadcrumbs,
  density = 'standard',
  description,
  title
}: PageHeaderProps) {
  return (
    <div
      className={cx(
        'grid border-b border-border-subtle',
        variantClass(
          {
            standard: pageHeaderDensities.standard.root,
            workspace: pageHeaderDensities.workspace.root
          },
          density
        )
      )}
    >
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid max-w-prose gap-2">
          <h1
            className={cx(
              'm-0 font-display font-semibold tracking-tight text-text',
              variantClass(
                {
                  standard: pageHeaderDensities.standard.heading,
                  workspace: pageHeaderDensities.workspace.heading
                },
                density
              )
            )}
          >
            {title}
          </h1>
          {description ? <p className="m-0 text-base text-text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
