'use client';

import { PanelLeftOpen } from 'lucide-react';
import type { RefObject } from 'react';

import { IconButton, Tooltip, TooltipTrigger } from '@/components/ui';

interface ChallengeCollapsedRailProps {
  onShowChallengeList: () => void;
  railRef?: RefObject<HTMLElement | null>;
}

export function ChallengeCollapsedRail({
  onShowChallengeList,
  railRef
}: ChallengeCollapsedRailProps) {
  return (
    <aside
      aria-label="Collapsed challenge list"
      className="flex h-full min-h-0 flex-col bg-surface-raised"
      ref={railRef}
    >
      <div className="flex min-h-16 shrink-0 items-center justify-center">
        <TooltipTrigger>
          <IconButton label="Show challenge list" onPress={onShowChallengeList}>
            <PanelLeftOpen aria-hidden className="size-4" />
          </IconButton>
          <Tooltip>Show challenge list</Tooltip>
        </TooltipTrigger>
      </div>
    </aside>
  );
}
