import type { ChallengeBloodRank } from './challenge-solve-status';
import { ChallengeSolveStatus } from './challenge-solve-status';
import type { FirstBloodHighlightColor } from './challenge-presentation';
import { solveCountLabel, type ChallengeSolveContext } from './challenge-solve-stub';
import { CollectionLink, PresenceSummary } from '@/components/ui';
import type { ChallengePresenceMember } from '@/lib/api/client';
import {
  challengePoints,
  type ChallengeCategoryTone,
  type ChallengeExperience
} from '@/lib/challenges';

interface ChallengeCollectionRowProps {
  challenge: ChallengeExperience;
  firstBloodHighlightColor: FirstBloodHighlightColor;
  href?: string;
  isSelected: boolean;
  onSelect?: (challengeId: string, trigger: HTMLElement) => void;
  presence: readonly ChallengePresenceMember[];
  solveContext?: ChallengeSolveContext;
  tone: ChallengeCategoryTone;
}

export function ChallengeCollectionRow({
  challenge,
  firstBloodHighlightColor,
  href,
  isSelected,
  onSelect,
  presence,
  solveContext,
  tone
}: ChallengeCollectionRowProps) {
  const solveCount = solveContext?.totalSolves ?? challenge.solveCount ?? 0;
  const selfRank = challenge.solved ? solveContext?.selfEntry?.rank : null;
  const bloodRank = selfRank && selfRank <= 3 ? (selfRank as ChallengeBloodRank) : null;
  const people = presence.map((member) => ({
    id: member.user_id,
    name: member.display_name
  }));

  return (
    <li>
      <CollectionLink
        appearance="challenge"
        className="kitsune-challenge-row"
        data-blood={bloodRank ?? undefined}
        data-challenge-id={challenge.id}
        data-challenge-row
        data-first-blood-color={bloodRank === 1 ? firstBloodHighlightColor : undefined}
        data-solved={challenge.solved || undefined}
        href={href}
        isSelected={isSelected}
        onPress={(event) => {
          const target = event.target as HTMLElement;
          onSelect?.(challenge.id, target.closest('a') ?? target);
        }}
        tone={tone}
      >
        <span className="flex items-center justify-between gap-4">
          <span className="grid min-w-0 gap-1">
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-text">
              {challenge.name}
            </span>
            {challenge.solved ? (
              <span className="flex min-w-0 items-center gap-2">
                <ChallengeSolveStatus
                  bloodRank={bloodRank}
                  firstBloodHighlightColor={firstBloodHighlightColor}
                />
                <PresenceSummary people={people} />
              </span>
            ) : presence.length > 0 ? (
              <PresenceSummary people={people} />
            ) : challenge.authorName ? (
              <span className="truncate text-sm text-text-subtle">by {challenge.authorName}</span>
            ) : (
              <span className="text-sm text-text-subtle">Unsolved</span>
            )}
          </span>
          <span className="grid shrink-0 justify-items-end gap-1">
            <span className="text-sm font-medium tabular-nums text-text">
              {challengePoints(challenge)}
            </span>
            <span className="text-sm tabular-nums text-text-muted">
              {solveCountLabel(solveCount)}
            </span>
          </span>
        </span>
      </CollectionLink>
    </li>
  );
}
