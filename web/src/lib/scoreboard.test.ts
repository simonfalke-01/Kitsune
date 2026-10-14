import { describe, expect, it } from 'vitest';

import type { ScoreboardRow } from './api/client';
import {
  competitorProfilePath,
  filterScoreboardRows,
  parseScoreboardUrlState,
  scoreboardSearchIsActive
} from './scoreboard';

const rows: ScoreboardRow[] = [
  {
    competitor_id: 'team-1',
    competitor_kind: 'team',
    name: 'Foxden',
    rank: 1,
    reached_at: '2026-07-23T10:00:00Z',
    score: 500,
    solves: 2
  },
  {
    competitor_id: 'user-1',
    competitor_kind: 'user',
    name: 'Rei',
    rank: 2,
    reached_at: '2026-07-23T10:05:00Z',
    score: 300,
    solves: 1
  }
];

describe('scoreboard helpers', () => {
  it('activates search at two characters and filters names or kinds', () => {
    expect(scoreboardSearchIsActive('f')).toBe(false);
    expect(scoreboardSearchIsActive('fo')).toBe(true);
    expect(filterScoreboardRows(rows, 'fo')).toEqual([rows[0]]);
    expect(filterScoreboardRows(rows, 'individual')).toEqual([rows[1]]);
  });

  it('parses stable URL state and ignores short search values', () => {
    expect(parseScoreboardUrlState(new URLSearchParams('search=f&division=division-1'))).toEqual({
      divisionId: 'division-1',
      search: ''
    });
    expect(parseScoreboardUrlState(new URLSearchParams('search=fox'))).toEqual({
      divisionId: null,
      search: 'fox'
    });
  });

  it('builds encoded competitor profile paths', () => {
    expect(competitorProfilePath('team', 'team/1')).toBe('/competitors/team/team%2F1');
  });
});
