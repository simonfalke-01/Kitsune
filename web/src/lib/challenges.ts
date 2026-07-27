import type { ChallengeSummary } from './api/client';

export type ChallengeLandingMode = 'progress' | 'prompt' | 'recent';
export type ChallengeSurveyMode = 'gate' | 'post_solve';
export type ChallengeCategoryTone =
  'amber' | 'blue' | 'cyan' | 'lime' | 'orange' | 'pink' | 'teal' | 'violet';

export interface ChallengeAttachment {
  id: string;
  label: string;
  size: string;
  url: string;
}

export interface ChallengeExperience extends ChallengeSummary {
  attachments: ChallengeAttachment[];
  attemptsRemaining: number | null;
  solveCount: number | null;
  surveyMode: ChallengeSurveyMode | null;
  surveyRewardFlag: string | null;
}

export interface ChallengeGroup {
  category: string;
  challenges: ChallengeExperience[];
  solved: number;
}

export interface ChallengeProgress {
  availablePoints: number;
  earnedPoints: number;
  solved: number;
  total: number;
}

const categoryAliases: Readonly<Record<string, string>> = {
  binary: 'Pwn',
  'binary exploitation': 'Pwn',
  cryptography: 'Crypto',
  misc: 'Miscellaneous',
  miscellaneous: 'Miscellaneous',
  pwn: 'Pwn',
  rev: 'Reverse Engineering',
  reverse: 'Reverse Engineering',
  'reverse engineering': 'Reverse Engineering',
  sanity: 'Welcome',
  web: 'Web'
};

const categoryOrder = [
  'Welcome',
  'Web',
  'Pwn',
  'Reverse Engineering',
  'Crypto',
  'Forensics',
  'OSINT',
  'Hardware',
  'Miscellaneous',
  'King of the Hill',
  'Attack-Defense'
] as const;

export function createChallengeExperience(
  challenge: ChallengeSummary,
  overrides: Partial<
    Pick<
      ChallengeExperience,
      'attachments' | 'attemptsRemaining' | 'solveCount' | 'surveyMode' | 'surveyRewardFlag'
    >
  > = {}
): ChallengeExperience {
  return {
    ...challenge,
    attachments: overrides.attachments ?? [],
    attemptsRemaining: overrides.attemptsRemaining ?? null,
    solveCount: overrides.solveCount ?? null,
    surveyMode: overrides.surveyMode ?? (challenge.survey.length > 0 ? 'post_solve' : null),
    surveyRewardFlag: overrides.surveyRewardFlag ?? null
  };
}

export function challengePointValue(challenge: ChallengeExperience): number {
  if (challenge.scoring.kind === 'static') {
    return challenge.scoring.points;
  }

  if (challenge.scoring.kind === 'dynamic') {
    return challenge.scoring.initial;
  }

  return 0;
}

export function challengePointWeights(
  challenges: readonly ChallengeExperience[]
): ReadonlyMap<string, number> {
  const values = challenges.map((challenge) => challengePointValue(challenge));
  const positiveValues = values.filter((value) => value > 0);
  const fallback = positiveValues.length > 0 ? Math.min(...positiveValues) : 1;

  return new Map(
    challenges.map((challenge, index) => {
      const value = values[index] ?? 0;
      return [challenge.id, value > 0 ? value : fallback];
    })
  );
}

export function orderChallengeSegments(
  challenges: readonly ChallengeExperience[]
): ChallengeExperience[] {
  return [...challenges].sort((left, right) => {
    return (
      Number(right.solved) - Number(left.solved) ||
      left.position - right.position ||
      left.name.localeCompare(right.name)
    );
  });
}

export function challengePoints(challenge: ChallengeExperience): string {
  if (challenge.scoring.kind === 'static') {
    return `${challenge.scoring.points} pts`;
  }

  if (challenge.scoring.kind === 'dynamic') {
    return `${challenge.scoring.minimum}–${challenge.scoring.initial} pts`;
  }

  return 'Variable';
}

