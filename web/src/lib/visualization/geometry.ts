import type {
  ChartDatum,
  ChartScale,
  ChartSeries,
  ChartTick,
  PlotBounds,
  PlottedDatum,
  TooltipPosition
} from './types';

export const chartViewHeight = 320;
export const chartViewWidth = 960;
export const chartInset = 48;

export function createPlotBounds(width = chartViewWidth, height = chartViewHeight): PlotBounds {
  return {
    bottom: height - chartInset,
    height: height - chartInset * 2,
    left: chartInset,
    right: width - chartInset,
    top: chartInset,
    width: width - chartInset * 2
  };
}

export function extentDomain(
  values: readonly number[],
  options: {
    includeZero?: boolean;
  } = {}
): readonly [number, number] {
  const finite = values.filter(Number.isFinite);
  const includeZero = options.includeZero ?? false;

  if (finite.length === 0) {
    return [0, 1];
  }

  let minimum = Math.min(...finite);
  let maximum = Math.max(...finite);

  if (includeZero) {
    minimum = Math.min(0, minimum);
    maximum = Math.max(0, maximum);
  }

  if (minimum === maximum) {
    const padding = Math.max(1, Math.abs(minimum) * 0.1);
    return [minimum - padding, maximum + padding];
  }

  return [minimum, maximum];
}

export function createLinearScale(input: {
  clamp?: boolean;
  domain: readonly [number, number];
  range: readonly [number, number];
}): ChartScale {
  const [domainStart, domainEnd] = input.domain;
  const [rangeStart, rangeEnd] = input.range;
  const domainSpan = domainEnd - domainStart;
  const rangeSpan = rangeEnd - rangeStart;

  function normalized(value: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(domainSpan) || domainSpan === 0) {
      return 0;
    }

    const ratio = (value - domainStart) / domainSpan;
    return input.clamp ? Math.min(1, Math.max(0, ratio)) : ratio;
  }

  return {
    domain: input.domain,
    invert(pixel) {
      if (!Number.isFinite(pixel) || rangeSpan === 0) {
        return domainStart;
      }

      const ratio = (pixel - rangeStart) / rangeSpan;
      const resolved = input.clamp ? Math.min(1, Math.max(0, ratio)) : ratio;
      return domainStart + resolved * domainSpan;
    },
    map(value) {
      return rangeStart + normalized(value) * rangeSpan;
    },
    range: input.range
  };
}

function niceStep(span: number, targetCount: number): number {
  const rough = Math.abs(span) / Math.max(1, targetCount);

  if (!Number.isFinite(rough) || rough === 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(rough));
  const magnitude = 10 ** exponent;
  const normalized = rough / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

export function createNumericTicks(
  domain: readonly [number, number],
  targetCount: number
): ChartTick[] {
  const [minimum, maximum] = domain;
  const step = niceStep(maximum - minimum, targetCount);
  const start = Math.floor(minimum / step) * step;
  const end = Math.ceil(maximum / step) * step;
  const formatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0
  });
  const ticks: ChartTick[] = [];

  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push({
      label: formatter.format(Object.is(value, -0) ? 0 : value),
      value
    });
  }

  return ticks;
}

export function createRelativeTimeTicks(input: {
  domain: readonly [number, number];
  eventStart: number;
  targetCount: number;
}): ChartTick[] {
  const [start, end] = input.domain;
  const count = Math.max(2, input.targetCount);
  const step = (end - start) / (count - 1);

  return Array.from({ length: count }, (_, index) => {
    const value = index === count - 1 ? end : start + step * index;
    const elapsedMinutes = Math.round((value - input.eventStart) / 60_000);
    const sign = elapsedMinutes < 0 ? '-' : '+';
    const absoluteMinutes = Math.abs(elapsedMinutes);
    const days = Math.floor(absoluteMinutes / 1_440);
    const hours = Math.floor((absoluteMinutes % 1_440) / 60);
    const minutes = absoluteMinutes % 60;
    const label =
      days > 0
        ? `T${sign}${days}d ${hours}h`
        : hours > 0
          ? `T${sign}${hours}h`
          : `T${sign}${minutes}m`;

    return {
      label,
      value
    };
  });
}

function pointCommand(point: { pixelX: number; pixelY: number }): string {
  return `${point.pixelX.toFixed(2)} ${point.pixelY.toFixed(2)}`;
}

