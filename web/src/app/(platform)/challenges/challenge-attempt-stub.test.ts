import { describe, expect, it } from 'vitest';

import {
  appendChallengeAttempt,
  createChallengeAttemptHistoryStub
} from './challenge-attempt-stub';
import { createChallengeDemo } from './challenge-demo';

describe('challenge attempt stub', () => {
  it('seeds demo attempts only for an explicitly known demo challenge', () => {
    const history = createChallengeAttemptHistoryStub(createChallengeDemo('demo-event'));
    const attempts = history.get('demo-cache-rules-everything');

    expect(attempts).toHaveLength(2);
    expect(attempts?.[0]).toMatchObject({
      actor: { name: 'simonfalke' },
      outcome: 'incorrect'
    });
    expect(createChallengeAttemptHistoryStub([]).size).toBe(0);
  });

  it('prepends new attempts and ignores replayed receipt identities', () => {
    const attempt = {
      actor: { id: 'kitsune', name: 'Kitsune Labs' },
      id: 'receipt',
      outcome: 'incorrect' as const,
      submittedAt: '2026-07-26T06:00:00.000Z',
      value: 'kit{guess}'
    };
    const once = appendChallengeAttempt(new Map(), 'challenge', attempt);
    const replayed = appendChallengeAttempt(once, 'challenge', attempt);

    expect(once.get('challenge')).toEqual([attempt]);
    expect(replayed).toBe(once);
  });
});
