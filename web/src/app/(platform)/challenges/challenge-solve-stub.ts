import type { ChartSeries } from '@/lib/visualization/types';
import { challengeProgress, type ChallengeExperience } from '@/lib/challenges';

export interface ChallengeCompetitorStub {
  id: string;
  name: string;
}

export interface ChallengeSolveEntry {
  competitorId: string;
  competitorName: string;
  deltaMs: number;
  globalRank: number;
  id: string;
  isSelf: boolean;
  rank: number;
  solvedAt: string;
}

export interface ChallengeSolveContext {
  currentCompetitor: ChallengeCompetitorStub;
  entries: ChallengeSolveEntry[];
  eventStartedAt: string;
  selfEntry: ChallengeSolveEntry | null;
  totalSolves: number;
}

export interface ChallengeEventStandingStub {
  nearbySeries: ChartSeries<null>[];
  rank: number;
  scoreSeries: ChartSeries<null>;
  totalCompetitors: number;
}

const teamAdjectives = [
  'Amber',
  'Arc',
  'Cipher',
  'Copper',
  'Delta',
  'Ember',
  'Glass',
  'Ivory',
  'Lantern',
  'Lunar',
  'Paper',
  'Quiet',
  'Signal',
  'Silver',
  'Velvet',
  'Wild'
] as const;

const teamNouns = [
  'Circuit',
  'Collective',
  'Foxes',
  'Garden',
  'Guild',
  'Index',
  'Kernel',
  'Moths',
  'Packet',
  'Relay',
  'Rooks',
  'Signal',
  'Stack',
  'Syndicate',
  'Thread',
  'Workshop'
] as const;

const fallbackEventStart = '2026-07-25T08:00:00.000Z';
const minute = 60_000;

function stableHash(value: string): number {
  let hash = 2_166_136_261;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function resolvedEventStart(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return fallbackEventStart;
  }

  return new Date(value).toISOString();
}

function generatedTeamName(seed: number, index: number): string {
  const adjective = teamAdjectives[(seed + index * 7) % teamAdjectives.length] ?? 'Quiet';
  const noun = teamNouns[(seed * 3 + index * 11) % teamNouns.length] ?? 'Circuit';
  return `${adjective} ${noun}`;
}

function solveTotal(challenge: ChallengeExperience): number {
  if (typeof challenge.solveCount === 'number') {
    return Math.max(challenge.solved ? 1 : 0, challenge.solveCount);
  }

  const generated = stableHash(`${challenge.event_id}:${challenge.id}:solves`) % 32;
  return Math.max(challenge.solved ? 1 : 0, generated);
}

export function createChallengeSolveContextStub(input: {
  challenge: ChallengeExperience;
  currentCompetitor: ChallengeCompetitorStub;
  eventStartedAt?: string | null;
}): ChallengeSolveContext {
  const eventStartedAt = resolvedEventStart(input.eventStartedAt);
  const eventStartMs = Date.parse(eventStartedAt);
  const seed = stableHash(`${input.challenge.event_id}:${input.challenge.id}`);
  const totalSolves = solveTotal(input.challenge);
  const firstSolveMs = eventStartMs + (20 + (seed % 71)) * minute;
  const selfRank = input.challenge.solved
    ? seed % 7 === 0
      ? 1
      : 1 + (stableHash(`${input.challenge.id}:self`) % totalSolves)
    : null;
  let solvedAtMs = firstSolveMs;
  const entries = Array.from({ length: totalSolves }, (_, index): ChallengeSolveEntry => {
    const rank = index + 1;

    if (rank > 1) {
      solvedAtMs += (4 + (stableHash(`${input.challenge.id}:${rank}`) % 31)) * minute;
    }

    const isSelf = rank === selfRank;
    const competitorId = isSelf
      ? input.currentCompetitor.id
      : `solve-${input.challenge.id}-${rank}`;

    return {
      competitorId,
      competitorName: isSelf ? input.currentCompetitor.name : generatedTeamName(seed, index),
      deltaMs: solvedAtMs - firstSolveMs,
      globalRank: 1 + (stableHash(`${competitorId}:standing`) % 128),
      id: `${input.challenge.id}:${competitorId}`,
      isSelf,
      rank,
      solvedAt: new Date(solvedAtMs).toISOString()
    };
  });

  return {
    currentCompetitor: input.currentCompetitor,
    entries,
    eventStartedAt,
    selfEntry: selfRank ? (entries[selfRank - 1] ?? null) : null,
    totalSolves
  };
}

