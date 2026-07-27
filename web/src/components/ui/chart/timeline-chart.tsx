import { EmptyState } from '../empty-state';
import { createLinearScale, createRelativeTimeTicks } from '@/lib/visualization/geometry';

const pointToneClasses = [
  'fill-chart-series-1',
  'fill-chart-series-2',
  'fill-chart-series-3',
  'fill-chart-series-4',
  'fill-chart-series-5',
  'fill-chart-series-6'
] as const;

function toneClass(tone: number): (typeof pointToneClasses)[number] {
  return pointToneClasses[tone % pointToneClasses.length] ?? pointToneClasses[0];
}

export interface TimelineChartPoint {
  detail: string;
  id: string;
  label: string;
  timestamp: number;
}

export interface TimelineChartLane {
  id: string;
  label: string;
  points: readonly TimelineChartPoint[];
  tone: number;
}

export interface TimelineChartProps {
  description: string;
  end: number;
  lanes: readonly TimelineChartLane[];
  start: number;
  title: string;
}

export function TimelineChart({ description, end, lanes, start, title }: TimelineChartProps) {
  const points = lanes.flatMap((lane) => lane.points);

  if (points.length === 0) {
    return (
      <EmptyState
        description="Timeline markers will appear after the first recorded solve."
        title="No solve timeline"
      />
    );
  }

  const width = 960;
  const laneHeight = 44;
  const top = 32;
  const bottom = 32;
  const labelWidth = 128;
  const right = 24;
  const height = top + lanes.length * laneHeight + bottom;
  const scale = createLinearScale({
    domain: [start, Math.max(start + 1, end)],
    range: [labelWidth, width - right]
  });
  const ticks = createRelativeTimeTicks({
    domain: [start, Math.max(start + 1, end)],
    eventStart: start,
    targetCount: 6
  });

  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised">
        <svg
          aria-label={description}
          className="block min-w-prose w-full"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <title>{title}</title>
          {ticks.map((tick) => {
            const x = scale.map(tick.value);
            return (
              <g key={tick.value}>
                <line
                  className="stroke-chart-grid"
                  vectorEffect="non-scaling-stroke"
                  x1={x}
                  x2={x}
                  y1={top}
                  y2={height - bottom}
                />
                <text className="fill-chart-label text-xs" textAnchor="middle" x={x} y={height - 8}>
                  {tick.label}
                </text>
              </g>
            );
          })}
          {lanes.map((lane, index) => {
            const y = top + index * laneHeight + laneHeight / 2;

            return (
              <g key={lane.id}>
                <text className="fill-text text-sm" x={16} y={y + 4}>
                  {lane.label}
                </text>
                <line
                  className="stroke-chart-axis"
                  vectorEffect="non-scaling-stroke"
                  x1={labelWidth}
                  x2={width - right}
                  y1={y}
                  y2={y}
                />
                {lane.points.map((point) => (
                  <circle
                    aria-label={`${point.label}. ${point.detail}`}
                    className={`${toneClass(lane.tone)} stroke-surface-raised`}
                    cx={scale.map(point.timestamp)}
                    cy={y}
                    key={point.id}
                    r={6}
                    role="img"
                    strokeWidth={3}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <ol className="sr-only">
        {lanes.flatMap((lane) =>
          lane.points.map((point) => (
            <li key={`${lane.id}-${point.id}`}>
              {lane.label}: {point.label}. {point.detail}
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
