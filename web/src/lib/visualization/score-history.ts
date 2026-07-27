import type { ScoreHistorySeries } from '../api/client';
import type { ChartSeries } from './types';

export interface ScoreHistoryMetadata {
  occurredAt: string;
  score: number;
  sequence: number;
}

export function buildScoreHistorySeries(
  series: readonly ScoreHistorySeries[],
  emphasizedCompetitorIds: ReadonlySet<string> = new Set()
): ChartSeries<ScoreHistoryMetadata>[] {
  return series.map((entry, index) => ({
    id: entry.competitor_id,
    isEmphasized: emphasizedCompetitorIds.has(entry.competitor_id),
    label: entry.name,
    lineStyle: index < 6 ? 'solid' : index < 12 ? 'dashed' : 'dotted',
    points: entry.points
      .map((point) => ({
        id: `${entry.competitor_id}-${point.sequence}`,
        label: entry.name,
        metadata: {
          occurredAt: point.occurred_at,
          score: point.score,
          sequence: point.sequence
        },
        x: Date.parse(point.occurred_at),
        y: point.score
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .sort((left, right) => left.x - right.x || left.metadata.sequence - right.metadata.sequence),
    tone: index
  }));
}

export function latestSeriesValues(series: readonly ChartSeries<ScoreHistoryMetadata>[]): Array<{
  id: string;
  label: string;
  score: number;
  tone: number;
}> {
  return series.map((entry) => ({
    id: entry.id,
    label: entry.label,
    score: entry.points.at(-1)?.y ?? 0,
    tone: entry.tone
  }));
}

export function buildSparklineSeries(
  series: ChartSeries<ScoreHistoryMetadata>,
  latestTimestamp: number,
  duration = 12 * 60 * 60_000
): ChartSeries<ScoreHistoryMetadata> {
  const start = latestTimestamp - duration;
  const beforeWindow = series.points.filter((point) => point.x < start).at(-1);
  const points = series.points.filter((point) => point.x >= start && point.x <= latestTimestamp);

  if (beforeWindow && points.length > 0) {
    points.unshift({
      ...beforeWindow,
      id: `${beforeWindow.id}-window-start`,
      x: start
    });
  }

  const latestPoint = points.at(-1);

  if (latestPoint && latestPoint.x < latestTimestamp) {
    points.push({
      ...latestPoint,
      id: `${latestPoint.id}-window-end`,
      x: latestTimestamp
    });
  }

  return {
    ...series,
    points
  };
}
