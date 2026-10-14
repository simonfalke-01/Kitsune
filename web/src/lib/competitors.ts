import type { CompetitorProfile } from './api/client';

export type CompetitorKind = 'team' | 'user';

export type NormalizedCompetitorProfile = Omit<CompetitorProfile, 'competitor_kind'> & {
  competitor_kind: CompetitorKind;
};

const timestampFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC'
});

const numberFormatter = new Intl.NumberFormat('en');

export function parseCompetitorKind(value: string): CompetitorKind | null {
  if (value === 'team' || value === 'user') {
    return value;
  }

  return null;
}

export function competitorKindLabel(kind: CompetitorKind): string {
  return kind === 'team' ? 'Team' : 'Individual';
}

export function competitorMembershipLabel(captain: boolean): string {
  return captain ? 'Captain' : 'Member';
}

export function competitorProfileHref(kind: CompetitorKind, competitorId: string): string {
  return `/competitors/${kind}/${encodeURIComponent(competitorId)}`;
}

export function formatCompetitorNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatCompetitorTimestamp(value: string): string {
  const timestamp = new Date(value);

  if (!Number.isFinite(timestamp.getTime())) {
    return 'Unavailable';
  }

  return `${timestampFormatter.format(timestamp)} UTC`;
}

export function normalizeCompetitorProfile(
  profile: CompetitorProfile
): NormalizedCompetitorProfile {
  const kind = parseCompetitorKind(profile.competitor_kind);

  if (!kind) {
    throw new Error('Kitsune returned an unsupported competitor kind.');
  }

  return {
    ...profile,
    competitor_kind: kind,
    members: kind === 'team' ? [...profile.members] : [],
    recent_solves: [...profile.recent_solves].sort((left, right) => {
      const leftTimestamp = Date.parse(left.solved_at);
      const rightTimestamp = Date.parse(right.solved_at);

      if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp)) {
        return rightTimestamp - leftTimestamp;
      }

      if (Number.isFinite(rightTimestamp)) {
        return 1;
      }

      if (Number.isFinite(leftTimestamp)) {
        return -1;
      }

      return 0;
    }),
    teams: kind === 'user' ? [...profile.teams] : []
  };
}
