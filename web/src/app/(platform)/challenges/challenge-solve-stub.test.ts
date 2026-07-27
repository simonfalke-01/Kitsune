import { describe, expect, it } from 'vitest';

import {
  appendCurrentCompetitorSolve,
  createChallengeEventStandingStub,
  createChallengeSolveContextStub,
  formatSolveDelta
} from './challenge-solve-stub';
import type { ChallengeSummary } from '@/lib/api/client';
import { createChallengeExperience } from '@/lib/challenges';

function challenge(overrides: Partial<ChallengeSummary> = {}): ChallengeSummary {
  return {
    category: 'Web',
    description: 'Follow the request trail.',
    event_id: 'event',
    id: 'challenge',
    kind: {
      type: 'static_flag'
    },
    max_attempts: 5,
    name: 'Request trail',
    position: 0,
    scoring: {
      kind: 'static',
      points: 300
    },
    solved: false,
    state: 'published',
    survey: [],
    tags: [],
    visibility: {
      division_ids: [],
      prerequisites: [],
      visible_from: null,
      visible_until: null
    },
    writeups_enabled: false,
    ...overrides
  };
}

describe('challenge solve frontend adapter', () => {
  it('preserves explicit solve totals and produces stable ranked timing', () => {
    const experience = createChallengeExperience(challenge({ solved: true }), {
      solveCount: 18
    });
    const input = {
      challenge: experience,
      currentCompetitor: {
        id: 'foxden',
        name: 'Foxden'
      },
      eventStartedAt: '2026-07-23T10:00:00Z'
    };
    const first = createChallengeSolveContextStub(input);
    const second = createChallengeSolveContextStub(input);

    expect(first).toEqual(second);
    expect(first.totalSolves).toBe(18);
    expect(first.entries).toHaveLength(18);
    expect(first.entries[0]).toMatchObject({
      deltaMs: 0,
      rank: 1
    });
    expect(first.selfEntry).toMatchObject({
      competitorId: 'foxden',
      competitorName: 'Foxden',
      isSelf: true
    });
  });

  it('adds an optimistic current-competitor solve without changing the earlier order', () => {
    const context = createChallengeSolveContextStub({
      challenge: createChallengeExperience(challenge(), {
        solveCount: 4
      }),
      currentCompetitor: {
        id: 'foxden',
        name: 'Foxden'
      },
      eventStartedAt: '2026-07-23T10:00:00Z'
    });
    const updated = appendCurrentCompetitorSolve(
      context,
      context.currentCompetitor,
      '2026-07-23T14:00:00Z'
    );

    expect(updated.totalSolves).toBe(5);
    expect(updated.entries.slice(0, 4)).toEqual(context.entries);
    expect(updated.selfEntry).toMatchObject({
      competitorName: 'Foxden',
      rank: 5
    });
    expect(formatSolveDelta(updated.selfEntry!.deltaMs)).toMatch(/^\+/);
  });

  it('builds a stable nearby-score comparison with the current team emphasized', () => {
    const standing = createChallengeEventStandingStub({
      challenges: [
        createChallengeExperience(challenge({ solved: true }), {
          solveCount: 18
        })
      ],
      currentCompetitor: {
        id: 'foxden',
        name: 'Foxden'
      },
      eventId: 'event',
      eventStartedAt: '2026-07-23T10:00:00Z'
    });

    expect(standing.nearbySeries).toHaveLength(4);
    expect(standing.nearbySeries.find((series) => series.isEmphasized)).toEqual(
      standing.scoreSeries
    );
    expect(standing.nearbySeries.every((series) => series.points.length === 8)).toBe(true);
  });
});
