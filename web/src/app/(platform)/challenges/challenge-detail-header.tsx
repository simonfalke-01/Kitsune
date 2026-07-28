'use client';

import { ChallengeCategoryLabel } from './challenge-category';
import type { FirstBloodHighlightColor } from './challenge-presentation';
import { ChallengeSolveStatus } from './challenge-solve-status';
import { solveCountLabel } from './challenge-solve-stub';
import { CopyIconButton, showToast } from '@/components/ui';
import { cx, focusTargetRing } from '@/components/ui/styles';
import { challengeAttempts, challengePoints, type ChallengeExperience } from '@/lib/challenges';

interface ChallengeDetailHeaderProps {
  challenge: ChallengeExperience;
  firstBloodHighlightColor: FirstBloodHighlightColor;
  isFirstBlood: boolean;
  isPendingReview: boolean;
  isSolved: boolean;
  shareHref?: string;
  showTitle: boolean;
  solveCount: number;
}

export function ChallengeDetailHeader({
  challenge,
  firstBloodHighlightColor,
  isFirstBlood,
  isPendingReview,
  isSolved,
  shareHref,
  showTitle,
  solveCount
}: ChallengeDetailHeaderProps) {
  return (
    <header className="shrink-0 px-6 py-6">
      <div className="flex w-full items-start justify-between gap-6">
        <div className="grid min-w-0 gap-2">
          {showTitle ? (
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2
                className={cx(
                  'm-0 rounded-sm font-display text-xl font-semibold tracking-tight text-text outline-none',
                  focusTargetRing
                )}
                id="challenge-detail"
                tabIndex={-1}
              >
                {challenge.name}
              </h2>
              {challenge.authorName ? (
                <span className="text-sm text-text-muted">by {challenge.authorName}</span>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
            <ChallengeCategoryLabel category={challenge.category} />
            <span>{challengeAttempts(challenge)}</span>
            <span className="tabular-nums">{solveCountLabel(solveCount)}</span>
            {isSolved ? (
              <ChallengeSolveStatus
                bloodRank={isFirstBlood ? 1 : null}
                firstBloodHighlightColor={firstBloodHighlightColor}
              />
            ) : null}
            {isPendingReview ? (
              <span className="font-medium text-info-text">Pending review</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <strong className="text-lg tabular-nums text-text">{challengePoints(challenge)}</strong>
          <CopyIconButton
            copiedLabel="Challenge link copied"
            label="Copy challenge link"
            onCopy={() => {
              showToast({
                title: 'Challenge link copied',
                tone: 'success'
              });
            }}
            onError={() => {
              showToast({
                description: 'Copy the address from your browser and retry.',
                title: 'Challenge link could not be copied',
                tone: 'danger'
              });
            }}
            value={() =>
              shareHref ? new URL(shareHref, window.location.href).toString() : window.location.href
            }
          />
        </div>
      </div>
    </header>
  );
}
