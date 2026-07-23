import { describe, expect, it } from 'vitest';

import type { TeamSummary } from './api/client';
import {
  canWithdrawRegistration,
  findUserTeam,
  isTeamRealtimeEvent,
  registrationIsClosed,
  teamCapacity
} from './team';

const team: TeamSummary = {
  created_at: '2026-07-23T00:00:00Z',
  id: 'team-1',
  members: [
    {
      captain: true,
      display_name: 'Sherlock',
      joined_at: '2026-07-23T00:00:00Z',
      user_id: 'user-1'
    }
  ],
  name: 'Foxfire'
};

describe('team helpers', () => {
  it('finds the authenticated user team', () => {
    expect(findUserTeam([team], 'user-1')).toEqual(team);
    expect(findUserTeam([team], 'user-2')).toBeNull();
  });

  it('reports open, full, and exceeded capacity', () => {
    expect(teamCapacity(3, null)).toEqual({
      label: '3 members',
      tone: 'neutral'
    });
    expect(teamCapacity(4, 4)).toEqual({
      label: '4 of 4 members',
      tone: 'warning'
    });
    expect(teamCapacity(5, 4)).toEqual({
      label: '5 of 4 members',
      tone: 'danger'
    });
  });

  it('recognizes only team-domain realtime events', () => {
    expect(isTeamRealtimeEvent('team_membership_changed')).toBe(true);
    expect(isTeamRealtimeEvent('event_registration_changed')).toBe(false);
  });

  it('limits registration closure and withdrawal by event phase', () => {
    expect(registrationIsClosed('ended')).toBe(true);
    expect(registrationIsClosed('live')).toBe(false);
    expect(canWithdrawRegistration('scheduled')).toBe(true);
    expect(canWithdrawRegistration('paused')).toBe(false);
  });
});
