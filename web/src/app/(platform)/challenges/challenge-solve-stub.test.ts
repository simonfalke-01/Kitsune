import { describe, expect, it } from 'vitest';

import {
  appendCurrentCompetitorSolve,
  createChallengeEventStandingStub,
  createChallengeSolveContextStub,
  formatSolveDelta,
  formatSolveElapsedTime
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

  it('builds a seven-place nearby-score window with the current team centered', () => {
    const standing = createChallengeEventStandingStub({
      challenges: [
        createChallengeExperience(challenge({ id: 'solved', solved: true }), {
          solveCount: 18
        }),
        createChallengeExperience(challenge({ id: 'open', position: 1 }))
      ],
      currentCompetitor: {
        id: 'foxden',
        name: 'Foxden'
      },
      eventId: 'event',
      eventStartedAt: '2026-07-23T10:00:00Z'
    });

    expect(standing.nearbySeries).toHaveLength(7);
    expect(standing.nearbyStandings).toHaveLength(7);
    expect(standing.nearbyStandings.map((entry) => entry.rank)).toEqual([
      standing.rank - 3,
      standing.rank - 2,
      standing.rank - 1,
      standing.rank,
      standing.rank + 1,
      standing.rank + 2,
      standing.rank + 3
    ]);
    expect(standing.nearbyStandings[3]).toMatchObject({
      isSelf: true,
      name: 'Foxden',
      rank: standing.rank
    });
    expect(standing.nearbyStandings.filter((entry) => entry.isSelf)).toHaveLength(1);
    expect(standing.nearbySeries.find((series) => series.isEmphasized)).toEqual(
      standing.scoreSeries
    );
    const currentScoreChanges = standing.scoreSeries.points.filter((point, index, points) => {
      return index > 0 && point.y > points[index - 1]!.y;
    });
    const solveTimePatterns = standing.nearbySeries.map((series) =>
      series.points
        .filter((point, index, points) => index > 0 && point.y > points[index - 1]!.y)
        .map((point) => point.x)
        .join(',')
    );
    expect(currentScoreChanges).toHaveLength(1);
    expect(new Set(solveTimePatterns).size).toBeGreaterThan(1);
    expect(
      standing.nearbySeries.every((series) =>
        series.points.every((point, index, points) => index === 0 || point.x > points[index - 1]!.x)
      )
    ).toBe(true);
    expect(
      standing.nearbySeries.map((series) => series.points.at(-1)?.y).sort((a, b) => a! - b!)
    ).toEqual(standing.nearbyStandings.map((entry) => entry.points).sort((a, b) => a - b));
  });

  it('keeps seven consecutive nearby places at the first and final rank', () => {
    const currentCompetitor = {
      id: 'foxden',
      name: 'Foxden'
    };
    const first = createChallengeEventStandingStub({
      challenges: [createChallengeExperience(challenge({ solved: true }))],
      currentCompetitor,
      eventId: 'event-first'
    });
    const final = createChallengeEventStandingStub({
      challenges: [createChallengeExperience(challenge())],
      currentCompetitor,
      eventId: 'event-final'
    });

    expect(first.rank).toBe(1);
    expect(first.nearbyStandings.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(first.nearbyStandings[0]?.isSelf).toBe(true);
    expect(final.rank).toBe(final.totalCompetitors);
    expect(final.nearbyStandings.map((entry) => entry.rank)).toEqual([
      final.totalCompetitors - 6,
      final.totalCompetitors - 5,
      final.totalCompetitors - 4,
      final.totalCompetitors - 3,
      final.totalCompetitors - 2,
      final.totalCompetitors - 1,
      final.totalCompetitors
    ]);
    expect(final.nearbyStandings.at(-1)?.isSelf).toBe(true);
  });

  it('formats first-blood elapsed time without empty units', () => {
    const startedAt = '2026-07-23T10:00:00Z';

    expect(formatSolveElapsedTime('2026-07-23T18:00:00Z', startedAt)).toBe('8h');
    expect(formatSolveElapsedTime('2026-07-23T11:17:00Z', startedAt)).toBe('1h 17min');
    expect(formatSolveElapsedTime('2026-07-23T10:00:12Z', startedAt)).toBe('1min');
  });
});
