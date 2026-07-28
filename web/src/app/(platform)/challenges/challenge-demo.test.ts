import { describe, expect, it } from 'vitest';

import {
  createChallengeDemo,
  createChallengeDemoActions,
  createChallengeDemoPresence
} from './challenge-demo';

describe('challenge demo', () => {
  it('provides a dense multi-category board with stable unique identities', () => {
    const challenges = createChallengeDemo('demo-event');

    expect(challenges).toHaveLength(32);
    expect(new Set(challenges.map((challenge) => challenge.id)).size).toBe(32);
    expect(new Set(challenges.map((challenge) => challenge.category))).toEqual(
      new Set([
        'Welcome',
        'Web',
        'Pwn',
        'Reverse Engineering',
        'Crypto',
        'Forensics',
        'OSINT',
        'Hardware',
        'Miscellaneous'
      ])
    );
  });

  it('provides deterministic mock-only teammate presence', () => {
    const challenges = createChallengeDemo('demo-event');
    const challengeIds = new Set(challenges.map((challenge) => challenge.id));
    const presence = createChallengeDemoPresence();

    expect(presence).toHaveLength(3);
    expect(new Set(presence.map((member) => member.user_id)).size).toBe(3);
    expect(presence.every((member) => challengeIds.has(member.challenge_id))).toBe(true);
    expect(
      presence.filter((member) => member.challenge_id === 'demo-cache-rules-everything')
    ).toHaveLength(2);
  });

  it('keeps Cache Rules Everything in the incorrect state for failure-flow testing', async () => {
    const challenges = createChallengeDemo('demo-event');
    const challenge = challenges.find((candidate) => candidate.name === 'Cache Rules Everything');
    const actions = createChallengeDemoActions(challenges);

    const receipt = await actions.submitAnswer(challenge!.id, 'kit{test}');

    expect(receipt).toMatchObject({
      attempts_remaining: 4,
      awarded_points: 0,
      first_blood: false,
      outcome: 'incorrect'
    });
  });

  it('exposes the authored-content and download states in the mock challenge', () => {
    const challenges = createChallengeDemo('demo-event');
    const challenge = challenges.find((candidate) => candidate.name === 'Cache Rules Everything');

    expect(challenge?.description).toContain('# Objective');
    expect(challenge?.description).toContain('| Request | Cache result |');
    expect(challenge?.description).toContain('```http');
    expect(challenge?.attachments).toEqual([
      {
        id: 'demo-cache-capture',
        label: 'Captured response',
        size: '290 B',
        url: '/demo/cache-rules-everything.txt'
      }
    ]);
  });

  it('includes one unclaimed challenge whose first solve earns first blood', async () => {
    const challenges = createChallengeDemo('demo-event');
    const unclaimed = challenges.find((challenge) => challenge.name === 'Unclaimed Route');

    expect(unclaimed).toMatchObject({
      authorName: 'simonfalke',
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
