import { describe, expect, it } from 'vitest';
import type { ChallengeSummary, EventSummary } from '$lib/api/client';
import { challengeCategories, chooseDefaultEvent } from './events.svelte';

function event(name: string, state: string): EventSummary {
  return {
    id: name,
    name,
    slug: name.toLowerCase(),
    description: '',
    state,
    participation: 'individual',
    modes: ['jeopardy'],
    scoreboard_frozen: false,
    scoreboard_hidden: false
  };
}

function challenge(name: string, category: string, position: number): ChallengeSummary {
  return {
    id: name,
    event_id: 'event',
    name,
    category,
    description: '',
    kind: { type: 'static_flag' },
    state: 'published',
    scoring: { kind: 'static', points: 100 },
    visibility: { division_ids: [], prerequisites: [] },
    tags: [],
    writeups_enabled: false,
    position,
    survey: []
  };
}

describe('event projections', () => {
  it('prefers live play and remains deterministic within a lifecycle', () => {
    expect(chooseDefaultEvent([event('Zulu', 'draft'), event('Beta', 'live')])?.name).toBe('Beta');
    expect(chooseDefaultEvent([event('Zulu', 'live'), event('Alpha', 'live')])?.name).toBe('Alpha');
    expect(chooseDefaultEvent([])).toBeNull();
  });

  it('groups board challenges by category and stable board position', () => {
    const groups = challengeCategories([
      challenge('Second', 'Web', 2),
      challenge('First', 'Web', 1),
      challenge('Binary', 'Pwn', 0)
    ]);
    expect([...groups.keys()]).toEqual(['Web', 'Pwn']);
    expect(groups.get('Web')?.map((item) => item.name)).toEqual(['First', 'Second']);
  });
});
