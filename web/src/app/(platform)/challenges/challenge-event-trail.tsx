import { ChallengeCategoryLabel } from './challenge-category';
import type { ChallengeEventStandingStub } from './challenge-solve-stub';
import { Progress, Sparkline } from '@/components/ui';
import { challengeProgress, type ChallengeExperience } from '@/lib/challenges';

interface ChallengeEventTrailProps {
  challenges: ChallengeExperience[];
  eventName: string;
  selectedChallenge?: ChallengeExperience | null;
  standing: ChallengeEventStandingStub;
}

export function ChallengeEventTrail({
  challenges,
  eventName,
  selectedChallenge,
  standing
}: ChallengeEventTrailProps) {
  const progress = challengeProgress(challenges);

  return (
    <section
      aria-label="Event progress"
      className="shrink-0 overflow-hidden rounded-md bg-surface-raised"
    >
      <div className="flex min-h-16 items-center gap-6 px-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-6 gap-y-1">
          <h1 className="m-0 shrink-0 truncate font-display text-lg font-semibold tracking-tight text-text">
            {eventName}
          </h1>
          {selectedChallenge ? (
            <div className="hidden min-w-0 items-baseline gap-2 text-base xl:flex">
              <ChallengeCategoryLabel category={selectedChallenge.category} showIcon={false} />
              <span className="text-text-subtle">/</span>
              <strong className="truncate font-medium text-text">{selectedChallenge.name}</strong>
            </div>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-base tabular-nums text-text-muted">
            <span>
              <strong className="font-semibold text-text">{progress.solved}</strong> /{' '}
              {progress.total} solved
            </span>
            <span>
              <strong className="font-semibold text-text">
                {progress.earnedPoints.toLocaleString()}
              </strong>{' '}
              / {progress.availablePoints.toLocaleString()} pts
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-right text-sm tabular-nums text-text-muted sm:block">
            Rank <strong className="font-semibold text-text">{standing.rank}</strong> /{' '}
            {standing.totalCompetitors}
          </span>
          <Sparkline interpolation="step" series={standing.scoreSeries} />
        </div>
      </div>
      <Progress
        appearance="trail"
        label="Event solve progress"
        maxValue={Math.max(progress.total, 1)}
        value={progress.solved}
      />
    </section>
  );
}
