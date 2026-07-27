import { createMonotonePath, createStepPath, plotSeries } from '@/lib/visualization/geometry';
import type { ChartSeries } from '@/lib/visualization/types';

const sparklineToneClasses = [
  'stroke-chart-series-1',
  'stroke-chart-series-2',
  'stroke-chart-series-3',
  'stroke-chart-series-4',
  'stroke-chart-series-5',
  'stroke-chart-series-6'
] as const;

function toneClass(tone: number): (typeof sparklineToneClasses)[number] {
  return sparklineToneClasses[tone % sparklineToneClasses.length] ?? sparklineToneClasses[0];
}

export interface SparklineProps<Metadata> {
  interpolation?: 'monotone' | 'step';
  series: ChartSeries<Metadata>;
}

export function Sparkline<Metadata>({
  interpolation = 'monotone',
  series
}: SparklineProps<Metadata>) {
  if (series.points.length < 2) {
    return <span aria-hidden className="block h-sparkline w-24 rounded-sm bg-surface-active" />;
  }

  const width = 96;
  const height = 40;
  const bounds = {
    bottom: 36,
    height: 32,
    left: 0,
    right: width,
    top: 4,
    width
  };
  const plotted = plotSeries({
    bounds,
    series: [series]
  }).plottedSeries[0];

  if (!plotted) {
    return null;
  }

  return (
    <svg aria-hidden className="h-sparkline w-24" viewBox={`0 0 ${width} ${height}`}>
      <path
        className={`${toneClass(series.tone)} fill-none`}
        d={
          interpolation === 'step'
            ? createStepPath(plotted.points)
            : createMonotonePath(plotted.points)
        }
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
