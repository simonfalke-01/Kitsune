import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createChallengeDemo } from './challenge-demo';
import { ChallengeOverview } from './challenge-overview';
import {
  createChallengeEventStandingStub,
  createChallengeSolveContextMap
} from './challenge-solve-stub';
import type { ChallengeExperience } from '@/lib/challenges';

const currentCompetitor = { id: 'foxden', name: 'Foxden' };

function renderOverview(challenges: ChallengeExperience[]) {
  render(
    <ChallengeOverview
      challenges={challenges}
      getChallengeHref={(challengeId) => `/challenges?challenge=${challengeId}`}
      solveContexts={createChallengeSolveContextMap({
        challenges,
        currentCompetitor
      })}
      standing={createChallengeEventStandingStub({
        challenges,
        currentCompetitor,
        eventId: 'event'
      })}
    />
  );
}

describe('ChallengeOverview', () => {
  it('preserves the team-performance composition for a future team route', () => {
    const challenges = createChallengeDemo('event');
    renderOverview(challenges);

    expect(screen.getByRole('heading', { name: 'Your run' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Around your rank' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Challenge field' })).toBeVisible();
    expect(screen.getByRole('list', { name: '0 of 6 Web challenges solved' })).toHaveStyle({
      '--segment-bar-width': '100%'
    });
    const pwnProgress = screen.getByRole('list', { name: '0 of 4 Pwn challenges solved' });
    expect(
      Number.parseFloat(pwnProgress.style.getPropertyValue('--segment-bar-width'))
    ).toBeCloseTo(94.12);
  });

  it('keeps canonical overall order and packs solved category segments first', () => {
    const challenges = createChallengeDemo('event')
      .filter((challenge) => challenge.category === 'Web')
      .slice(0, 2)
      .map((challenge, index) => ({
        ...challenge,
        position: index,
        solved: index === 1
      }));
    renderOverview(challenges);

    const overallProgress = screen.getByLabelText('1 of 2 challenges solved');
    const categoryProgress = screen.getByLabelText('1 of 2 Web challenges solved');
    const overallSegments = within(overallProgress).getAllByRole('link');
    const categorySegments = within(categoryProgress).getAllByRole('link');

    expect(overallSegments[0]).toHaveAccessibleName(/Open Cache Rules Everything/);
    expect(overallSegments[1]).toHaveAccessibleName(/Open Origin Story/);
    expect(categorySegments[0]).toHaveAccessibleName(/Open Origin Story/);
    expect(categorySegments[1]).toHaveAccessibleName(/Open Cache Rules Everything/);
  });
});
