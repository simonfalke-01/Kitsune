'use client';

import { Link, type LinkProps } from './link';
import { cx, variantClass } from './styles';

const skipLinkPlacements = {
  global: 'fixed left-2 top-2',
  local: 'absolute left-3 top-3'
} as const;

export interface SkipLinkProps extends Omit<LinkProps, 'className' | 'tone'> {
  className?: string;
  placement?: keyof typeof skipLinkPlacements;
}

export function SkipLink({
  className,
  href,
  onPress,
  placement = 'local',
  ...props
}: SkipLinkProps) {
  const targetId = typeof href === 'string' && href.startsWith('#') ? href.slice(1) : null;

  return (
    <Link
      {...props}
      className={cx(
        'z-overlay -translate-y-16 bg-surface-raised px-3 py-2 no-underline shadow-md',
        'transition-transform duration-fast ease-out-quart focus-visible:translate-y-0',
        variantClass(skipLinkPlacements, placement),
        className
      )}
      href={href}
      onPress={(event) => {
        onPress?.(event);

        if (targetId) {
          window.requestAnimationFrame(() => {
            document.getElementById(targetId)?.focus();
          });
        }
      }}
      tone="current"
    />
  );
}
