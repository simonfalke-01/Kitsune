import { describe, expect, it } from 'vitest';

import { buildScoreChartModel, scoreChartPath } from './scoreboard';

describe('scoreboard chart model', () => {
  it('maps score history into bounded chart coordinates', () => {
    const model = buildScoreChartModel([
      {
        competitor_id: 'team-1',
        competitor_kind: 'team',
        name: 'Foxden',
        points: [
          {
            occurred_at: '2026-07-23T10:00:00Z',
            score: 100,
            sequence: 1
          },
          {
            occurred_at: '2026-07-23T11:00:00Z',
            score: 300,
            sequence: 2
          }
        ]
      }
    ]);

    expect(model.maxScore).toBe(300);
    expect(model.series[0]?.points[0]?.x).toBe(32);
    expect(model.series[0]?.points[0]?.y).toBeCloseTo(202.67);
    expect(model.series[0]?.points[1]).toEqual({
      x: 768,
      y: 32
    });
  });

  it('keeps empty and zero-score histories finite', () => {
    const model = buildScoreChartModel([
      {
        competitor_id: 'user-1',
        competitor_kind: 'user',
        name: 'Rei',
        points: [
          {
            occurred_at: 'invalid',
            score: 0,
            sequence: 1
          }
        ]
      }
    ]);

    expect(model.series[0]?.points[0]).toEqual({
      x: 32,
      y: 288
    });
    expect(scoreChartPath([])).toBe('');
    expect(scoreChartPath(model.series[0]?.points ?? [])).toBe('M 32.00 288.00');
  });

  it('keeps negative score adjustments inside the chart', () => {
    const model = buildScoreChartModel([
      {
        competitor_id: 'team-2',
        competitor_kind: 'team',
        name: 'Lantern',
        points: [
          {
            occurred_at: '2026-07-23T10:00:00Z',
            score: -10,
            sequence: 1
          },
          {
            occurred_at: '2026-07-23T11:00:00Z',
            score: 20,
            sequence: 2
          }
        ]
      }
    ]);

    expect(model.minScore).toBe(-10);
    expect(model.series[0]?.points[0]?.y).toBe(288);
    expect(model.series[0]?.points[1]?.y).toBe(32);
  });
});
