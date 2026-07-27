'use client';

import { PanelLeftOpen } from 'lucide-react';
import type { RefObject } from 'react';

import { categoryTextClasses, challengeCategoryDefinition } from './challenge-category';
import { Button, Tooltip, TooltipTrigger } from '@/components/ui';
import { groupChallenges, type ChallengeExperience } from '@/lib/challenges';

interface ChallengeCollapsedRailProps {
  challenges: readonly ChallengeExperience[];
  onOpenCategory: (category: string) => void;
  onShowChallengeList: () => void;
  railRef?: RefObject<HTMLElement | null>;
  selectedChallengeId: string | null;
}

export function ChallengeCollapsedRail({
  challenges,
  onOpenCategory,
  onShowChallengeList,
  railRef,
  selectedChallengeId
}: ChallengeCollapsedRailProps) {
  const groups = groupChallenges(challenges);
  const selectedCategory = challenges.find(
    (challenge) => challenge.id === selectedChallengeId
  )?.category;

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
      <ul className="kitsune-scroll-region m-0 grid min-h-0 list-none content-start justify-center gap-2 overflow-y-auto px-2 py-2">
        {groups.map((group) => {
          const definition = challengeCategoryDefinition(group.category);
          const Icon = definition.icon;
          const isCurrent = group.category === selectedCategory;
          const label = `${definition.label}, ${group.solved} of ${group.challenges.length} solved`;

          return (
            <li className="grid justify-items-center" key={group.category}>
              <TooltipTrigger>
                <Button
                  aria-label={`Open ${label}`}
                  className={`relative size-control ${isCurrent ? 'bg-surface-active' : ''}`}
                  onPress={() => {
                    onOpenCategory(group.category);
                  }}
                  size="icon"
                  tone="quiet"
                >
                  {isCurrent ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-2 left-0 w-1 rounded-sm bg-accent"
                    />
                  ) : null}
                  <Icon aria-hidden className={`size-4 ${categoryTextClasses[definition.tone]}`} />
                </Button>
                <Tooltip>{label}</Tooltip>
              </TooltipTrigger>
              <span className="text-xs tabular-nums text-text-subtle">
                {group.solved}/{group.challenges.length}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
