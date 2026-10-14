'use client';

import { useMemo, useState } from 'react';

import { Button, LineChart } from '@/components/ui';
import type { ScoreHistory } from '@/lib/api/client';
import { buildScoreHistorySeries } from '@/lib/visualization/score-history';

interface ScoreHistoryChartProps {
  activeCompetitorId?: string | null;
  emphasizedCompetitorId?: string | null;
  eventStart?: string | null;
  history: ScoreHistory;
  onActiveCompetitorChange?: (competitorId: string | null) => void;
}

export function ScoreHistoryChart({
  activeCompetitorId,
  emphasizedCompetitorId,
  eventStart,
  history,
  onActiveCompetitorChange
}: ScoreHistoryChartProps) {
  const [seriesLimit, setSeriesLimit] = useState(10);
  const series = useMemo(() => {
    return buildScoreHistorySeries(
      history.series.slice(0, seriesLimit),
      emphasizedCompetitorId ? new Set([emphasizedCompetitorId]) : new Set()
    );
  }, [emphasizedCompetitorId, history.series, seriesLimit]);
  const parsedEventStart = eventStart ? Date.parse(eventStart) : Number.NaN;
  const firstPoint = Math.min(
    ...series.flatMap((entry) => entry.points.map((point) => point.x)).filter(Number.isFinite)
  );
  const resolvedStart = Number.isFinite(parsedEventStart)
    ? parsedEventStart
    : Number.isFinite(firstPoint)
      ? firstPoint
      : undefined;

  return (
    <div className="grid gap-4">
      {history.series.length > 5 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-text-muted">
            Showing {Math.min(seriesLimit, history.series.length)} of {history.series.length} series
          </span>
          <div aria-label="Score history density" className="flex gap-2" role="group">
            {[5, 10, 20].map((limit) => (
              <Button
                aria-pressed={seriesLimit === limit}
                key={limit}
                onPress={() => {
                  setSeriesLimit(limit);
                }}
                size="small"
                tone={seriesLimit === limit ? 'primary' : 'quiet'}
              >
                Top {limit}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <LineChart
        activeSeriesId={activeCompetitorId}
        description="Running score totals for the leading competitors in this event."
        emptyDescription="Score changes will appear after the first accepted solve."
        emptyTitle="No score history"
        eventStart={resolvedStart}
        formatTooltip={(point) => (
          <>
            <strong className="truncate">{point.seriesLabel}</strong>
            <span className="tabular-nums">{point.y.toLocaleString()} points</span>
            <span className="text-xs text-text-muted">{new Date(point.x).toLocaleString()}</span>
          </>
        )}
        formatYValue={(value) => `${new Intl.NumberFormat().format(value)} pts`}
        interpolation="step"
        onActiveSeriesChange={onActiveCompetitorChange}
        series={series}
        showLegend={false}
        title="Score history"
      />
    </div>
  );
}
