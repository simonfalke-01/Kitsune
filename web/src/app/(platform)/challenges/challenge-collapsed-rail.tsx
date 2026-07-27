'use client';

import { PanelLeftOpen } from 'lucide-react';
import type { RefObject } from 'react';

import { Button, Tooltip, TooltipTrigger } from '@/components/ui';

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
          <Button
            aria-label="Show challenge list"
            className="size-control"
            onPress={onShowChallengeList}
            size="icon"
            tone="quiet"
          >
            <PanelLeftOpen aria-hidden className="size-4" />
          </Button>
          <Tooltip>Show challenge list</Tooltip>
        </TooltipTrigger>
      </div>
    </aside>
  );
}
