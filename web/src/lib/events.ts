import type { ChallengeSummary, EventSummary } from './api/client';

type WireChallenge = Omit<ChallengeSummary, 'survey'> & {
  survey: Array<
    Omit<ChallengeSummary['survey'][number], 'range'> & {
      range?: number[] | null;
    }
  >;
};

const eventStatePriority: Readonly<Record<string, number>> = {
  live: 0,
  scheduled: 1,
  paused: 2,
  draft: 3,
  ended: 4,
  archived: 5
};

export function chooseDefaultEvent(events: readonly EventSummary[]): EventSummary | null {
  const sorted = [...events].sort((left, right) => {
    const leftPriority = eventStatePriority[left.state] ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = eventStatePriority[right.state] ?? Number.MAX_SAFE_INTEGER;
    const stateDifference = leftPriority - rightPriority;

    if (stateDifference !== 0) {
      return stateDifference;
    }

    return left.name.localeCompare(right.name);
  });

  return sorted[0] ?? null;
}

export function normalizeChallenge(challenge: WireChallenge): ChallengeSummary {
  return {
    ...challenge,
    survey: challenge.survey.map((question) => {
      const range = question.range;
      const start = range?.[0];
      const end = range?.[1];
      const normalizedRange: [number, number] | null =
        typeof start === 'number' && typeof end === 'number' ? [start, end] : null;

      return {
        ...question,
        range: normalizedRange
      };
    })
  };
}
