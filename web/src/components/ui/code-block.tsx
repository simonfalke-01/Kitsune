'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from './button';
import { cx } from './styles';

export interface CodeBlockProps {
  code: string;
  label: string;
  language?: string;
}

export function CodeBlock({ code, label, language = 'text' }: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsCopied(false);
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isCopied]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setIsCopied(true);
  };

  return (
    <figure className="m-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-sunken">
      <figcaption
        className={cx(
          'flex items-center justify-between gap-4 border-b border-border-subtle',
          'px-4 py-2'
        )}
      >
        <span className="text-xs font-medium text-text-muted">{label}</span>
        <Button
          aria-label={isCopied ? 'Copied' : `Copy ${label}`}
          onPress={() => {
            void copy();
          }}
          size="small"
          tone="quiet"
        >
          {isCopied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
          {isCopied ? 'Copied' : 'Copy'}
        </Button>
      </figcaption>
      <pre className="m-0 overflow-x-auto p-4 font-mono text-sm text-text" data-language={language}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
