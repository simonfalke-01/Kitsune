'use client';

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useId,
  useMemo,
  useState,
  useSyncExternalStore
} from 'react';

import { Disclosure } from '../disclosure';
import { EmptyState } from '../empty-state';
import {
  chartViewHeight,
  chartViewWidth,
  createMonotonePath,
  createNumericTicks,
  createPlotBounds,
  createRelativeTimeTicks,
  createStepPath,
  extentDomain,
  findNearestDatum,
  plotSeries,
  positionTooltip
} from '@/lib/visualization/geometry';
import type { ChartSeries, ChartTick, PlottedDatum } from '@/lib/visualization/types';

const lineChartAppearances = {
  bare: 'relative overflow-hidden',
  framed: 'relative overflow-hidden rounded-lg border border-border-subtle bg-surface-raised'
} as const;

const lineToneClasses = [
  'stroke-chart-series-1',
  'stroke-chart-series-2',
  'stroke-chart-series-3',
  'stroke-chart-series-4',
  'stroke-chart-series-5',
  'stroke-chart-series-6'
] as const;

const lineDashPatterns = {
  dashed: '10 6',
  dotted: '2 6',
  solid: undefined
} as const;

function toneClass(tone: number): (typeof lineToneClasses)[number] {
  return lineToneClasses[tone % lineToneClasses.length] ?? lineToneClasses[0];
}

const chartMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const;
const chartNumberFormatter = new Intl.NumberFormat('en-US');

