import { CircleAlert, Info, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

import { cx, variantClass } from './styles';

const alertTones = {
  info: {
    icon: Info,
    style: 'border-info-border bg-info-subtle text-info-text'
  },
  success: {
    icon: ShieldCheck,
    style: 'border-success-border bg-success-subtle text-success-text'
  },
  warning: {
    icon: TriangleAlert,
    style: 'border-warning-border bg-warning-subtle text-warning-text'
  },
  danger: {
    icon: CircleAlert,
    style: 'border-danger-border bg-danger-subtle text-danger-text'
  }
} as const;

export type AlertTone = keyof typeof alertTones;

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  actions?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
  tone?: AlertTone;
}

export function Alert({
  actions,
  className,
  description,
  title,
  tone = 'info',
  ...props
}: AlertProps) {
  const Icon = alertTones[tone].icon;

  return (
    <div
      {...props}
      className={cx(
        'flex items-start gap-3 rounded-lg border p-4',
        variantClass(
          {
            danger: alertTones.danger.style,
            info: alertTones.info.style,
            success: alertTones.success.style,
            warning: alertTones.warning.style
          },
          tone
        ),
        className
      )}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon aria-hidden className="mt-1 size-4 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-1">
        <strong className="text-sm font-semibold">{title}</strong>
        {description ? <div className="text-sm text-text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
