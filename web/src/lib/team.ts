import type { TeamSummary } from './api/client';

export interface TeamCapacity {
  label: string;
  tone: 'danger' | 'neutral' | 'warning';
}

export function findUserTeam(teams: readonly TeamSummary[], userId: string): TeamSummary | null {
  return teams.find((team) => team.members.some((member) => member.user_id === userId)) ?? null;
}

export function teamCapacity(memberCount: number, limit: number | null): TeamCapacity {
  if (limit === null) {
    return {
      label: `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`,
      tone: 'neutral'
    };
  }

  if (memberCount > limit) {
    return {
      label: `${memberCount} of ${limit} members`,
      tone: 'danger'
    };
  }

  return {
    label: `${memberCount} of ${limit} members`,
    tone: memberCount === limit ? 'warning' : 'neutral'
  };
}

export function isTeamRealtimeEvent(type: string): boolean {
  return (
    type === 'team_created' ||
    type === 'team_membership_changed' ||
    type === 'team_member_transferred' ||
    type === 'team_merged' ||
    type === 'team_changed'
  );
}
