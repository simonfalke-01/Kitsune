'use client';

import type { ReactNode } from 'react';

import { Link, linkClassName, type LinkProps } from './link';
import { safeHref } from './safe-href';
import { cx } from './styles';

export interface DownloadLinkProps extends Omit<LinkProps, 'children' | 'href'> {
  children: ReactNode;
  filename?: string;
  href: string;
}

export function DownloadLink({
  children,
  className,
  filename,
  href,
  isDisabled,
  tone = 'accent',
  ...props
}: DownloadLinkProps) {
  const resolvedHref = safeHref(href, ['http:', 'https:']);

  if (!resolvedHref) {
    return (
      <span
        aria-disabled="true"
        aria-label={props['aria-label']}
        className={cx(linkClassName(className, tone), 'cursor-not-allowed text-text-subtle')}
        role="link"
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      {...props}
      className={className}
      download={filename ?? true}
      href={resolvedHref}
      isDisabled={isDisabled}
      tone={tone}
    >
      {children}
    </Link>
  );
}
