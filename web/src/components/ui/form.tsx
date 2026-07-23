'use client';

import { Form as ReactAriaForm, type FormProps as ReactAriaFormProps } from 'react-aria-components';

import { cx } from './styles';

export interface FormProps extends ReactAriaFormProps {
  density?: 'compact' | 'comfortable';
}

export function Form({ className, density = 'comfortable', ...props }: FormProps) {
  return (
    <ReactAriaForm
      {...props}
      className={cx(
        'flex flex-col',
        density === 'compact' ? 'gap-4' : 'gap-6',
        typeof className === 'string' ? className : undefined
      )}
    />
  );
}
