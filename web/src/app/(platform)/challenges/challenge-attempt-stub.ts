import type { SubmissionReceipt } from '@/lib/api/client';
import type { ChallengeExperience } from '@/lib/challenges';

export interface ChallengeAttemptActorStub {
  id: string;
  name: string;
}

export type ChallengeAttemptOutcome = 'correct' | 'incorrect' | 'pending' | 'unknown';

export interface ChallengeAttemptEntry {
  actor: ChallengeAttemptActorStub;
  id: string;
  outcome: ChallengeAttemptOutcome;
  submittedAt: string;
  value: string;
}

export type ChallengeAttemptHistory = ReadonlyMap<string, readonly ChallengeAttemptEntry[]>;

export function challengeAttemptOutcome(
  outcome: SubmissionReceipt['outcome']
): ChallengeAttemptOutcome {
  return outcome === 'correct' || outcome === 'incorrect' || outcome === 'pending'
    ? outcome
    : 'unknown';
}

export function appendChallengeAttempt(
  history: ChallengeAttemptHistory,
  challengeId: string,
  attempt: ChallengeAttemptEntry
): ChallengeAttemptHistory {
  const current = history.get(challengeId) ?? [];

  if (current.some((entry) => entry.id === attempt.id)) {
    return history;
  }

  const next = new Map(history);
  next.set(challengeId, [attempt, ...current]);
  return next;
}

export function createChallengeAttemptHistoryStub(
  challenges: readonly ChallengeExperience[]
): ChallengeAttemptHistory {
  const cacheChallenge = challenges.find(
    (challenge) => challenge.name === 'Cache Rules Everything'
  );

  if (!cacheChallenge) {
    return new Map();
  }

  return new Map([
    [
      cacheChallenge.id,
      [
        {
          actor: {
            id: 'simonfalke',
            name: 'simonfalke'
          },
          id: `${cacheChallenge.id}:attempt:simonfalke`,
          outcome: 'incorrect',
          submittedAt: '2026-07-26T05:07:00.000Z',
          value: 'kit{cache_controls_everything}'
        },
        {
          actor: {
            id: 'mika',
            name: 'mika'
          },
          id: `${cacheChallenge.id}:attempt:mika`,
          outcome: 'incorrect',
          submittedAt: '2026-07-26T05:02:00.000Z',
          value: 'kit{origin_not_edge}'
        }
      ]
    ]
  ]);
}