export function challengeAttempts(challenge: ChallengeExperience): string {
  if (typeof challenge.attemptsRemaining === 'number') {
    return `${challenge.attemptsRemaining} attempts left`;
  }

  if (typeof challenge.max_attempts === 'number') {
    return `${challenge.max_attempts} attempts max`;
  }

  return 'Unlimited attempts';
}

export function challengeCategoryTone(category: string): ChallengeCategoryTone {
  const knownTones: Readonly<Record<string, ChallengeCategoryTone>> = {
    'attack-defense': 'pink',
    crypto: 'amber',
    forensics: 'teal',
    hardware: 'lime',
    'king of the hill': 'violet',
    miscellaneous: 'violet',
    osint: 'cyan',
    pwn: 'pink',
    'reverse engineering': 'orange',
    web: 'blue',
    welcome: 'lime'
  };
  const normalized = challengeCategoryLabel(category).toLocaleLowerCase();
  const knownTone = knownTones[normalized];

  if (knownTone) {
    return knownTone;
  }

  const tones: readonly ChallengeCategoryTone[] = [
    'blue',
    'cyan',
    'teal',
    'lime',
    'amber',
    'orange',
    'pink',
    'violet'
  ];
  let hash = 0;

  for (const character of normalized) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }

  return tones[hash % tones.length] ?? 'blue';
}

export function challengeCategoryLabel(category: string): string {
  const normalized = category.trim();
  return categoryAliases[normalized.toLocaleLowerCase()] ?? normalized;
}

export function challengeConnection(challenge: ChallengeExperience): string | null {
  if (challenge.kind.type === 'remote_service') {
    return challenge.kind.connection;
  }

  return null;
}

export function filterChallenges(
  challenges: readonly ChallengeExperience[],
  query: string
): ChallengeExperience[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return [...challenges];
  }

  return challenges.filter((challenge) => {
    return [challenge.name, challenge.category, ...challenge.tags].some((value) => {
      return value.toLocaleLowerCase().includes(normalizedQuery);
    });
  });
}

export function groupChallenges(challenges: readonly ChallengeExperience[]): ChallengeGroup[] {
  const groups = new Map<string, ChallengeExperience[]>();

  for (const challenge of challenges) {
    const category = challengeCategoryLabel(challenge.category);
    const group = groups.get(category) ?? [];
    group.push(challenge);
    groups.set(category, group);
  }

  return [...groups.entries()]
    .map(([category, groupedChallenges]) => ({
      category,
      challenges: [...groupedChallenges].sort((left, right) => {
        const leftSolves = left.solveCount ?? -1;
        const rightSolves = right.solveCount ?? -1;
        return rightSolves - leftSolves || left.name.localeCompare(right.name);
      }),
      solved: groupedChallenges.filter((challenge) => challenge.solved).length
    }))
    .sort((left, right) => {
      const leftOrder = categoryOrder.indexOf(left.category as (typeof categoryOrder)[number]);
      const rightOrder = categoryOrder.indexOf(right.category as (typeof categoryOrder)[number]);
      const resolvedLeft = leftOrder < 0 ? categoryOrder.length : leftOrder;
      const resolvedRight = rightOrder < 0 ? categoryOrder.length : rightOrder;
      return resolvedLeft - resolvedRight || left.category.localeCompare(right.category);
    });
}

export function challengeProgress(challenges: readonly ChallengeExperience[]): ChallengeProgress {
  return {
    availablePoints: challenges.reduce((total, challenge) => {
      return total + challengePointValue(challenge);
    }, 0),
    earnedPoints: challenges.reduce((total, challenge) => {
      return challenge.solved ? total + challengePointValue(challenge) : total;
    }, 0),
    solved: challenges.filter((challenge) => challenge.solved).length,
    total: challenges.length
  };
}

export function challengeSelection(searchParams: URLSearchParams): string | null {
  const selection = searchParams.get('challenge')?.trim();
  return selection ? selection : null;
}

export function surveyAnswersAreComplete(
  challenge: ChallengeExperience,
  answers: Readonly<Record<string, number | null>>
): boolean {
  return challenge.survey.every((question) => {
    return !question.required || typeof answers[question.key] === 'number';
  });
}

export function surveyRange(question: ChallengeExperience['survey'][number]): [number, number] {
  return question.range ?? [1, 5];
}
