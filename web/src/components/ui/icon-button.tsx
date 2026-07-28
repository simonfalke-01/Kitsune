'use client';

import type { ReactNode } from 'react';

import { Button, type ButtonProps } from './button';
import { cx } from './styles';

export interface IconButtonProps extends Omit<
  ButtonProps,
  'aria-label' | 'children' | 'className' | 'size'
> {
  children: ReactNode;
  className?: string;
  label: string;
}

export function IconButton({
  children,
  className,
  label,
  tone = 'quiet',
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      aria-label={label}
      className={cx('size-control shrink-0', className)}
      size="icon"
      tone={tone}
    >
      {children}
    </Button>
  );
}
