import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChallengeFeedbackEffect,
  type ChallengeFeedbackEffectOrigin,
  type ChallengeFeedbackOutcome
} from './challenge-success-effect';
import type { FirstBloodEdgeColor, FlagSubmitSuccessEffect } from './challenge-presentation';

const origin: ChallengeFeedbackEffectOrigin = {
  height: 44,
  left: 120,
  outcome: 'correct',
  top: 600,
  value: 'kit{correct}',
  width: 400
};

function renderEffect(
  effect: FlagSubmitSuccessEffect,
  outcome: ChallengeFeedbackOutcome = 'correct',
  firstBloodEdgeColor: FirstBloodEdgeColor = 'rainbow',
  onComplete = vi.fn()
) {
  render(
    <ChallengeFeedbackEffect
      effect={effect}
      firstBloodEdgeColor={firstBloodEdgeColor}
      onComplete={onComplete}
      origin={{ ...origin, outcome }}
    />
  );

  return onComplete;
}

describe('ChallengeFeedbackEffect', () => {
  it.each([
    ['edge-border', '.kitsune-solve-edge-frame'],
    ['screen-imprint', '.kitsune-solve-edge-wash'],
    ['field-wave', '.kitsune-solve-wave']
  ] as const)('renders the configured %s effect', (effect, expectedPart) => {
    renderEffect(effect);

    expect(document.querySelector('.kitsune-solve-effect')).toBeInTheDocument();
    expect(document.querySelector(expectedPart)).toBeInTheDocument();
  });

  it('allows correct feedback to be disabled without suppressing incorrect feedback', () => {
    const { rerender } = render(
      <ChallengeFeedbackEffect
        effect="none"
        firstBloodEdgeColor="rainbow"
        onComplete={vi.fn()}
        origin={origin}
      />
    );
    expect(document.querySelector('.kitsune-solve-effect')).not.toBeInTheDocument();

    rerender(
      <ChallengeFeedbackEffect
        effect="none"
        firstBloodEdgeColor="rainbow"
        onComplete={vi.fn()}
        origin={{ ...origin, outcome: 'incorrect' }}
      />
    );
    expect(document.querySelector('.kitsune-solve-effect')).toHaveAttribute(
      'data-incorrect',
      'true'
    );
    expect(document.querySelector('.kitsune-solve-edge-frame')).toHaveAttribute(
      'data-edge-color',
      'danger'
    );
  });

  it('keeps first-blood edge color independent from the selected effect', () => {
    renderEffect('edge-border', 'first-blood', 'achievement');

    expect(document.querySelector('.kitsune-solve-effect')).toHaveAttribute(
      'data-first-blood',
      'true'
    );
    expect(document.querySelector('.kitsune-solve-edge-frame')).toHaveAttribute(
      'data-edge-color',
      'achievement'
    );
  });

  it('anchors field-wave geometry to the answer control', () => {
    renderEffect('field-wave');
    const effect = document.querySelector('.kitsune-solve-effect');

    expect(effect).toHaveStyle({
      '--solve-origin-height': '44px',
      '--solve-origin-left': '120px',
      '--solve-origin-top': '600px',
      '--solve-origin-width': '400px'
    });
    expect(document.querySelector('.kitsune-solve-origin')).toHaveTextContent('kit{correct}');
  });
});
