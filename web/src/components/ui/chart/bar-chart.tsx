'use client';

import type { CSSProperties } from 'react';

import { EmptyState } from '../empty-state';

const barToneClasses = [
  'bg-chart-series-1',
  'bg-chart-series-2',
  'bg-chart-series-3',
  'bg-chart-series-4',
  'bg-chart-series-5',
  'bg-chart-series-6'
] as const;

interface BarStyle extends CSSProperties {
  '--chart-bar-width'?: string;
}

function toneClass(tone: number): (typeof barToneClasses)[number] {
  return barToneClasses[tone % barToneClasses.length] ?? barToneClasses[0];
}

export interface BarChartRow {
  id: string;
  label: string;
  secondary?: string;
  tone: number;
  value: number;
}

export interface BarChartProps {
  description: string;
  emptyDescription?: string;
  emptyTitle?: string;
  formatValue?: (value: number) => string;
  rows: readonly BarChartRow[];
  title: string;
}

export function BarChart({
  description,
  emptyDescription = 'Values will appear after the first recorded event.',
  emptyTitle = 'No chart data',
  formatValue = (value) => new Intl.NumberFormat().format(value),
  rows,
  title
}: BarChartProps) {
  const maximum = Math.max(0, ...rows.map((row) => row.value));

  if (rows.length === 0 || maximum === 0) {
    return <EmptyState description={emptyDescription} title={emptyTitle} />;
  }

  return (
    <figure aria-label={title} className="m-0 grid gap-4">
      <figcaption className="sr-only">{description}</figcaption>
      <ul className="m-0 grid list-none gap-3 p-0">
        {rows.map((row) => {
          const style: BarStyle = {
            '--chart-bar-width': `${(row.value / maximum) * 100}%`
          };

          return (
            <li className="grid gap-2" key={row.id}>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-text">{row.label}</span>
                <span className="flex items-center gap-3">
                  {row.secondary ? <span className="text-text-muted">{row.secondary}</span> : null}
                  <strong className="tabular-nums text-text">{formatValue(row.value)}</strong>
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-sm bg-surface-active">
                <div
                  className={`kitsune-chart-bar h-full rounded-sm ${toneClass(row.tone)}`}
                  style={style}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
