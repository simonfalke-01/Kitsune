import { BarChart, LineChart, TimelineChart } from '@/components/ui';
import type { ScoreHistorySeries } from '@/lib/api/client';
import {
  buildCadenceBuckets,
  buildCategoryPointRows,
  buildDifficultyRows,
  buildSolveScoreSeries,
  buildTimelineLanes,
  type AnalyticsSolve
} from '@/lib/visualization/analytics';
import { buildScoreHistorySeries } from '@/lib/visualization/score-history';
import type { ChartSeries } from '@/lib/visualization/types';
import type { ChallengeCategoryTone } from '@/lib/challenges';

const toneIndexes: Record<ChallengeCategoryTone, number> = {
  amber: 3,
  blue: 0,
  cyan: 4,
  lime: 5,
  orange: 3,
  pink: 2,
  teal: 4,
  violet: 1
};

interface ProfileAnalyticsProps {
  competitorId: string;
  competitorName: string;
  end: number;
  scoreHistory?: ScoreHistorySeries | null;
  solves: readonly AnalyticsSolve[];
  start: number;
}

function durationLabel(start: number, end: number): string {
  const minutes = Math.max(1, Math.round((end - start) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours > 0 ? `${hours}h ${remaining}m` : `${remaining}m`;
}

export function ProfileAnalytics({
  competitorId,
  competitorName,
  end,
  scoreHistory = null,
  solves,
  start
}: ProfileAnalyticsProps) {
  const solveScoreSeries = buildSolveScoreSeries({
    competitorId,
    competitorName,
    eventStart: start,
    solves
  });
  const scoreSeries: ChartSeries<unknown> = scoreHistory
    ? (buildScoreHistorySeries([scoreHistory], new Set([competitorId]))[0] ?? solveScoreSeries)
    : solveScoreSeries;
  const categoryRows = buildCategoryPointRows(solves);
  const lanes = buildTimelineLanes(solves);
  const cadence = buildCadenceBuckets({
    end,
    solves,
    start
  });
  const difficulty = buildDifficultyRows(solves);

  return (
    <div className="grid gap-8">
      <section aria-labelledby="profile-score-chart" className="grid gap-4">
        <h3 className="m-0 text-lg font-semibold text-text" id="profile-score-chart">
          Score over time
        </h3>
        <LineChart
          description={`Cumulative score progression for ${competitorName}.`}
          eventStart={start}
          formatTooltip={(point) => (
            <>
              <strong className="truncate">{point.label}</strong>
              <span className="tabular-nums">{point.y.toLocaleString()} points</span>
              <span className="text-xs text-text-muted">{new Date(point.x).toLocaleString()}</span>
            </>
          )}
          formatYValue={(value) => `${value.toLocaleString()} pts`}
          interpolation="step"
          series={[scoreSeries]}
          showLegend={false}
          title={`${competitorName} score over time`}
        />
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <section aria-labelledby="profile-category-chart" className="grid content-start gap-4">
          <h3 className="m-0 text-lg font-semibold text-text" id="profile-category-chart">
            Points by category
          </h3>
          <BarChart
            description={`Points earned by ${competitorName} in each challenge category.`}
            emptyDescription="Category totals will appear after the first visible solve."
            emptyTitle="No category data"
            formatValue={(value) => `${value.toLocaleString()} pts`}
            rows={categoryRows.map((row) => ({
              id: row.category,
              label: row.category,
              secondary: `${row.solveCount} solved`,
              tone: toneIndexes[row.tone],
              value: row.points
            }))}
            title="Points by category"
          />
        </section>

        <section aria-labelledby="profile-cadence-chart" className="grid content-start gap-4">
          <h3 className="m-0 text-lg font-semibold text-text" id="profile-cadence-chart">
            Solve cadence
          </h3>
          <BarChart
            description={`Visible solves by time bucket for ${competitorName}.`}
            emptyDescription="Cadence will appear after the first visible solve."
            emptyTitle="No cadence data"
            formatValue={(value) => `${value} solved`}
            rows={cadence.map((bucket, index) => ({
              id: bucket.id,
              label: durationLabel(start, bucket.end),
              secondary: durationLabel(bucket.start, bucket.end),
              tone: index,
              value: bucket.count
            }))}
            title="Solve cadence"
          />
        </section>
      </div>

      <section aria-labelledby="profile-timeline-chart" className="grid gap-4">
        <h3 className="m-0 text-lg font-semibold text-text" id="profile-timeline-chart">
          Solve timeline
        </h3>
        <TimelineChart
          description={`Visible solves for ${competitorName}, grouped by category.`}
          end={end}
          lanes={lanes.map((lane) => ({
            id: lane.category,
            label: lane.category,
            points: lane.solves.map((solve) => ({
              detail: `${solve.points} points at ${new Date(solve.solvedAt).toLocaleString()}`,
              id: `${solve.challengeId}-${solve.solvedAt}`,
              label: solve.challengeName,
              timestamp: solve.solvedAt
            })),
            tone: toneIndexes[lane.tone]
          }))}
          start={start}
          title="Solve timeline"
        />
      </section>

      <section aria-labelledby="profile-difficulty-chart" className="grid gap-4">
        <h3 className="m-0 text-lg font-semibold text-text" id="profile-difficulty-chart">
          Difficulty profile
        </h3>
        <BarChart
          description={`Visible solves for ${competitorName}, grouped by global solve count.`}
          emptyDescription="Difficulty requires public solve counts for visible challenges."
          emptyTitle="Difficulty unavailable"
          formatValue={(value) => `${value} solved`}
          rows={difficulty.map((row, index) => ({
            id: row.id,
            label: row.label,
            secondary: `${row.points.toLocaleString()} pts`,
            tone: index,
            value: row.solveCount
          }))}
          title="Difficulty profile"
        />
      </section>
    </div>
  );
}
