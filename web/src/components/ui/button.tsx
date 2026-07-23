import { LoaderCircle } from 'lucide-react';
import {
  Button as ReactAriaButton,
  type ButtonProps as ReactAriaButtonProps
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
  small: 'gap-1 px-3 py-1 text-sm',
  medium: 'gap-2 px-4 py-2 text-sm',
  large: 'gap-2 px-6 py-3 text-base',
  icon: 'p-2'
} as const;

export type ButtonTone = keyof typeof buttonTones;
export type ButtonSize = keyof typeof buttonSizes;

export interface ButtonProps extends ReactAriaButtonProps {
  isLoading?: boolean;
  size?: ButtonSize;
  tone?: ButtonTone;
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
      className={cx(
        'inline-flex items-center justify-center rounded-md border font-medium',
        'outline-none transition-colors duration-fast ease-out-quart',
        'disabled:cursor-not-allowed disabled:border-border-subtle',
        'disabled:bg-surface-active disabled:text-text-subtle',
        focusRing,
        variantClass(buttonTones, tone),
        variantClass(buttonSizes, size),
        typeof className === 'string' ? className : undefined
      )}
      isDisabled={isDisabled || isLoading}
    >
      {isLoading ? (
        <>
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          <span>Working</span>
        </>
      ) : (
        children
      )}
    </ReactAriaButton>
  );
}