export function createChallengeSolveContextMap(input: {
  challenges: readonly ChallengeExperience[];
  currentCompetitor: ChallengeCompetitorStub;
  eventStartedAt?: string | null;
}): ReadonlyMap<string, ChallengeSolveContext> {
  return new Map(
    input.challenges.map((challenge) => [
      challenge.id,
      createChallengeSolveContextStub({
        challenge,
        currentCompetitor: input.currentCompetitor,
        eventStartedAt: input.eventStartedAt
      })
    ])
  );
}

export function appendCurrentCompetitorSolve(
  context: ChallengeSolveContext,
  currentCompetitor: ChallengeCompetitorStub,
  solvedAt: string
): ChallengeSolveContext {
  if (context.selfEntry) {
    return context;
  }

  const parsedSolvedAt = Date.parse(solvedAt);
  const firstSolveAt = context.entries[0]
    ? Date.parse(context.entries[0].solvedAt)
    : parsedSolvedAt;
  const resolvedSolvedAt = Number.isFinite(parsedSolvedAt)
    ? parsedSolvedAt
    : Math.max(Date.parse(context.eventStartedAt), firstSolveAt);
  const rank = context.totalSolves + 1;
  const selfEntry: ChallengeSolveEntry = {
    competitorId: currentCompetitor.id,
    competitorName: currentCompetitor.name,
    deltaMs: Math.max(0, resolvedSolvedAt - firstSolveAt),
    globalRank: 1 + (stableHash(`${currentCompetitor.id}:standing`) % 128),
    id: `self:${currentCompetitor.id}:${rank}`,
    isSelf: true,
    rank,
    solvedAt: new Date(resolvedSolvedAt).toISOString()
  };

  return {
    ...context,
    currentCompetitor,
    entries: [...context.entries, selfEntry],
    selfEntry,
    totalSolves: rank
  };
}

export function createChallengeEventStandingStub(input: {
  challenges: readonly ChallengeExperience[];
  currentCompetitor: ChallengeCompetitorStub;
  eventId: string;
  eventStartedAt?: string | null;
}): ChallengeEventStandingStub {
  const progress = challengeProgress(input.challenges);
  const seed = stableHash(`${input.eventId}:${input.currentCompetitor.id}:standing`);
  const totalCompetitors = 64 + (seed % 96);
  const progressRatio = progress.total === 0 ? 0 : progress.solved / progress.total;
  const rank = Math.max(1, Math.round(totalCompetitors - progressRatio * (totalCompetitors - 1)));
  const eventStartMs = Date.parse(resolvedEventStart(input.eventStartedAt));
  function scoreSeries(
    id: string,
    label: string,
    finalScore: number,
    tone: number,
    isEmphasized = false
  ): ChartSeries<null> {
    return {
      id,
      isEmphasized,
      label,
      points: Array.from({ length: 8 }, (_, index) => {
        const ratio = index / 7;
        return {
          id: `${id}:score:${index}`,
          label: `Score ${index + 1}`,
          metadata: null,
          x: eventStartMs + index * 75 * minute,
          y: Math.round(finalScore * ratio ** (1.15 + tone * 0.08))
        };
      }),
      tone
    };
  }

  const currentSeries = scoreSeries(
    `${input.eventId}:self-score`,
    input.currentCompetitor.name,
    progress.earnedPoints,
    0,
    true
  );
  const nearbyScores = [
    progress.earnedPoints + 150,
    progress.earnedPoints + 75,
    Math.max(0, progress.earnedPoints - 25)
  ];
  const nearbySeries = nearbyScores.map((score, index) => {
    const competitorSeed = stableHash(`${input.eventId}:nearby:${index}`);
    return scoreSeries(
      `${input.eventId}:nearby:${index}`,
      generatedTeamName(competitorSeed, index),
      score,
      index + 1
    );
  });

  return {
    nearbySeries: [currentSeries, nearbySeries[0]!, nearbySeries[1]!, nearbySeries[2]!],
    rank,
    scoreSeries: currentSeries,
    totalCompetitors
  };
}

export function solveCountLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'solve' : 'solves'}`;
}

export function formatSolveDelta(deltaMs: number): string {
  if (deltaMs <= 0) {
    return 'First blood';
  }

  const totalMinutes = Math.max(1, Math.round(deltaMs / minute));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `+${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `+${hours}h ${minutes}m`;
  }

  return `+${minutes}m`;
}

export function formatSolveTimestamp(value: string): string {
  const timestamp = new Date(value);

  if (!Number.isFinite(timestamp.getTime())) {
    return 'Unavailable';
  }

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ] as const;
  const month = months[timestamp.getUTCMonth()] ?? 'Jan';
  const day = String(timestamp.getUTCDate()).padStart(2, '0');
  const hour = String(timestamp.getUTCHours()).padStart(2, '0');
  const minute = String(timestamp.getUTCMinutes()).padStart(2, '0');

  return `${month} ${day} at ${hour}:${minute} UTC`;
}