export function formatChartTimestamp(value: number): string {
  const timestamp = new Date(value);

  if (!Number.isFinite(timestamp.getTime())) {
    return 'Unavailable';
  }

  const day = String(timestamp.getUTCDate()).padStart(2, '0');
  const month = chartMonths[timestamp.getUTCMonth()] ?? 'Jan';
  const year = timestamp.getUTCFullYear();
  const hour = String(timestamp.getUTCHours()).padStart(2, '0');
  const minute = String(timestamp.getUTCMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hour}:${minute} UTC`;
}

function subscribeToWideViewport(change: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => undefined;
  }

  const query = window.matchMedia('(min-width: 40rem)');
  query.addEventListener('change', change);

  return () => {
    query.removeEventListener('change', change);
  };
}

function getIsWideViewport(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 40rem)').matches
    : true;
}

export interface LineChartProps<Metadata> {
  activeSeriesId?: string | null;
  appearance?: keyof typeof lineChartAppearances;
  description: string;
  emptyDescription?: string;
  emptyTitle?: string;
  eventStart?: number;
  formatTooltip?: (point: PlottedDatum<Metadata>) => ReactNode;
  formatXValue?: (value: number) => string;
  formatYValue?: (value: number) => string;
  height?: 'compact' | 'standard';
  interpolation?: 'monotone' | 'step';
  onActiveSeriesChange?: (seriesId: string | null) => void;
  series: readonly ChartSeries<Metadata>[];
  showDataTable?: boolean;
  showLegend?: boolean;
  title: string;
  xDomain?: readonly [number, number];
  yDomain?: readonly [number, number];
}

export function LineChart<Metadata>({
  activeSeriesId,
  appearance = 'framed',
  description,
  emptyDescription = 'Data will appear after the first recorded event.',
  emptyTitle = 'No chart data',
  eventStart,
  formatTooltip,
  formatXValue = formatChartTimestamp,
  formatYValue = (value) => chartNumberFormatter.format(value),
  height = 'standard',
  interpolation = 'monotone',
  onActiveSeriesChange,
  series,
  showDataTable = true,
  showLegend = true,
  title,
  xDomain,
  yDomain
}: LineChartProps<Metadata>) {
  const titleId = useId();
  const descriptionId = useId();
  const announcementId = useId();
  const isWide = useSyncExternalStore(subscribeToWideViewport, getIsWideViewport, () => true);
  const bounds = useMemo(() => createPlotBounds(), []);
  const resolvedYDomain = useMemo(() => {
    if (yDomain) {
      return yDomain;
    }

    const raw = extentDomain(
      series.flatMap((entry) => entry.points.map((point) => point.y)),
      {
        includeZero: true
      }
    );
    const ticks = createNumericTicks(raw, isWide ? 5 : 3);
    return [ticks[0]?.value ?? raw[0], ticks.at(-1)?.value ?? raw[1]] as const;
  }, [isWide, series, yDomain]);
  const model = useMemo(
    () =>
      plotSeries({
        bounds,
        series,
        xDomain,
        yDomain: resolvedYDomain
      }),
    [bounds, resolvedYDomain, series, xDomain]
  );
  const allPoints = useMemo(
    () =>
      model.plottedSeries
        .flatMap((entry) => entry.points)
        .sort((left, right) => left.x - right.x || left.id.localeCompare(right.id)),
    [model.plottedSeries]
  );
  const [isLocked, setIsLocked] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedPoint =
    model.plottedSeries
      .flatMap((entry) => entry.points)
      .find((point) => `${point.seriesId}:${point.id}` === selectedId) ?? null;
  const yTicks = createNumericTicks(model.yScale.domain, isWide ? 5 : 3);
  const xTicks: ChartTick[] =
    eventStart === undefined
      ? []
      : createRelativeTimeTicks({
          domain: model.xScale.domain,
          eventStart,
          targetCount: isWide ? 7 : 4
        });
  const tooltipPosition = selectedPoint
    ? positionTooltip({
        anchor: {
          x: selectedPoint.pixelX,
          y: selectedPoint.pixelY
        },
        bounds,
        gap: 12,
        tooltip: {
          height: 76,
          width: 224
        }
      })
    : null;

  if (series.length === 0 || series.every((entry) => entry.points.length === 0)) {
    return <EmptyState description={emptyDescription} title={emptyTitle} />;
  }

  function selectPoint(point: PlottedDatum<Metadata> | null) {
    setSelectedId(point ? `${point.seriesId}:${point.id}` : null);
    onActiveSeriesChange?.(point?.seriesId ?? null);
  }

  function pointerPosition(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * chartViewWidth,
      y: ((event.clientY - rect.top) / rect.height) * chartViewHeight
    };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (isLocked) {
      return;
    }

    selectPoint(
      findNearestDatum({
        maximumDistance: 48,
        pointer: pointerPosition(event),
        series: model.plottedSeries
      })
    );
  }

  function handleKeyboard(event: KeyboardEvent<SVGSVGElement>) {
    if (allPoints.length === 0) {
      return;
    }

    const currentIndex = selectedPoint
      ? allPoints.findIndex(
          (point) => point.id === selectedPoint.id && point.seriesId === selectedPoint.seriesId
        )
      : -1;
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') {
      nextIndex = Math.min(allPoints.length - 1, currentIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      nextIndex = Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = allPoints.length - 1;
    } else if (event.key === 'Escape') {
      setIsLocked(false);
      selectPoint(null);
      return;
    } else if (event.key === 'Enter' || event.key === ' ') {
      setIsLocked((current) => !current);
      return;
    } else {
      return;
    }

    event.preventDefault();
    selectPoint(allPoints[nextIndex] ?? null);
  }

  return (
    <div className="grid gap-4">
      <div className={lineChartAppearances[appearance]}>
        {/* React Aria has no chart primitive; this single focus target provides chart-specific keyboard exploration. */}
        <svg
          aria-describedby={`${descriptionId} ${announcementId}`}
          aria-labelledby={titleId}
          className={`block w-full outline-none focus-visible:outline-2 focus-visible:outline-focus-ring ${
            height === 'compact' ? 'h-chart-compact' : 'h-chart'
          }`}
          onBlur={() => {
            if (!isLocked) {
              selectPoint(null);
            }
          }}
          onClick={() => {
            if (selectedPoint) {
              setIsLocked((current) => !current);
            }
          }}
          onKeyDown={handleKeyboard}
          onPointerLeave={() => {
            if (!isLocked) {
              selectPoint(null);
            }
          }}
          onPointerMove={handlePointerMove}
          preserveAspectRatio="none"
          role="img"
          tabIndex={0}
          viewBox={`0 0 ${chartViewWidth} ${chartViewHeight}`}
        >
          <title id={titleId}>{title}</title>
          <desc id={descriptionId}>{description}</desc>
          {yTicks.map((tick) => {
            const y = model.yScale.map(tick.value);
            return (
              <g key={tick.value}>
                <line
                  className="stroke-chart-grid"
                  vectorEffect="non-scaling-stroke"
                  x1={bounds.left}
                  x2={bounds.right}
                  y1={y}
                  y2={y}
                />
                <text className="fill-chart-label text-xs" x={bounds.left} y={y - 8}>
                  {formatYValue(tick.value)}
                </text>
              </g>
            );
          })}
          {xTicks.map((tick) => {
            const x = model.xScale.map(tick.value);
            return (
              <text
                className="fill-chart-label text-xs"
                key={tick.value}
                textAnchor="middle"
                x={x}
                y={bounds.bottom + 24}
              >
                {tick.label}
              </text>
            );
          })}
          {model.plottedSeries.map((entry) => {
            const isActive = activeSeriesId === entry.id || selectedPoint?.seriesId === entry.id;
            const isMuted = Boolean(activeSeriesId || selectedPoint) && !isActive;

            return (
              <path
                className={`${toneClass(entry.tone)} fill-none transition-opacity duration-fast ease-out-quart`}
                d={
                  interpolation === 'step'
                    ? createStepPath(entry.points)
                    : createMonotonePath(entry.points)
                }
                key={entry.id}
                opacity={isMuted ? 0.25 : 1}
                strokeDasharray={lineDashPatterns[entry.lineStyle ?? 'solid']}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={entry.isEmphasized ? 4 : 2.5}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {selectedPoint ? (
            <>
              <line
                className="stroke-chart-crosshair"
                vectorEffect="non-scaling-stroke"
                x1={selectedPoint.pixelX}
                x2={selectedPoint.pixelX}
                y1={bounds.top}
                y2={bounds.bottom}
              />
              <circle
                className={`${toneClass(selectedPoint.seriesTone)} fill-surface-raised`}
                cx={selectedPoint.pixelX}
                cy={selectedPoint.pixelY}
                r={5}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            </>
          ) : null}
          {selectedPoint && tooltipPosition ? (
            <foreignObject height={76} width={224} x={tooltipPosition.x} y={tooltipPosition.y}>
              <div className="grid h-full content-center gap-1 rounded-md border border-chart-tooltip-border bg-chart-tooltip px-3 py-2 text-sm text-text shadow-md">
                {formatTooltip ? (
                  formatTooltip(selectedPoint)
                ) : (
                  <>
                    <strong className="truncate">{selectedPoint.seriesLabel}</strong>
                    <span className="tabular-nums">{formatYValue(selectedPoint.y)}</span>
                    <span className="text-xs text-text-muted">{formatXValue(selectedPoint.x)}</span>
                  </>
                )}
              </div>
            </foreignObject>
          ) : null}
        </svg>
        <span aria-live="polite" className="sr-only" id={announcementId}>
          {selectedPoint
            ? `${selectedPoint.seriesLabel}, ${formatYValue(selectedPoint.y)}, ${formatXValue(selectedPoint.x)}`
            : 'Use the arrow keys to explore chart points.'}
        </span>
      </div>
      {showLegend ? (
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {model.plottedSeries.map((entry) => (
            <li
              className="flex min-w-0 items-center gap-3 text-sm"
              key={entry.id}
              onPointerEnter={() => {
                onActiveSeriesChange?.(entry.id);
              }}
              onPointerLeave={() => {
                onActiveSeriesChange?.(null);
              }}
            >
              <svg aria-hidden className="h-2 w-6 shrink-0" viewBox="0 0 24 8">
                <line
                  className={toneClass(entry.tone)}
                  strokeDasharray={lineDashPatterns[entry.lineStyle ?? 'solid']}
                  strokeLinecap="round"
                  strokeWidth={3}
                  x1={1}
                  x2={23}
                  y1={4}
                  y2={4}
                />
              </svg>
              <span
                className={`min-w-0 flex-1 truncate ${
                  entry.isEmphasized ? 'font-semibold text-text' : 'text-text-muted'
                }`}
              >
                {entry.label}
              </span>
              <span className="shrink-0 tabular-nums text-text-muted">
                {formatYValue(entry.points.at(-1)?.y ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {showDataTable ? (
        <Disclosure density="compact" id={`${titleId}-data`} title="Chart data">
          <ol className="m-0 grid list-none gap-2 p-0">
            {allPoints.map((point) => (
              <li
                className="flex flex-wrap justify-between gap-4 text-sm"
                key={`${point.seriesId}-${point.id}`}
              >
                <span>{point.seriesLabel}</span>
                <span className="flex flex-wrap justify-end gap-x-3 tabular-nums text-text-muted">
                  <span>{formatYValue(point.y)}</span>
                  <span>{formatXValue(point.x)}</span>
                </span>
              </li>
            ))}
          </ol>
        </Disclosure>
      ) : null}
    </div>
  );
}
