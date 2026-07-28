'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  Link as ReactAriaLink,
  type LinkProps as ReactAriaLinkProps,
  TooltipTrigger
} from 'react-aria-components';

import { cx } from './styles';
import { Tooltip } from './tooltip';

const segmentSolidClasses = {
  amber: 'bg-category-amber',
  blue: 'bg-category-blue',
  cyan: 'bg-category-cyan',
  lime: 'bg-category-lime',
  orange: 'bg-category-orange',
  pink: 'bg-category-pink',
  teal: 'bg-category-teal',
  violet: 'bg-category-violet'
} as const;

const segmentSubtleClasses = {
  amber: 'bg-category-amber-subtle',
  blue: 'bg-category-blue-subtle',
  cyan: 'bg-category-cyan-subtle',
  lime: 'bg-category-lime-subtle',
  orange: 'bg-category-orange-subtle',
  pink: 'bg-category-pink-subtle',
  teal: 'bg-category-teal-subtle',
  violet: 'bg-category-violet-subtle'
} as const;

const segmentInteractionClasses = {
  amber: 'group-hover:ring-category-amber-border group-pressed:ring-category-amber-border',
  blue: 'group-hover:ring-category-blue-border group-pressed:ring-category-blue-border',
  cyan: 'group-hover:ring-category-cyan-border group-pressed:ring-category-cyan-border',
  lime: 'group-hover:ring-category-lime-border group-pressed:ring-category-lime-border',
  orange: 'group-hover:ring-category-orange-border group-pressed:ring-category-orange-border',
  pink: 'group-hover:ring-category-pink-border group-pressed:ring-category-pink-border',
  teal: 'group-hover:ring-category-teal-border group-pressed:ring-category-teal-border',
  violet: 'group-hover:ring-category-violet-border group-pressed:ring-category-violet-border'
} as const;

export type WeightedSegmentTone = keyof typeof segmentSolidClasses;

interface WeightedSegmentStyle extends CSSProperties {
  '--segment-weight'?: number;
}

interface WeightedSegmentBarStyle extends CSSProperties {
  '--segment-bar-width': string;
}

export interface WeightedSegmentBarItem {
  href?: ReactAriaLinkProps['href'];
  id: string;
  isEmphasized?: boolean;
  label: string;
  onPress?: ReactAriaLinkProps['onPress'];
  tone: WeightedSegmentTone;
  tooltip: ReactNode;
  value: number;
}

export interface WeightedSegmentBarProps {
  ariaLabel: string;
  className?: string;
  items: readonly WeightedSegmentBarItem[];
  maximumValue?: number;
}

export function WeightedSegmentBar({
  ariaLabel,
  className,
  items,
  maximumValue
}: WeightedSegmentBarProps) {
  const totalValue = items.reduce((total, item) => total + Math.max(0, item.value), 0);
  const resolvedMaximum = Math.max(1, maximumValue ?? totalValue, totalValue);
  const style: WeightedSegmentBarStyle = {
    '--segment-bar-width': `${(totalValue / resolvedMaximum) * 100}%`
  };

  return (
    <ol
      aria-label={ariaLabel}
      className={cx('kitsune-weighted-segment-bar m-0 flex min-w-0 list-none gap-2 p-0', className)}
      style={style}
    >
      {items.map((item) => {
        const style: WeightedSegmentStyle = {
          '--segment-weight': Math.max(1, item.value)
        };

        return (
          <li className="kitsune-weighted-segment min-w-6" key={item.id} style={style}>
            <TooltipTrigger closeDelay={0} delay={0}>
              <ReactAriaLink
                aria-label={item.label}
                className="group flex min-h-control w-full items-center outline-none"
                href={item.href}
                onPress={item.onPress}
              >
                <span
                  aria-hidden
                  className={cx(
                    'h-6 w-full rounded-sm',
                    'group-hover:ring-2 group-hover:ring-inset',
                    'group-pressed:ring-2 group-pressed:ring-inset',
                    'group-focus-visible:outline-2 group-focus-visible:outline-solid group-focus-visible:outline-offset-2',
                    'group-focus-visible:outline-focus-ring',
                    item.isEmphasized
                      ? segmentSolidClasses[item.tone]
                      : segmentSubtleClasses[item.tone],
                    segmentInteractionClasses[item.tone]
                  )}
                />
              </ReactAriaLink>
              <Tooltip>{item.tooltip}</Tooltip>
            </TooltipTrigger>
          </li>
        );
      })}
    </ol>
  );
}
