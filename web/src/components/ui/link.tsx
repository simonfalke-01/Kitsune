'use client';

import { Link as ReactAriaLink, type LinkProps as ReactAriaLinkProps } from 'react-aria-components';

import { cx, focusRing, variantClass } from './styles';

const linkTones = {
  accent: 'text-accent-text hover:text-accent-hover',
  muted: 'text-text-muted hover:text-text',
  current: 'text-text'
} as const;

export type LinkTone = keyof typeof linkTones;

export interface LinkProps extends ReactAriaLinkProps {
  tone?: LinkTone;
}

export function Link({ className, tone = 'accent', ...props }: LinkProps) {
  return (
    <ReactAriaLink
      {...props}
      className={cx(
        'rounded-sm font-medium underline decoration-border-strong',
        'underline-offset-4 outline-none transition-colors',
        'duration-fast ease-out-quart disabled:text-text-subtle',
        focusRing,
        variantClass(linkTones, tone),
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}
