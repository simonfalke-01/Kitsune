import { challengeCategoryTone, type ChallengeCategoryTone } from '../challenges';
import type { ChartSeries } from './types';

export interface AnalyticsSolve {
  category: string;
  challengeId: string;
  challengeName: string;
  globalSolves?: number | null;
  points: number;
  solvedAt: number;
}

export interface CategoryPointRow {
  category: string;
  points: number;
  solveCount: number;
  tone: ChallengeCategoryTone;
}

export interface CadenceBucket {
  count: number;
  end: number;
  id: string;
  start: number;
}

export interface DifficultyRow {
  id: string;
  label: string;
  points: number;
  solveCount: number;
}

export interface TimelineLane {
  category: string;
  solves: AnalyticsSolve[];
  tone: ChallengeCategoryTone;
}

export function buildSolveScoreSeries(input: {
  competitorId: string;
  competitorName: string;
  eventStart: number;
  solves: readonly AnalyticsSolve[];
}): ChartSeries<AnalyticsSolve> {
  let total = 0;
  const ordered = [...input.solves].sort((left, right) => left.solvedAt - right.solvedAt);

  return {
    id: input.competitorId,
    isEmphasized: true,
    label: input.competitorName,
    points: [
      {
        id: `${input.competitorId}-start`,
        label: 'Event start',
        metadata: {
          category: '',
          challengeId: '',
          challengeName: 'Event start',
          points: 0,
          solvedAt: input.eventStart
        },
        x: input.eventStart,
        y: 0
      },
      ...ordered.map((solve) => {
        total += solve.points;
        return {
          id: `${input.competitorId}-${solve.challengeId}-${solve.solvedAt}`,
          label: solve.challengeName,
          metadata: solve,
          x: solve.solvedAt,
          y: total
        };
      })
    ],
    tone: 0
  };
}

export function buildCategoryPointRows(solves: readonly AnalyticsSolve[]): CategoryPointRow[] {
  const rows = new Map<string, CategoryPointRow>();

  for (const solve of solves) {
    const current = rows.get(solve.category) ?? {
      category: solve.category,
      points: 0,
      solveCount: 0,
      tone: challengeCategoryTone(solve.category)
    };
    current.points += solve.points;
    current.solveCount += 1;
    rows.set(solve.category, current);
  }

  return [...rows.values()].sort((left, right) => {
    return right.points - left.points || left.category.localeCompare(right.category);
  });
}

function cadenceStep(duration: number): number {
  const candidates = [
    15 * 60_000,
    30 * 60_000,
    60 * 60_000,
    2 * 60 * 60_000,
    4 * 60 * 60_000,
    8 * 60 * 60_000,
    12 * 60 * 60_000,
    24 * 60 * 60_000,
    48 * 60 * 60_000
  ];
  const desired = duration / 8;
  return candidates.find((candidate) => candidate >= desired) ?? candidates.at(-1)!;
}

export function buildCadenceBuckets(input: {
  end: number;
  solves: readonly AnalyticsSolve[];
  start: number;
}): CadenceBucket[] {
  const duration = Math.max(1, input.end - input.start);
  const step = cadenceStep(duration);
  const bucketCount = Math.max(1, Math.ceil(duration / step));
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = input.start + index * step;
    return {
      count: 0,
      end: Math.min(input.end, start + step),
      id: `${start}-${Math.min(input.end, start + step)}`,
      start
    };
  });

  for (const solve of input.solves) {
    if (solve.solvedAt < input.start || solve.solvedAt > input.end) {
      continue;
    }

    const index = Math.min(bucketCount - 1, Math.floor((solve.solvedAt - input.start) / step));
    const bucket = buckets[index];

    if (bucket) {
      bucket.count += 1;
    }
  }

  return buckets;
}

const difficultyBins = [
  {
    id: 'first',
    label: '1 solve',
    maximum: 1,
    minimum: 1
  },
  {
    id: 'rare',
    label: '2–5 solves',
    maximum: 5,
    minimum: 2
  },
  {
    id: 'hard',
    label: '6–20 solves',
    maximum: 20,
    minimum: 6
  },
  {
    id: 'medium',
    label: '21–50 solves',
    maximum: 50,
    minimum: 21
  },
  {
    id: 'common',
    label: '51+ solves',
    maximum: Number.POSITIVE_INFINITY,
    minimum: 51
  }
] as const;

export function buildDifficultyRows(solves: readonly AnalyticsSolve[]): DifficultyRow[] {
  return difficultyBins.map((bin) => {
    const matching = solves.filter((solve) => {
      const count = solve.globalSolves ?? 0;
      return count >= bin.minimum && count <= bin.maximum;
    });

    return {
      id: bin.id,
      label: bin.label,
      points: matching.reduce((total, solve) => total + solve.points, 0),
      solveCount: matching.length
    };
  });
}

export function buildTimelineLanes(solves: readonly AnalyticsSolve[]): TimelineLane[] {
  const lanes = new Map<string, AnalyticsSolve[]>();

  for (const solve of solves) {
    const categorySolves = lanes.get(solve.category) ?? [];
    categorySolves.push(solve);
    lanes.set(solve.category, categorySolves);
  }

  return [...lanes.entries()]
    .map(([category, categorySolves]) => ({
      category,
      solves: categorySolves.sort((left, right) => left.solvedAt - right.solvedAt),
      tone: challengeCategoryTone(category)
    }))
    .sort((left, right) => left.category.localeCompare(right.category));
}
