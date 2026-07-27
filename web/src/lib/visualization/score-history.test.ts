import { describe, expect, it } from 'vitest';

import { buildScoreHistorySeries, buildSparklineSeries } from './score-history';

describe('score history models', () => {
  it('preserves source metadata and removes invalid timestamps', () => {
    const series = buildScoreHistorySeries([
      {
        competitor_id: 'team',
        competitor_kind: 'team',
        name: 'Foxden',
        points: [
          {
            occurred_at: 'invalid',
            score: 10,
            sequence: 1
          },
          {
            occurred_at: '2026-07-23T10:00:00Z',
            score: 20,
            sequence: 2
          }
        ]
      }
    ]);

    expect(series[0]?.points).toHaveLength(1);
    expect(series[0]?.points[0]?.metadata).toEqual({
      occurredAt: '2026-07-23T10:00:00Z',
      score: 20,
      sequence: 2
    });
  });

  it('carries the last value into a shared sparkline window', () => {
    const latest = Date.parse('2026-07-23T18:00:00Z');
    const series = buildScoreHistorySeries([
      {
        competitor_id: 'team',
        competitor_kind: 'team',
        name: 'Foxden',
        points: [
          {
            occurred_at: '2026-07-23T05:00:00Z',
            score: 100,
            sequence: 1
          },
          {
            occurred_at: '2026-07-23T12:00:00Z',
            score: 300,
            sequence: 2
          }
        ]
      }
    ])[0]!;
    const sparkline = buildSparklineSeries(series, latest);

    expect(sparkline.points.map((point) => point.x)).toEqual([
      Date.parse('2026-07-23T06:00:00Z'),
      Date.parse('2026-07-23T12:00:00Z'),
      latest
    ]);
    expect(sparkline.points.map((point) => point.y)).toEqual([100, 300, 300]);
  });
});
