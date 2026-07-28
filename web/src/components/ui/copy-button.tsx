'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, type ButtonTone } from './button';
import { IconButton } from './icon-button';
import { Tooltip, TooltipTrigger } from './tooltip';

type CopyValue = string | (() => Promise<string> | string);

interface CopyActionProps {
  copiedLabel: string;
  label: string;
  onCopy?: () => void;
  onError?: (error: unknown) => void;
  value: CopyValue;
}

function useCopyAction({ copiedLabel, label, onCopy, onError, value }: CopyActionProps) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsCopied(false);
    }, 2_000);

    return () => window.clearTimeout(timer);
  }, [isCopied]);

  async function copy() {
    try {
      const resolvedValue = typeof value === 'function' ? await value() : value;
      await navigator.clipboard.writeText(resolvedValue);
      setIsCopied(true);
      onCopy?.();
    } catch (error) {
      setIsCopied(false);
      onError?.(error);
    }
  }

  return {
    copy,
    isCopied,
    stateLabel: isCopied ? copiedLabel : label
  };
}

export interface CopyButtonProps extends CopyActionProps {
  className?: string;
  tone?: ButtonTone;
}

export function CopyButton({ className, tone = 'quiet', ...props }: CopyButtonProps) {
  const { copy, isCopied, stateLabel } = useCopyAction(props);

  return (
    <Button
      aria-label={stateLabel}
      className={className}
      onPress={() => {
        void copy();
      }}
      size="small"
      tone={tone}
    >
      {isCopied ? 'Copied' : 'Copy'}
    </Button>
  );
}

export type CopyIconButtonProps = CopyActionProps;

export function CopyIconButton(props: CopyIconButtonProps) {
  const { copy, isCopied, stateLabel } = useCopyAction(props);

  return (
    <TooltipTrigger>
      <IconButton
        label={stateLabel}
        onPress={() => {
          void copy();
        }}
      >
        {isCopied ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <Copy aria-hidden className="size-4" />
        )}
      </IconButton>
      <Tooltip>{stateLabel}</Tooltip>
    </TooltipTrigger>
  );
}
