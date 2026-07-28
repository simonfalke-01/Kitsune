import type { ChallengeWorkspaceActions } from './challenge-types';
import type { ChallengePresenceMember, ChallengeSummary } from '@/lib/api/client';
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
  ['Web', 'Cookie Jar', 150, 47, false],
  ['Web', 'Host Header', 300, 18, false],
  ['Web', 'Signed Out', 250, 29, false],
  ['Pwn', 'After Hours', 500, 15, false],
  ['Pwn', 'Small Change', 300, 26, false],
  ['Pwn', 'Borrowed Time', 450, 9, false],
  ['Pwn', 'Canary in a Coal Mine', 350, 17, false],
  ['Reverse Engineering', 'Paper Trail', 400, 8, false],
  ['Reverse Engineering', 'Lost in Translation', 250, 19, false],
  ['Reverse Engineering', 'Glass Box', 300, 14, false],
  ['Reverse Engineering', 'Tail Call', 500, 5, false],
  ['Crypto', 'Fox Cipher', 350, 6, false],
  ['Crypto', 'Side Channel', 250, 22, false],
  ['Crypto', 'Prime Suspect', 400, 12, false],
  ['Crypto', 'Nonce Sense', 300, 24, false],
  ['Forensics', 'Cold Storage', 400, 11, false],
  ['Forensics', 'Packet Postcard', 250, 34, false],
  ['Forensics', 'Memory Lane', 450, 7, false],
  ['Forensics', 'Breadcrumbs', 300, 16, false],
  ['OSINT', 'Open Source', 250, 31, false],
  ['OSINT', 'Paper Town', 300, 20, false],
  ['OSINT', 'Signal Fire', 400, 6, false],
  ['Hardware', 'Logic Board', 350, 4, false],
  ['Hardware', 'Fault Line', 450, 9, false],
  ['Hardware', 'Bus Stop', 300, 21, false],
  ['Miscellaneous', 'Queue Jump', 250, 28, false],
  ['Miscellaneous', 'Time Capsule', 350, 10, false],
  ['Miscellaneous', 'One More Thing', 500, 2, false]
] as const;

const descriptions: Readonly<Record<string, string>> = {
  'After Hours': 'The nightly maintenance process accepts one pointer it should never trust.',
  'Borrowed Time': 'Turn a borrowed reference into control before its owner notices.',
  Breadcrumbs: 'Follow a partial filesystem trail through three discarded snapshots.',
  'Bus Stop': 'Reassemble a noisy bus capture and identify the command hidden between retries.',
  'Cache Rules Everything': `# Objective

Trace a poisoned cache key across the edge and recover the origin response.

- Compare the forwarded host with the cache key
- Reproduce the request without changing the signed path
- Submit the value returned by the protected origin

## Captured behavior

| Request | Cache result |
| --- | --- |
| First forwarded host | Miss |
| Repeated forwarded host | Hit |
| Different forwarded host | Same object |

> The cache varies on a header the origin does not validate.

\`\`\`http
GET /status HTTP/1.1
Host: cache.foxden.test
X-Forwarded-Host: origin.foxden.test
\`\`\`

Review [HTTP caching semantics](https://www.rfc-editor.org/rfc/rfc9111) before testing the boundary.`,
  'Canary in a Coal Mine': 'A guarded stack still leaves one path through the ventilation shaft.',
  'Cold Storage': 'Recover the last clean handoff from a damaged container image.',
  'Cookie Jar': 'One signed cookie carries more authority than the application intended.',
  'Fault Line': 'Time a voltage fault precisely enough to skip one security decision.',
  'Fox Cipher': 'Recover a message from a stream that reuses more state than it admits.',
  'Glass Box': 'A transparent wrapper obscures the only branch that matters.',
  'Host Header': 'A trusted upstream forwards the one hostname it should have rejected.',
  'Logic Board': 'Decode a compact logic trace and identify the hidden state transition.',
  'Lost in Translation': 'A familiar instruction set hides an unfamiliar calling convention.',
  'Memory Lane': 'Recover a session secret from a process image captured after the crash.',
  'Nonce Sense': 'Two signatures disagree about what makes a nonce unique.',
  'One More Thing': 'A tiny utility exposes one final behavior that was never documented.',
  'Open Source': 'Connect two identities through the one public artifact they share.',
  'Origin Story': 'Follow an origin trust boundary that was never meant to reach the public edge.',
  'Packet Postcard': 'Reassemble a short message scattered across an otherwise ordinary capture.',
  'Paper Trail': 'Reconstruct the validation path from a stripped desktop utility.',
  'Paper Town': 'Prove which mapped location exists only in copied public records.',
  'Prime Suspect': 'A convenient prime generation shortcut leaves a factor within reach.',
  'Queue Jump': 'Reorder a small job queue without touching its guarded scheduler.',
  'Read the Rules': 'Read the competition rules and submit the browser-tested flag.',
  'Signal Fire': 'Correlate a distant radio beacon with one public maintenance notice.',
  'Signed Out': 'A logout path revokes the browser session but leaves another token alive.',
  'Side Channel': 'The implementation leaks one bit of the key on every comparison.',
  'Small Change': 'A tiny allocator change leaves one useful primitive behind.',
  'Tail Call': 'Trace the last indirect jump through a deliberately flattened control flow.',
  'Time Capsule': 'Open a versioned archive whose newest entry points backward in time.',
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
      attachments:
        name === 'Cache Rules Everything'
          ? [
              {
                id: 'demo-cache-capture',
                label: 'Captured response',
                size: '290 B',
                url: '/demo/cache-rules-everything.txt'
              }
            ]
          : [],
      attemptsRemaining: challenge.max_attempts,
      authorName: 'simonfalke',
      solveCount
    });
  });
}

export function createChallengeDemoPresence(): ChallengePresenceMember[] {
  const updatedAt = '2026-07-28T04:00:00Z';

  return [
    {
      challenge_id: demoId('Read the Rules'),
      display_name: 'Mina Park',
      updated_at: updatedAt,
      user_id: 'demo-teammate-mina'
    },
    {
      challenge_id: demoId('Cache Rules Everything'),
      display_name: 'Theo Bell',
      updated_at: updatedAt,
      user_id: 'demo-teammate-theo'
    },
    {
      challenge_id: demoId('Cache Rules Everything'),
      display_name: 'Sora Chen',
      updated_at: updatedAt,
      user_id: 'demo-teammate-sora'
    }
  ];
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
      if (challengeNames.get(challengeId) === 'Cache Rules Everything') {
        return Promise.resolve({
          attempts_remaining: 4,
          awarded_points: 0,
          challenge_id: challengeId,
          first_blood: false,
          id: crypto.randomUUID(),
          outcome: 'incorrect',
          replayed: false,
          submitted_at: new Date().toISOString()
        });
      }

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
