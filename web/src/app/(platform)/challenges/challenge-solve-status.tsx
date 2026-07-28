import { Check, Trophy } from 'lucide-react';

import type { FirstBloodHighlightColor } from './challenge-presentation';
import { cx } from '@/components/ui/styles';

export type ChallengeBloodRank = 1 | 2 | 3;

const bloodTextClasses: Record<ChallengeBloodRank, string> = {
  1: 'kitsune-first-blood-copy',
  2: 'text-podium-second',
  3: 'text-podium-third'
};

const bloodLabels: Record<ChallengeBloodRank, string> = {
  1: 'First blood',
  2: 'Second blood',
  3: 'Third blood'
};

interface ChallengeSolveStatusProps {
  bloodRank?: ChallengeBloodRank | null;
  className?: string;
  firstBloodHighlightColor: FirstBloodHighlightColor;
}

export function ChallengeSolveStatus({
  bloodRank,
  className,
  firstBloodHighlightColor
}: ChallengeSolveStatusProps) {
  const Icon = bloodRank ? Trophy : Check;

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1 text-sm font-medium',
        bloodRank ? bloodTextClasses[bloodRank] : 'text-success-text',
        className
      )}
      data-first-blood-color={bloodRank === 1 ? firstBloodHighlightColor : undefined}
    >
      <Icon
        aria-hidden
        className={cx('size-4 shrink-0', bloodRank ? '-translate-y-optical' : null)}
      />
      {bloodRank ? bloodLabels[bloodRank] : 'Solved'}
    </span>
  );
}
