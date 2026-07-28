'use client';

import { CopyButton } from './copy-button';
import { cx, focusRing } from './styles';
import { showToast } from './toast';

export interface CodeBlockProps {
  code: string;
  label: string;
  language?: string;
}

export function CodeBlock({ code, label, language = 'text' }: CodeBlockProps) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-sunken">
      <figcaption
        className={cx(
          'flex items-center justify-between gap-4 border-b border-border-subtle',
          'px-4 py-2'
        )}
      >
        <span className="text-xs font-medium text-text-muted">{label}</span>
        <CopyButton
          copiedLabel={`${label} copied`}
          label={`Copy ${label}`}
          onError={() => {
            showToast({
              description: 'Select the code and copy it manually.',
              title: `${label} could not be copied`,
              tone: 'danger'
            });
          }}
          value={code}
        />
      </figcaption>
      <pre
        aria-label={`${label} code`}
        className={cx(
          'm-0 overflow-x-auto p-4 font-mono text-sm text-text outline-none',
          focusRing
        )}
        data-language={language}
        tabIndex={0}
      >
        <code>{code}</code>
      </pre>
    </figure>
  );
}
