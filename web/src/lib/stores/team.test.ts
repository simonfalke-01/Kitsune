import { describe, expect, it } from 'vitest';
import type { TeamSummary } from '$lib/api/client';
import { captainId } from './team.svelte';

describe('team projections', () => {
  it('finds the single captain without relying on member ordering', () => {
    const team: TeamSummary = {
      id: 'team',
      name: 'Nine Tails',
      created_at: '2026-07-22T00:00:00Z',
      members: [
        {
          user_id: 'member',
          display_name: 'Member',
          captain: false,
          joined_at: '2026-07-22T00:00:00Z'
        },
        {
          user_id: 'captain',
          display_name: 'Captain',
          captain: true,
          joined_at: '2026-07-22T00:00:00Z'
        }
      ]
    };
    expect(captainId(team)).toBe('captain');
    expect(captainId(null)).toBeNull();
  });
});
