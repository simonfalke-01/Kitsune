import type { ChallengeWorkspaceActions } from './challenge-types';
import type { ChallengeSummary } from '@/lib/api/client';
import {
  challengePointValue,
  createChallengeExperience,
  type ChallengeExperience
} from '@/lib/challenges';

const demoDefinitions = [
  ['Welcome', 'Read the Rules', 50, 126, true],
  ['Web', 'Cache Rules Everything', 350, 13, false],
  ['Web', 'Origin Story', 200, 3, false],
  ['Web', 'Unclaimed Route', 450, 0, false],
  ['Pwn', 'After Hours', 500, 15, false],
  ['Pwn', 'Small Change', 300, 26, false],
  ['Reverse Engineering', 'Paper Trail', 400, 8, false],
  ['Reverse Engineering', 'Lost in Translation', 250, 19, false],
  ['Crypto', 'Fox Cipher', 350, 6, false],
  ['Crypto', 'Side Channel', 250, 22, false],
  ['Forensics', 'Cold Storage', 400, 11, false],
  ['OSINT', 'Open Source', 250, 31, false],
  ['Hardware', 'Logic Board', 350, 4, false]
] as const;

const descriptions: Readonly<Record<string, string>> = {
  'After Hours': 'The nightly maintenance process accepts one pointer it should never trust.',
  'Cache Rules Everything':
    'Trace a poisoned cache key across the edge and recover the origin response.',
  'Cold Storage': 'Recover the last clean handoff from a damaged container image.',
  'Fox Cipher': 'Recover a message from a stream that reuses more state than it admits.',
  'Logic Board': 'Decode a compact logic trace and identify the hidden state transition.',
  'Lost in Translation': 'A familiar instruction set hides an unfamiliar calling convention.',
  'Open Source': 'Connect two identities through the one public artifact they share.',
  'Origin Story': 'Follow an origin trust boundary that was never meant to reach the public edge.',
  'Paper Trail': 'Reconstruct the validation path from a stripped desktop utility.',
  'Read the Rules': 'Read the competition rules and submit the browser-tested flag.',
  'Side Channel': 'The implementation leaks one bit of the key on every comparison.',
  'Small Change': 'A tiny allocator change leaves one useful primitive behind.',
  'Unclaimed Route':
    'No team has reached this route. Submit a flag to claim the event’s first blood.'
};

function demoId(name: string): string {
  return `demo-${name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function createChallengeDemo(eventId: string): ChallengeExperience[] {
  return demoDefinitions.map(([category, name, points, solveCount, solved], position) => {
    const challenge: ChallengeSummary = {
      category,
      description: descriptions[name] ?? 'Recover the flag from the supplied challenge state.',
      event_id: eventId,
      id: demoId(name),
      kind: {
        type: 'static_flag'
      },
      max_attempts: 5,
      name,
      position,
      scoring: {
        kind: 'static',
        points
      },
      solved,
      state: 'published',
      survey: [],
      tags: [category.toLocaleLowerCase()],
      visibility: {
        division_ids: [],
        prerequisites: [],
        visible_from: null,
        visible_until: null
      },
      writeups_enabled: solved
    };

    return createChallengeExperience(challenge, {
      attemptsRemaining: challenge.max_attempts,
      solveCount
    });
  });
}

export function createChallengeDemoActions(
  challenges: readonly ChallengeExperience[]
): ChallengeWorkspaceActions {
  const points = new Map(
    challenges.map((challenge) => [challenge.id, challengePointValue(challenge)])
  );
  const solveCounts = new Map(
    challenges.map((challenge) => [challenge.id, challenge.solveCount ?? 0])
  );
  const solvedChallengeIds = new Set(
    challenges.filter((challenge) => challenge.solved).map((challenge) => challenge.id)
  );
  const challengeNames = new Map(challenges.map((challenge) => [challenge.id, challenge.name]));
  const writeups = new Map<
    string,
    Awaited<ReturnType<NonNullable<ChallengeWorkspaceActions['loadWriteup']>>>
  >();

  return {
    loadHints() {
      return Promise.resolve([
        {
          content: null,
          cost: 10,
          id: 1,
          unlocked: false
        }
      ]);
    },
    loadWriteup(challengeId) {
      return Promise.resolve(writeups.get(challengeId) ?? null);
    },
    saveWriteup(challengeId, input) {
      const previous = writeups.get(challengeId);
      const timestamp = new Date().toISOString();
      const writeup = {
        body: input.body,
        challenge_id: challengeId,
        challenge_name: challengeNames.get(challengeId) ?? 'Challenge',
        competitor_id: 'kitsune-labs',
        competitor_kind: 'team',
        competitor_name: 'Kitsune Labs',
        created_at: previous?.created_at ?? timestamp,
        feedback: null,
        id: previous?.id ?? crypto.randomUUID(),
        reviewer_id: null,
        state: input.submit ? 'submitted' : 'draft',
        updated_at: timestamp
      };

      writeups.set(challengeId, writeup);
      return Promise.resolve(writeup);
    },
    submitAnswer(challengeId) {
      const firstBlood =
        !solvedChallengeIds.has(challengeId) && (solveCounts.get(challengeId) ?? 0) === 0;
      solvedChallengeIds.add(challengeId);
      solveCounts.set(challengeId, (solveCounts.get(challengeId) ?? 0) + 1);

      return Promise.resolve({
        attempts_remaining: 4,
        awarded_points: points.get(challengeId) ?? 0,
        challenge_id: challengeId,
        first_blood: firstBlood,
        id: crypto.randomUUID(),
        outcome: 'correct',
        replayed: false,
        submitted_at: new Date().toISOString()
      });
    },
    submitSurvey(challengeId, answers) {
      return Promise.resolve({
        answers,
        challenge_id: challengeId,
        id: crypto.randomUUID(),
        submitted_at: new Date().toISOString()
      });
    },
    unlockHint(_challengeId, hintId) {
      return Promise.resolve({
        charged: 10,
        hint: {
          content: 'Inspect the boundary immediately before the final transformation.',
          cost: 10,
          id: hintId,
          unlocked: true
        },
        replayed: false
      });
    }
  };
}
