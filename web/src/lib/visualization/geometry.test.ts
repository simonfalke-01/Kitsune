import { describe, expect, it } from 'vitest';

import {
  createLinearScale,
  createMonotonePath,
  createNumericTicks,
  createPlotBounds,
  createStepPath,
  extentDomain,
  findNearestDatum,
  plotSeries,
  positionTooltip
} from './geometry';
import type { ChartSeries } from './types';

const series: ChartSeries<{ value: number }>[] = [
  {
    id: 'fox',
    label: 'Fox',
    points: [
      {
        id: 'a',
        label: 'A',
        metadata: {
          value: 1
        },
        x: 0,
        y: -10
      },
      {
        id: 'b',
        label: 'B',
        metadata: {
          value: 2
        },
        x: 10,
        y: 20
      }
    ],
    tone: 0
  }
];

describe('visualization geometry', () => {
  it('creates finite signed domains and invertible scales', () => {
    expect(extentDomain([-10, 20], { includeZero: true })).toEqual([-10, 20]);
    expect(extentDomain([], { includeZero: true })).toEqual([0, 1]);

    const scale = createLinearScale({
      domain: [-10, 20],
      range: [100, 400]
    });
    expect(scale.map(-10)).toBe(100);
    expect(scale.map(20)).toBe(400);
    expect(scale.invert(250)).toBe(5);
  });

  it('creates coherent signed ticks', () => {
    expect(createNumericTicks([-10, 20], 5).map((tick) => tick.value)).toEqual([-10, 0, 10, 20]);
  });

  it('plots series and creates monotone paths without invalid coordinates', () => {
    const plotted = plotSeries({
      bounds: createPlotBounds(),
      series
    });
    const path = createMonotonePath(plotted.plottedSeries[0]!.points);

    expect(path).toContain('M');
    expect(path).toContain('L');
    expect(path).not.toContain('NaN');
  });

  it('creates stepped score paths', () => {
    const plotted = plotSeries({
      bounds: createPlotBounds(),
      series
    });
    const path = createStepPath(plotted.plottedSeries[0]!.points);

    expect(path).toContain(' H ');
    expect(path).toContain(' V ');
    expect(path).not.toContain('NaN');
  });

  it('rejects distant pointer hits and clamps tooltips', () => {
    const plotted = plotSeries({
      bounds: createPlotBounds(),
      series
    });
    expect(
      findNearestDatum({
        maximumDistance: 4,
        pointer: {
          x: 0,
          y: 0
        },
        series: plotted.plottedSeries
      })
    ).toBeNull();

    expect(
      positionTooltip({
        anchor: {
          x: 950,
          y: 310
        },
        bounds: createPlotBounds(),
        gap: 8,
        tooltip: {
          height: 60,
          width: 160
        }
      })
    ).toEqual({
      x: 752,
      y: 212
    });
  });
});