export function createMonotonePath<Metadata>(points: readonly PlottedDatum<Metadata>[]): string {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${pointCommand(points[0]!)}`;
  }

  if (points.length === 2) {
    return `M ${pointCommand(points[0]!)} L ${pointCommand(points[1]!)}`;
  }

  const slopes = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]!;
    const deltaX = next.pixelX - point.pixelX;
    return deltaX === 0 ? 0 : (next.pixelY - point.pixelY) / deltaX;
  });
  const tangents = points.map((_, index) => {
    if (index === 0) {
      return slopes[0] ?? 0;
    }

    if (index === points.length - 1) {
      return slopes.at(-1) ?? 0;
    }

    const previous = slopes[index - 1] ?? 0;
    const next = slopes[index] ?? 0;

    if (previous === 0 || next === 0 || Math.sign(previous) !== Math.sign(next)) {
      return 0;
    }

    return (previous + next) / 2;
  });

  return points.slice(1).reduce(
    (path, point, index) => {
      const previous = points[index]!;
      const deltaX = point.pixelX - previous.pixelX;
      const control = deltaX / 3;
      const firstControlX = previous.pixelX + control;
      const firstControlY = previous.pixelY + tangents[index]! * control;
      const secondControlX = point.pixelX - control;
      const secondControlY = point.pixelY - tangents[index + 1]! * control;

      return `${path} C ${firstControlX.toFixed(2)} ${firstControlY.toFixed(2)}, ${secondControlX.toFixed(2)} ${secondControlY.toFixed(2)}, ${pointCommand(point)}`;
    },
    `M ${pointCommand(points[0]!)}`
  );
}

export function createStepPath<Metadata>(points: readonly PlottedDatum<Metadata>[]): string {
  if (points.length === 0) {
    return '';
  }

  return points.slice(1).reduce(
    (path, point) => {
      return `${path} H ${point.pixelX.toFixed(2)} V ${point.pixelY.toFixed(2)}`;
    },
    `M ${pointCommand(points[0]!)}`
  );
}

export function plotSeries<Metadata>(input: {
  bounds: PlotBounds;
  series: readonly ChartSeries<Metadata>[];
  xDomain?: readonly [number, number];
  yDomain?: readonly [number, number];
}): {
  plottedSeries: Array<ChartSeries<Metadata> & { points: PlottedDatum<Metadata>[] }>;
  xScale: ChartScale;
  yScale: ChartScale;
} {
  const xDomain =
    input.xDomain ??
    extentDomain(input.series.flatMap((series) => series.points.map((point) => point.x)));
  const yDomain =
    input.yDomain ??
    extentDomain(
      input.series.flatMap((series) => series.points.map((point) => point.y)),
      {
        includeZero: true
      }
    );
  const xScale = createLinearScale({
    domain: xDomain,
    range: [input.bounds.left, input.bounds.right]
  });
  const yScale = createLinearScale({
    domain: yDomain,
    range: [input.bounds.bottom, input.bounds.top]
  });

  return {
    plottedSeries: input.series.map((series) => ({
      ...series,
      points: series.points.map((point) => ({
        ...point,
        pixelX: xScale.map(point.x),
        pixelY: yScale.map(point.y),
        seriesId: series.id,
        seriesLabel: series.label,
        seriesTone: series.tone
      }))
    })),
    xScale,
    yScale
  };
}

export function findNearestDatum<Metadata>(input: {
  maximumDistance: number;
  pointer: {
    x: number;
    y: number;
  };
  series: ReadonlyArray<{ points: readonly PlottedDatum<Metadata>[] }>;
}): PlottedDatum<Metadata> | null {
  let nearest: PlottedDatum<Metadata> | null = null;
  let nearestDistance = input.maximumDistance ** 2;

  for (const series of input.series) {
    for (const point of series.points) {
      const deltaX = point.pixelX - input.pointer.x;
      const deltaY = point.pixelY - input.pointer.y;
      const distance = deltaX * deltaX + deltaY * deltaY;

      if (distance <= nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }
  }

  return nearest;
}

export function positionTooltip(input: {
  anchor: {
    x: number;
    y: number;
  };
  bounds: PlotBounds;
  gap: number;
  tooltip: {
    height: number;
    width: number;
  };
}): TooltipPosition {
  const placeRight = input.anchor.x < input.bounds.left + input.bounds.width / 2;
  const requestedX = placeRight
    ? input.anchor.x + input.gap
    : input.anchor.x - input.tooltip.width - input.gap;
  const requestedY = input.anchor.y - input.tooltip.height / 2;

  return {
    x: Math.min(input.bounds.right - input.tooltip.width, Math.max(input.bounds.left, requestedX)),
    y: Math.min(input.bounds.bottom - input.tooltip.height, Math.max(input.bounds.top, requestedY))
  };
}

export function chronologicalData<Metadata>(
  series: readonly ChartSeries<Metadata>[]
): ChartDatum<Metadata>[] {
  return series
    .flatMap((entry) => entry.points)
    .sort((left, right) => left.x - right.x || left.id.localeCompare(right.id));
}
