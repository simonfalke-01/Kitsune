import type { ScoreboardRow } from './api/client';

export interface ScoreboardUrlState {
  divisionId: string | null;
  search: string;
}

export function scoreboardSearchIsActive(query: string): boolean {
  return query.trim().length >= 2;
}

export function filterScoreboardRows(
  rows: readonly ScoreboardRow[],
  query: string
): ScoreboardRow[] {
  const normalized = query.trim().toLocaleLowerCase();

  if (!scoreboardSearchIsActive(normalized)) {
    return [...rows];
  }

  return rows.filter((row) => {
    const kind = row.competitor_kind === 'team' ? 'team' : 'individual';
    return [row.name, kind].some((value) => value.toLocaleLowerCase().includes(normalized));
  });
}

export function parseScoreboardUrlState(searchParams: URLSearchParams): ScoreboardUrlState {
  const search = searchParams.get('search')?.trim() ?? '';
  const divisionId = searchParams.get('division')?.trim() || null;

  return {
    divisionId,
    search: scoreboardSearchIsActive(search) ? search : ''
  };
}

export function competitorProfilePath(kind: string, competitorId: string): string {
  return `/competitors/${encodeURIComponent(kind)}/${encodeURIComponent(competitorId)}`;
}
