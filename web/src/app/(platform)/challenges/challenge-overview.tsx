import { ChallengeCategoryLabel, challengeCategoryDefinition } from './challenge-category';
import { ChallengeNearbyStandings } from './challenge-nearby-standings';
import {
  solveCountLabel,
  type ChallengeEventStandingStub,
  type ChallengeSolveContext
} from './challenge-solve-stub';
import {
  EmptyState,
  LineChart,
  WeightedSegmentBar,
  type WeightedSegmentBarItem
} from '@/components/ui';
import {
  challengePointValue,
  challengePointWeights,
  challengePoints,
  challengeProgress,
  groupChallenges,
  orderChallengeSegments,
  type ChallengeExperience
} from '@/lib/challenges';

interface ChallengeOverviewProps {
  challenges: readonly ChallengeExperience[];
  getChallengeHref?: (challengeId: string) => string | undefined;
  onSelectChallenge?: (challengeId: string, trigger: HTMLElement) => void;
  solveContexts: ReadonlyMap<string, ChallengeSolveContext>;
  standing: ChallengeEventStandingStub;
}

export function ChallengeOverview({
  challenges,
  getChallengeHref,
  onSelectChallenge,
  solveContexts,
  standing
}: ChallengeOverviewProps) {
  const progress = challengeProgress(challenges);
  const groups = groupChallenges(challenges);
  const pointWeights = challengePointWeights(challenges);
  const recordedSolves = challenges.reduce((total, challenge) => {
    return total + (solveContexts.get(challenge.id)?.totalSolves ?? challenge.solveCount ?? 0);
  }, 0);
  const remaining = Math.max(0, progress.total - progress.solved);
  const eventStart = standing.scoreSeries.points[0]?.x;

  function segmentItems(
    segmentChallenges: readonly ChallengeExperience[],
    weights: ReadonlyMap<string, number>
  ): WeightedSegmentBarItem[] {
    return segmentChallenges.map((challenge) => {
      const definition = challengeCategoryDefinition(challenge.category);
      const points = challengePoints(challenge);
      const solves = solveCountLabel(
        solveContexts.get(challenge.id)?.totalSolves ?? challenge.solveCount ?? 0
      );
      const state = challenge.solved ? 'Solved' : 'Unsolved';

      return {
        href: getChallengeHref?.(challenge.id),
        id: challenge.id,
        isEmphasized: challenge.solved,
        label: `Open ${challenge.name}, ${points}, ${solves}, ${state}`,
        onPress: (event) => {
          const target = event.target as HTMLElement;
          onSelectChallenge?.(challenge.id, target.closest('a') ?? target);
        },
        tone: definition.tone,
        tooltip: (
          <span className="grid gap-1">
            <strong className="font-semibold text-text">{challenge.name}</strong>
            <span className="flex flex-wrap gap-x-3 text-xs tabular-nums text-text-muted">
              <span>{points}</span>
              <span>{solves}</span>
              <span>{state}</span>
            </span>
          </span>
        ),
        value: weights.get(challenge.id) ?? 1
      };
    });
  }

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
      className="h-full min-h-0 overflow-hidden bg-surface-raised"
    >
      <div className="flex h-full min-h-0 w-full flex-col gap-8 px-6 py-6">
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-6">
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

        <section aria-labelledby="score-trajectory-title" className="grid shrink-0 gap-4">
          <h3 className="m-0 text-base font-semibold text-text" id="score-trajectory-title">
            Around your rank
          </h3>
          <div className="grid gap-4 md:grid-cols-3 md:items-stretch lg:grid-cols-4">
            <div className="min-w-0 md:col-span-2 lg:col-span-3">
              <LineChart
                appearance="bare"
                description="Running scores for your team and nearby competitors."
                eventStart={eventStart}
                formatYValue={(value) => `${value.toLocaleString()} pts`}
                height="expanded"
                interpolation="step"
                series={standing.nearbySeries}
                showDataTable={false}
                showLegend={false}
                title="Scores around your rank"
              />
            </div>
            <ChallengeNearbyStandings entries={standing.nearbyStandings} />
          </div>
        </section>

        <section
          aria-labelledby="category-progress-title"
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-4 px-3">
            <h3 className="m-0 text-base font-semibold text-text" id="category-progress-title">
              Challenge field
            </h3>
            <span className="text-sm tabular-nums text-text-muted">{remaining} remaining</span>
          </div>

          <WeightedSegmentBar
            ariaLabel={`${progress.solved} of ${progress.total} challenges solved`}
            className="px-3"
            items={segmentItems(challenges, pointWeights)}
          />

          <div className="hidden grid-cols-12 gap-4 px-3 text-xs text-text-subtle xl:grid">
            <span className="col-span-2">Category</span>
            <span className="col-span-7">Progress</span>
            <span className="text-right">Points</span>
            <span className="col-span-2 text-right">Field solves</span>
          </div>

          <div className="kitsune-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ul aria-label="Category breakdown" className="m-0 grid list-none gap-0 p-0">
              {groups.map((group) => {
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
                    className="grid grid-cols-2 items-center gap-x-4 gap-y-2 px-3 py-0 xl:grid-cols-12"
                    key={group.category}
                  >
                    <strong className="min-w-0 text-sm font-semibold xl:col-span-2">
                      <ChallengeCategoryLabel category={group.category} />
                    </strong>
                    <div className="flex min-w-0 items-center gap-3 xl:col-span-7">
                      <WeightedSegmentBar
                        ariaLabel={`${group.solved} of ${group.challenges.length} ${group.category} challenges solved`}
                        className="min-w-0 flex-1"
                        items={segmentItems(
                          orderChallengeSegments(group.challenges),
                          challengePointWeights(group.challenges)
                        )}
                      />
                      <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-text">
                        {group.solved} / {group.challenges.length}
                      </span>
                    </div>
                    <span className="text-sm tabular-nums text-text-muted xl:col-span-1 xl:text-right">
                      {availablePoints.toLocaleString()} pts
                    </span>
                    <span className="text-right text-sm tabular-nums text-text-muted xl:col-span-2">
                      {categorySolves.toLocaleString()} {categorySolves === 1 ? 'solve' : 'solves'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>
    </section>
  );
}
