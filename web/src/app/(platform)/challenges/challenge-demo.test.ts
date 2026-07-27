import { describe, expect, it } from 'vitest';

import { createChallengeDemo, createChallengeDemoActions } from './challenge-demo';

describe('challenge demo', () => {
  it('includes one unclaimed challenge whose first solve earns first blood', async () => {
    const challenges = createChallengeDemo('demo-event');
    const unclaimed = challenges.find((challenge) => challenge.name === 'Unclaimed Route');

    expect(unclaimed).toMatchObject({
      solveCount: 0,
      solved: false
    });

    const actions = createChallengeDemoActions(challenges);
    const firstReceipt = await actions.submitAnswer(unclaimed!.id, 'kit{first}');
    const replayReceipt = await actions.submitAnswer(unclaimed!.id, 'kit{again}');

    expect(firstReceipt).toMatchObject({
      awarded_points: 450,
      first_blood: true,
      outcome: 'correct'
    });
    expect(replayReceipt.first_blood).toBe(false);
  });
});
