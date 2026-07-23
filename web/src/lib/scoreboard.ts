import type { ScoreHistorySeries } from './api/client';

export interface ScoreChartPoint {
  x: number;
  y: number;
}

export interface ScoreChartSeries {
  competitorId: string;
  name: string;
  points: ScoreChartPoint[];
}

export interface ScoreChartModel {
  maxScore: number;
  minScore: number;
  series: ScoreChartSeries[];
}

const chartWidth = 800;
const chartHeight = 320;
const chartInset = 32;

export function buildScoreChartModel(series: readonly ScoreHistorySeries[]): ScoreChartModel {
  const timestamps = series.flatMap((entry) => {
    return entry.points.map((point) => point.occurred_at);
  });
  const scores = series.flatMap((entry) => {
    return entry.points.map((point) => point.score);
  });
  const parsedTimestamps = timestamps
    .map((timestamp) => Date.parse(timestamp))
    .filter((timestamp) => Number.isFinite(timestamp));
  const start = Math.min(...parsedTimestamps);
  const end = Math.max(...parsedTimestamps);
  const duration = Number.isFinite(end - start) ? Math.max(end - start, 1) : 1;
  const maxScore = Math.max(0, ...scores);
  const minScore = Math.min(0, ...scores);
  const scoreCeiling = maxScore === minScore ? maxScore + 1 : maxScore;
  const scoreRange = scoreCeiling - minScore;
  const plotWidth = chartWidth - chartInset * 2;
  const plotHeight = chartHeight - chartInset * 2;

  return {
    maxScore,
    minScore,
    series: series.map((entry) => ({
      competitorId: entry.competitor_id,
      name: entry.name,
      points: entry.points.map((point) => {
        const timestamp = Date.parse(point.occurred_at);
        const normalizedTime = Number.isFinite(timestamp) ? (timestamp - start) / duration : 0;

        return {
          x: chartInset + normalizedTime * plotWidth,
          y: chartInset + ((scoreCeiling - point.score) / scoreRange) * plotHeight
        };
      })
    }))
  };
}

export function scoreChartPath(points: readonly ScoreChartPoint[]): string {
  return points
    .map((point, index) => {
      return `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    })
    .join(' ');
}
