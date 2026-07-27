import { ChallengeCategoryLabel, challengeCategoryDefinition } from './challenge-category';
import type { ChallengeEventStandingStub, ChallengeSolveContext } from './challenge-solve-stub';
import { EmptyState, LineChart } from '@/components/ui';
import { cx } from '@/components/ui/styles';
import {
  challengePointValue,
  challengeProgress,
  groupChallenges,
  type ChallengeCategoryTone,
  type ChallengeExperience
} from '@/lib/challenges';

const categorySolidClasses: Record<ChallengeCategoryTone, string> = {
  amber: 'bg-category-amber',
  blue: 'bg-category-blue',
  cyan: 'bg-category-cyan',
  lime: 'bg-category-lime',
  orange: 'bg-category-orange',
  pink: 'bg-category-pink',
  teal: 'bg-category-teal',
  violet: 'bg-category-violet'
};

const categorySubtleClasses: Record<ChallengeCategoryTone, string> = {
  amber: 'bg-category-amber-subtle',
  blue: 'bg-category-blue-subtle',
  cyan: 'bg-category-cyan-subtle',
  lime: 'bg-category-lime-subtle',
  orange: 'bg-category-orange-subtle',
  pink: 'bg-category-pink-subtle',
  teal: 'bg-category-teal-subtle',
  violet: 'bg-category-violet-subtle'
};

interface ChallengeOverviewProps {
  challenges: readonly ChallengeExperience[];
  solveContexts: ReadonlyMap<string, ChallengeSolveContext>;
  standing: ChallengeEventStandingStub;
}

export function ChallengeOverview({ challenges, solveContexts, standing }: ChallengeOverviewProps) {
  const progress = challengeProgress(challenges);
  const groups = groupChallenges(challenges);
  const recordedSolves = challenges.reduce((total, challenge) => {
    return total + (solveContexts.get(challenge.id)?.totalSolves ?? challenge.solveCount ?? 0);
  }, 0);
  const remaining = Math.max(0, progress.total - progress.solved);
  const eventStart = standing.scoreSeries.points[0]?.x;

  if (challenges.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-surface-raised p-6">
        <EmptyState title="No challenges available" />
      </div>
    );
  }

  return (
    <section
      aria-labelledby="competition-overview-title"
      className="kitsune-scroll-region h-full min-h-0 overflow-y-auto overscroll-contain bg-surface-raised"
    >
      <div className="mx-auto grid w-full max-w-shell content-start gap-8 px-8 py-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="grid gap-2">
            <h2
              className="m-0 font-display text-xl font-semibold tracking-tight text-text"
              id="competition-overview-title"
            >
              Your run
            </h2>
            <p className="m-0 max-w-prose text-base text-text-muted">
              <strong className="font-semibold tabular-nums text-text">
                {progress.earnedPoints.toLocaleString()} points
              </strong>{' '}
              from {progress.solved} of {progress.total} challenges. Rank{' '}
              <strong className="font-semibold tabular-nums text-text">
                {standing.rank} of {standing.totalCompetitors}
              </strong>
            </p>
          </div>
          <p className="m-0 text-sm tabular-nums text-text-muted">
            {recordedSolves.toLocaleString()} recorded solves
          </p>
        </header>

        <section aria-labelledby="score-trajectory-title" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h3 className="m-0 text-base font-semibold text-text" id="score-trajectory-title">
              Around your rank
            </h3>
            <span className="text-sm text-text-muted">Score trajectory</span>
          </div>
          <LineChart
            appearance="bare"
            description="Running scores for your team and nearby competitors."
            eventStart={eventStart}
            formatYValue={(value) => `${value.toLocaleString()} pts`}
            height="compact"
            interpolation="step"
            series={standing.nearbySeries}
            title="Scores around your rank"
          />
        </section>

        <section aria-labelledby="category-progress-title" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h3 className="m-0 text-base font-semibold text-text" id="category-progress-title">
              Challenge field
            </h3>
            <span className="text-sm tabular-nums text-text-muted">{remaining} remaining</span>
          </div>

          <ol
            aria-label={`${progress.solved} of ${progress.total} challenges solved`}
            className="m-0 flex list-none gap-1 p-0"
          >
            {challenges.map((challenge) => {
              const definition = challengeCategoryDefinition(challenge.category);

              return (
                <li
                  className={cx(
                    'h-2 min-w-0 flex-1 rounded-sm',
                    challenge.solved
                      ? categorySolidClasses[definition.tone]
                      : categorySubtleClasses[definition.tone]
                  )}
                  key={challenge.id}
                >
                  <span className="sr-only">
                    {challenge.name}: {challenge.solved ? 'solved' : 'unsolved'}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="hidden grid-cols-6 gap-4 px-3 text-xs text-text-subtle xl:grid">
            <span className="col-span-2">Category</span>
            <span className="col-span-2">Progress</span>
            <span className="text-right">Points</span>
            <span className="text-right">Field solves</span>
          </div>

          <ul className="m-0 grid list-none gap-0 p-0">
            {groups.map((group) => {
              const definition = challengeCategoryDefinition(group.category);
              const availablePoints = group.challenges.reduce((total, challenge) => {
                return total + challengePointValue(challenge);
              }, 0);
              const categorySolves = group.challenges.reduce((total, challenge) => {
                return (
                  total +
                  (solveContexts.get(challenge.id)?.totalSolves ?? challenge.solveCount ?? 0)
                );
              }, 0);

              return (
                <li
                  className="grid grid-cols-2 items-center gap-x-4 gap-y-2 px-3 py-3 xl:grid-cols-6"
                  key={group.category}
                >
                  <strong className="min-w-0 text-sm font-semibold xl:col-span-2">
                    <ChallengeCategoryLabel category={group.category} />
                  </strong>
                  <div className="grid min-w-0 gap-2 xl:col-span-2">
                    <span className="text-right text-sm font-semibold tabular-nums text-text">
                      {group.solved} / {group.challenges.length}
                    </span>
                    <span className="flex gap-1">
                      {group.challenges.map((challenge) => (
                        <span
                          aria-hidden
                          className={cx(
                            'h-1 min-w-0 flex-1 rounded-sm',
                            challenge.solved
                              ? categorySolidClasses[definition.tone]
                              : categorySubtleClasses[definition.tone]
                          )}
                          key={challenge.id}
                        />
                      ))}
                    </span>
                  </div>
                  <span className="text-sm tabular-nums text-text-muted xl:text-right">
                    {availablePoints.toLocaleString()} pts
                  </span>
                  <span className="text-right text-sm tabular-nums text-text-muted">
                    {categorySolves.toLocaleString()} {categorySolves === 1 ? 'solve' : 'solves'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </section>
  );
}
