import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatChartTimestamp, LineChart } from './line-chart';
import type { ChartSeries } from '@/lib/visualization/types';

const series: ChartSeries<{ score: number }>[] = [
  {
    id: 'fox',
    label: 'Foxden',
    points: [
      {
        id: 'first',
        label: 'First solve',
        metadata: {
          score: 100
        },
        x: Date.parse('2026-07-23T10:00:00Z'),
        y: 100
      },
      {
        id: 'second',
        label: 'Second solve',
        metadata: {
          score: 300
        },
        x: Date.parse('2026-07-23T11:00:00Z'),
        y: 300
      }
    ],
    tone: 0
  }
];

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    addEventListener: vi.fn(),
    matches: true,
    removeEventListener: vi.fn()
  }));
});

describe('LineChart', () => {
  it('formats timestamps identically without a runtime locale dependency', () => {
    expect(formatChartTimestamp(Date.parse('2026-07-23T10:00:00Z'))).toBe('23 Jul 2026, 10:00 UTC');
  });

  it('exposes chart semantics, keyboard exploration and a data disclosure', () => {
    const { container } = render(
      <LineChart
        description="Running score totals."
        eventStart={Date.parse('2026-07-23T10:00:00Z')}
        series={series}
        title="Score history"
      />
    );

    const chart = screen.getByRole('img', { name: 'Score history' });
    expect(chart).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chart data' })).toBeVisible();

    fireEvent.keyDown(chart, {
      key: 'ArrowRight'
    });
    expect(screen.getByText(/Foxden, 100/)).toBeVisible();
    expect(container.querySelector('foreignObject')).toHaveAttribute('height', '80');

    fireEvent.keyDown(chart, {
      key: 'End'
    });
    expect(screen.getByText(/Foxden, 300/)).toBeVisible();
  });
});
