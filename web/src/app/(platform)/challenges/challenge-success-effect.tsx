'use client';

import { type CSSProperties, useId } from 'react';
import { createPortal } from 'react-dom';

import type { FirstBloodEdgeColor, FlagSubmitSuccessEffect } from './challenge-presentation';

export type ChallengeFeedbackOutcome = 'correct' | 'first-blood' | 'incorrect';

export interface ChallengeFeedbackEffectOrigin {
  height: number;
  left: number;
  outcome: ChallengeFeedbackOutcome;
  top: number;
  value: string;
  width: number;
}

interface FieldWaveStyle extends CSSProperties {
  '--solve-origin-height'?: string;
  '--solve-origin-left'?: string;
  '--solve-origin-top'?: string;
  '--solve-origin-width'?: string;
  '--solve-wave-diameter'?: string;
  '--solve-wave-start-scale'?: string;
  '--solve-wave-x'?: string;
  '--solve-wave-y'?: string;
}

interface ChallengeFeedbackEffectProps {
  effect: FlagSubmitSuccessEffect;
  firstBloodEdgeColor: FirstBloodEdgeColor;
  onComplete: () => void;
  origin: ChallengeFeedbackEffectOrigin;
}

function FieldWave({
  onComplete,
  origin
}: Pick<ChallengeFeedbackEffectProps, 'onComplete' | 'origin'>) {
  const x = origin.left + origin.width / 2;
  const y = origin.top + origin.height / 2;
  const farthestCorner = Math.max(
    Math.hypot(x, y),
    Math.hypot(window.innerWidth - x, y),
    Math.hypot(x, window.innerHeight - y),
    Math.hypot(window.innerWidth - x, window.innerHeight - y)
  );
  const diameter = Math.max(1, farthestCorner * 2);
  const style: FieldWaveStyle = {
    '--solve-origin-height': `${origin.height}px`,
    '--solve-origin-left': `${origin.left}px`,
    '--solve-origin-top': `${origin.top}px`,
    '--solve-origin-width': `${origin.width}px`,
    '--solve-wave-diameter': `${diameter}px`,
    '--solve-wave-start-scale': String(
      Math.max(1, Math.min(origin.width, origin.height)) / diameter
    ),
    '--solve-wave-x': `${x}px`,
    '--solve-wave-y': `${y}px`
  };

  return (
    <div
      aria-hidden
      className="kitsune-solve-effect pointer-events-none fixed inset-0 z-celebration"
      data-first-blood={origin.outcome === 'first-blood' || undefined}
      style={style}
    >
      <span className="kitsune-solve-origin absolute flex items-center overflow-hidden whitespace-nowrap rounded-md border px-3 font-mono text-base">
        <span className="kitsune-optical-center">{origin.value}</span>
      </span>
      <span
        className="kitsune-solve-wave absolute aspect-square rounded-full"
        onAnimationEnd={onComplete}
      />
    </div>
  );
}

interface EffectFrameProps extends Pick<
  ChallengeFeedbackEffectProps,
  'firstBloodEdgeColor' | 'onComplete'
> {
  outcome: ChallengeFeedbackOutcome;
}

function ViewportFrame({ firstBloodEdgeColor, onComplete, outcome }: EffectFrameProps) {
  const definitionId = useId().replaceAll(':', '');
  const maskId = `solve-edge-mask-${definitionId}`;
  const rainbowId = `solve-edge-rainbow-${definitionId}`;
  const edgeColor =
    outcome === 'incorrect'
      ? 'danger'
      : outcome === 'first-blood'
        ? firstBloodEdgeColor
        : undefined;
  const isRainbow = edgeColor === 'rainbow';

  return (
    <span
      className="kitsune-solve-edge-frame absolute inset-0"
      data-edge-color={edgeColor}
      onAnimationEnd={onComplete}
    >
      <svg className="kitsune-solve-edge-svg block size-full" focusable="false">
        <defs>
          <mask
            height="100%"
            id={maskId}
            maskUnits="userSpaceOnUse"
            mask-type="luminance"
            width="100%"
            x="0"
            y="0"
          >
            <rect className="kitsune-solve-mask-include" height="100%" width="100%" />
            <rect
              className="kitsune-solve-edge-cutout kitsune-solve-mask-exclude"
              height="100%"
              width="100%"
            />
          </mask>
          {isRainbow ? (
            <linearGradient id={rainbowId} x1="0" x2="1" y1="0" y2="1">
              <stop className="kitsune-solve-edge-rainbow-blue" offset="0%" />
              <stop className="kitsune-solve-edge-rainbow-violet" offset="25%" />
              <stop className="kitsune-solve-edge-rainbow-pink" offset="50%" />
              <stop className="kitsune-solve-edge-rainbow-orange" offset="75%" />
              <stop className="kitsune-solve-edge-rainbow-teal" offset="100%" />
            </linearGradient>
          ) : null}
        </defs>
        <rect
          className={isRainbow ? 'kitsune-solve-edge-rainbow-fill' : 'kitsune-solve-edge-fill'}
          fill={isRainbow ? `url(#${rainbowId})` : undefined}
          height="100%"
          mask={`url(#${maskId})`}
          width="100%"
        />
      </svg>
    </span>
  );
}

function EdgeBorder({ firstBloodEdgeColor, onComplete, outcome }: EffectFrameProps) {
  return (
    <div
      aria-hidden
      className="kitsune-solve-effect pointer-events-none fixed inset-0 z-celebration"
      data-first-blood={outcome === 'first-blood' || undefined}
      data-incorrect={outcome === 'incorrect' || undefined}
    >
      <span className="kitsune-solve-edge-wash-subtle absolute inset-0" />
      <ViewportFrame
        firstBloodEdgeColor={firstBloodEdgeColor}
        onComplete={onComplete}
        outcome={outcome}
      />
    </div>
  );
}

function ScreenImprint({ firstBloodEdgeColor, onComplete, outcome }: EffectFrameProps) {
  return (
    <div
      aria-hidden
      className="kitsune-solve-effect pointer-events-none fixed inset-0 z-celebration"
      data-first-blood={outcome === 'first-blood' || undefined}
    >
      <span className="kitsune-solve-edge-wash absolute inset-0" />
      <ViewportFrame
        firstBloodEdgeColor={firstBloodEdgeColor}
        onComplete={onComplete}
        outcome={outcome}
      />
    </div>
  );
}

export function ChallengeFeedbackEffect({
  effect,
  firstBloodEdgeColor,
  onComplete,
  origin
}: ChallengeFeedbackEffectProps) {
  if (effect === 'none' && origin.outcome !== 'incorrect') {
    return null;
  }

  let renderedEffect;
  const outcome = origin.outcome;

  if (effect === 'edge-border' || outcome === 'incorrect') {
    renderedEffect = (
      <EdgeBorder
        firstBloodEdgeColor={firstBloodEdgeColor}
        onComplete={onComplete}
        outcome={outcome}
      />
    );
  } else if (effect === 'screen-imprint') {
    renderedEffect = (
      <ScreenImprint
        firstBloodEdgeColor={firstBloodEdgeColor}
        onComplete={onComplete}
        outcome={outcome}
      />
    );
  } else {
    renderedEffect = <FieldWave onComplete={onComplete} origin={origin} />;
  }

  return createPortal(renderedEffect, document.body);
}
