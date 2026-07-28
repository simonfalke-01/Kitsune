'use client';

import { LoaderCircle } from 'lucide-react';
import {
  Button as ReactAriaButton,
  type ButtonProps as ReactAriaButtonProps,
  Link as ReactAriaLink,
  type LinkProps as ReactAriaLinkProps
} from 'react-aria-components';

import { cx, focusRing, variantClass } from './styles';

const buttonTones = {
  primary: cx(
    'border-accent bg-accent text-text-on-accent',
    'hover:bg-accent-hover pressed:bg-accent-hover'
  ),
  secondary: cx(
    'border-border-subtle bg-surface-raised text-text',
    'hover:border-border hover:bg-surface-hover',
    'pressed:bg-surface-active'
  ),
  quiet: cx(
    'border-transparent bg-transparent text-text-muted shadow-none',
    'hover:bg-surface-hover hover:text-text',
    'pressed:bg-surface-active'
  ),
  danger: cx(
    'border-danger bg-danger text-text-on-accent',
    'hover:bg-danger-hover pressed:bg-danger-hover'
  )
} as const;

const buttonSizes = {
  small: 'kitsune-optical-py-1 gap-1 px-3 text-sm',
  medium: 'kitsune-optical-py-2 gap-2 px-4 text-sm',
  large: 'kitsune-optical-py-3 gap-2 px-6 text-base',
  icon: 'p-2'
} as const;

export type ButtonTone = keyof typeof buttonTones;
export type ButtonSize = keyof typeof buttonSizes;

export interface ButtonProps extends ReactAriaButtonProps {
  isLoading?: boolean;
  size?: ButtonSize;
  tone?: ButtonTone;
}

function buttonClassName(
  className: string | undefined,
  size: ButtonSize,
  tone: ButtonTone
): string {
  return cx(
    'inline-flex cursor-pointer items-center justify-center rounded-md border font-medium no-underline',
    'outline-none transition-colors duration-fast ease-out-quart',
    'disabled:cursor-not-allowed disabled:border-border-subtle',
    'disabled:bg-surface-active disabled:text-text-subtle',
    focusRing,
    variantClass(buttonTones, tone),
    variantClass(buttonSizes, size),
    className
  );
}

export function Button({
  children,
  className,
  isDisabled,
  isLoading = false,
  size = 'medium',
  tone = 'primary',
  ...props
}: ButtonProps) {
  return (
    <ReactAriaButton
      {...props}
      className={buttonClassName(typeof className === 'string' ? className : undefined, size, tone)}
      aria-busy={isLoading || undefined}
      isDisabled={isDisabled || isLoading}
    >
      {(values) => {
        const resolvedChildren = typeof children === 'function' ? children(values) : children;

        return isLoading ? (
          <>
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            <span>{resolvedChildren}</span>
          </>
        ) : (
          resolvedChildren
        );
      }}
    </ReactAriaButton>
  );
}

export interface ButtonLinkProps extends ReactAriaLinkProps {
  size?: ButtonSize;
  tone?: ButtonTone;
}

export function ButtonLink({
  className,
  size = 'medium',
  tone = 'primary',
  ...props
}: ButtonLinkProps) {
  return (
    <ReactAriaLink
      {...props}
      className={buttonClassName(typeof className === 'string' ? className : undefined, size, tone)}
    />
  );
}
