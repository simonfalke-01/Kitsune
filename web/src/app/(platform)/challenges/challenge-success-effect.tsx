'use client';

import { type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

import type { FlagSubmitSuccessEffect } from './challenge-presentation';

export interface ChallengeSuccessEffectOrigin {
  height: number;
  isFirstBlood: boolean;
  left: number;
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

interface ChallengeSuccessEffectProps {
  effect: FlagSubmitSuccessEffect;
  onComplete: () => void;
  origin: ChallengeSuccessEffectOrigin;
}

function FieldWave({
  onComplete,
  origin
}: Pick<ChallengeSuccessEffectProps, 'onComplete' | 'origin'>) {
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
      data-first-blood={origin.isFirstBlood || undefined}
      style={style}
    >
      <span className="kitsune-solve-origin absolute flex items-center overflow-hidden whitespace-nowrap rounded-md border px-3 font-mono text-base">
        {origin.value}
      </span>
      <span
        className="kitsune-solve-wave absolute aspect-square rounded-full"
        onAnimationEnd={onComplete}
      />
    </div>
  );
}

interface EffectFrameProps extends Pick<ChallengeSuccessEffectProps, 'onComplete'> {
  isFirstBlood: boolean;
}

function EdgeBorder({ isFirstBlood, onComplete }: EffectFrameProps) {
  return (
    <div
      aria-hidden
      className="kitsune-solve-effect pointer-events-none fixed inset-0 z-celebration"
      data-first-blood={isFirstBlood || undefined}
    >
      <span
        className="kitsune-solve-edge-frame absolute inset-0 border-2"
        onAnimationEnd={onComplete}
      />
    </div>
  );
}

function ScreenImprint({ isFirstBlood, onComplete }: EffectFrameProps) {
  return (
    <div
      aria-hidden
      className="kitsune-solve-effect pointer-events-none fixed inset-0 z-celebration"
      data-first-blood={isFirstBlood || undefined}
    >
      <span className="kitsune-solve-edge-wash absolute inset-0" />
      <span
        className="kitsune-solve-edge-frame absolute inset-0 border-2"
        onAnimationEnd={onComplete}
      />
    </div>
  );
}

export function ChallengeSuccessEffect({
  effect,
  onComplete,
  origin
}: ChallengeSuccessEffectProps) {
  if (effect === 'none') {
    return null;
  }

  let renderedEffect;
  const isFirstBlood = origin.isFirstBlood;

  if (effect === 'edge-border') {
    renderedEffect = <EdgeBorder isFirstBlood={isFirstBlood} onComplete={onComplete} />;
  } else if (effect === 'screen-imprint') {
    renderedEffect = <ScreenImprint isFirstBlood={isFirstBlood} onComplete={onComplete} />;
  } else {
    renderedEffect = <FieldWave onComplete={onComplete} origin={origin} />;
  }

  return createPortal(renderedEffect, document.body);
}
