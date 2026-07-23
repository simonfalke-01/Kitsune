import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Button as ReactAriaButton,
  UNSTABLE_Toast as ReactAriaToast,
  UNSTABLE_ToastContent as ReactAriaToastContent,
  UNSTABLE_ToastQueue,
  UNSTABLE_ToastRegion as ReactAriaToastRegion
} from 'react-aria-components';
import { flushSync } from 'react-dom';

import { cx, focusRing, variantClass } from './styles';

const toastTones = {
  info: {
    icon: Info,
    style: 'border-info-border bg-info-subtle text-info-text'
  },
  success: {
    icon: CheckCircle2,
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

export type ToastTone = keyof typeof toastTones;

export interface ToastMessage {
  description?: ReactNode;
  title: string;
  tone: ToastTone;
}

let activeToastTransition: ViewTransition | null = null;

export const toastQueue = new UNSTABLE_ToastQueue<ToastMessage>({
  maxVisibleToasts: 4,
  wrapUpdate(update) {
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      activeToastTransition?.skipTransition();
      const transition = document.startViewTransition(() => {
        flushSync(update);
      });
      activeToastTransition = transition;
      void transition.finished
        .catch(() => {
          // A newer toast update intentionally supersedes the active transition.
        })
        .finally(() => {
          if (activeToastTransition === transition) {
            activeToastTransition = null;
          }
        });
      return;
    }

    update();
  }
});

export function showToast(message: ToastMessage, options: { timeout?: number } = {}): string {
  return toastQueue.add(message, {
    timeout: options.timeout ?? 5000
  });
}

export function ToastRegion() {
  return (
    <ReactAriaToastRegion
      className={cx(
        'fixed bottom-4 left-4 right-4 z-overlay flex max-w-toast flex-col gap-2',
        'sm:left-auto sm:w-full',
        'outline-none'
      )}
      queue={toastQueue}
    >
      {({ toast }) => {
        const Icon = toastTones[toast.content.tone].icon;
        const transitionName = String(toast.key).replaceAll(/[^a-zA-Z0-9_-]/g, '-');
        const transitionStyle: CSSProperties = {
          viewTransitionName: `kitsune-toast-${transitionName}`
        };

        return (
          <ReactAriaToast
            className={cx(
              'kitsune-toast flex items-start gap-3 rounded-lg border p-4',
              'shadow-lg outline-none',
              focusRing,
              variantClass(
                {
                  danger: toastTones.danger.style,
                  info: toastTones.info.style,
                  success: toastTones.success.style,
                  warning: toastTones.warning.style
                },
                toast.content.tone
              )
            )}
            style={transitionStyle}
            toast={toast}
          >
            <Icon aria-hidden className="mt-1 size-4 shrink-0" />
            <ReactAriaToastContent className="grid min-w-0 flex-1 gap-1">
              <strong className="text-sm font-semibold">{toast.content.title}</strong>
              {toast.content.description ? (
                <span className="text-sm text-text-muted">{toast.content.description}</span>
              ) : null}
            </ReactAriaToastContent>
            <ReactAriaButton
              aria-label="Dismiss notification"
              className={cx(
                'rounded-sm p-1 text-text-muted outline-none',
                'hover:bg-surface-hover hover:text-text',
                focusRing
              )}
              slot="close"
            >
              <X aria-hidden className="size-4" />
            </ReactAriaButton>
          </ReactAriaToast>
        );
      }}
    </ReactAriaToastRegion>
  );
}
