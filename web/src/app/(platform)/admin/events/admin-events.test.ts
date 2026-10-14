import { describe, expect, it } from 'vitest';

import type { EventSummary } from '@/lib/api/client';
import {
  bracketMutationSchema,
  createEventInput,
  divisionMutationSchema,
  eventCreationSchema,
  eventScheduleLabel,
  scoreboardStateLabel
} from '@/lib/admin-events';

const eventValues = {
  description: 'Four-mode invitational',
  ends_at: '2026-08-01T18:00',
  modes: ['jeopardy', 'koth', 'attack_defense', 'workshop'] as const,
  name: 'Foxden Invitational',
  participation: 'team' as const,
  slug: 'foxden--invitational',
  starts_at: '2026-08-01T12:00',
  state: 'scheduled' as const,
  team_size_limit: 6
};

function event(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    description: '',
    ends_at: null,
    id: 'event',
    modes: ['jeopardy'],
    name: 'Foxden Invitational',
    participation: 'team',
    scoreboard_frozen: false,
    scoreboard_hidden: false,
    slug: 'foxden-invitational',
    starts_at: null,
    state: 'draft',
    team_size_limit: 4,
    ...overrides
  };
}

describe('admin event helpers', () => {
  it('accepts every API mode and converts local timing for event creation', () => {
    const parsed = eventCreationSchema.parse(eventValues);

    expect(createEventInput(parsed)).toEqual({
      description: 'Four-mode invitational',
      ends_at: new Date('2026-08-01T18:00').toISOString(),
      modes: ['jeopardy', 'koth', 'attack_defense', 'workshop'],
      name: 'Foxden Invitational',
      participation: 'team',
      slug: 'foxden--invitational',
      starts_at: new Date('2026-08-01T12:00').toISOString(),
      state: 'scheduled',
      team_size_limit: 6
    });
  });

  it('clears the team limit for individual events and rejects inverted timing', () => {
    const individual = eventCreationSchema.parse({
      ...eventValues,
      ends_at: '',
      participation: 'individual',
      starts_at: ''
    });

    expect(createEventInput(individual).team_size_limit).toBeNull();

    const inverted = eventCreationSchema.safeParse({
      ...eventValues,
      ends_at: '2026-08-01T11:00'
    });

    expect(inverted.success).toBe(false);
    expect(inverted.error?.issues[0]).toMatchObject({
      message: 'End must be after start.',
      path: ['ends_at']
    });
  });

  it('matches division and bracket mutation limits', () => {
    expect(
      divisionMutationSchema.safeParse({
        name: 'Open',
        position: 100_000
      }).success
    ).toBe(true);
    expect(
      divisionMutationSchema.safeParse({
        name: 'Open\u0000',
        position: 0
      }).success
    ).toBe(false);
    expect(
      bracketMutationSchema.safeParse({
        advancement_slots: 32_767,
        name: 'Final'
      }).success
    ).toBe(true);
    expect(
      bracketMutationSchema.safeParse({
        advancement_slots: 32_768,
        name: 'Final'
      }).success
    ).toBe(false);
  });

  it('reports lifecycle schedule and scoreboard context honestly', () => {
    expect(eventScheduleLabel(event())).toBe('No schedule');
    expect(
      eventScheduleLabel(
        event({
          starts_at: '2026-08-01T12:00:00.000Z'
        })
      )
    ).toContain('Starts');
    expect(scoreboardStateLabel(event())).toBe('Visible and live');
    expect(scoreboardStateLabel(event({ scoreboard_frozen: true }))).toBe('Frozen');
    expect(scoreboardStateLabel(event({ scoreboard_frozen: true, scoreboard_hidden: true }))).toBe(
      'Hidden'
    );
  });
});
