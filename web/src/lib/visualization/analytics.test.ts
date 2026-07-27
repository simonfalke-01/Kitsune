import { describe, expect, it } from 'vitest';

import {
  buildCadenceBuckets,
  buildCategoryPointRows,
  buildDifficultyRows,
  buildSolveScoreSeries,
  buildTimelineLanes,
  type AnalyticsSolve
} from './analytics';

const start = Date.parse('2026-07-23T00:00:00Z');
const solves: AnalyticsSolve[] = [
  {
    category: 'Web',
    challengeId: 'web-1',
    challengeName: 'Gate',
    globalSolves: 1,
    points: 100,
    solvedAt: start + 30 * 60_000
  },
  {
    category: 'Crypto',
    challengeId: 'crypto-1',
    challengeName: 'Cipher',
    globalSolves: 8,
    points: 200,
    solvedAt: start + 2 * 60 * 60_000
  },
  {
    category: 'Web',
    challengeId: 'web-2',
    challengeName: 'Temple',
    globalSolves: 60,
    points: 300,
    solvedAt: start + 4 * 60 * 60_000
  }
];

describe('profile analytics models', () => {
  it('builds cumulative score history and category totals', () => {
    const score = buildSolveScoreSeries({
      competitorId: 'team',
      competitorName: 'Foxden',
      eventStart: start,
      solves
    });
    expect(score.points.map((point) => point.y)).toEqual([0, 100, 300, 600]);
    expect(buildCategoryPointRows(solves).map((row) => [row.category, row.points])).toEqual([
      ['Web', 400],
      ['Crypto', 200]
    ]);
  });

  it('builds cadence, timeline and difficulty summaries', () => {
    const cadence = buildCadenceBuckets({
      end: start + 8 * 60 * 60_000,
      solves,
      start
    });
    expect(cadence.reduce((total, bucket) => total + bucket.count, 0)).toBe(3);
    expect(buildTimelineLanes(solves).map((lane) => lane.category)).toEqual(['Crypto', 'Web']);
    expect(buildDifficultyRows(solves).map((row) => row.solveCount)).toEqual([1, 0, 1, 0, 1]);
  });
});
