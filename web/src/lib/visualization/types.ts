export interface ChartDatum<Metadata = unknown> {
  id: string;
  label: string;
  metadata: Metadata;
  x: number;
  y: number;
}

export type ChartLineStyle = 'solid' | 'dashed' | 'dotted';

export interface ChartSeries<Metadata = unknown> {
  id: string;
  isEmphasized?: boolean;
  label: string;
  lineStyle?: ChartLineStyle;
  points: ChartDatum<Metadata>[];
  tone: number;
}

export interface ChartScale {
  domain: readonly [number, number];
  invert: (pixel: number) => number;
  map: (value: number) => number;
  range: readonly [number, number];
}

export interface ChartTick {
  label: string;
  value: number;
}

export interface PlotBounds {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface PlottedDatum<Metadata = unknown> extends ChartDatum<Metadata> {
  pixelX: number;
  pixelY: number;
  seriesId: string;
  seriesLabel: string;
  seriesTone: number;
}

export interface TooltipPosition {
  x: number;
  y: number;
}
