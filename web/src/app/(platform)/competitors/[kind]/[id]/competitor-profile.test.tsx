import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CompetitorProfileView } from './competitor-profile';
import type { CompetitorProfile, EventSummary } from '@/lib/api/client';
import {
  competitorKindLabel,
  competitorMembershipLabel,
  competitorProfileHref,
  formatCompetitorTimestamp,
  normalizeCompetitorProfile,
  parseCompetitorKind
} from '@/lib/competitors';

vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({
    actions,
    description,
    title
  }: {
    actions?: ReactNode;
    description?: ReactNode;
    title: ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {description}
      {actions}
    </header>
  )
}));

const event: EventSummary = {
  description: 'A live event.',
  ends_at: '2026-07-24T18:00:00Z',
  id: 'event-1',
  modes: ['jeopardy'],
  name: 'Foxden Invitational',
  participation: 'team',
  scoreboard_frozen: false,
  scoreboard_hidden: false,
  slug: 'foxden-invitational',
  starts_at: '2026-07-24T12:00:00Z',
  state: 'live',
  team_size_limit: 4
};

function profile(overrides: Partial<CompetitorProfile> = {}): CompetitorProfile {
  return {
    competitor_id: 'team-1',
    competitor_kind: 'team',
    created_at: '2026-07-01T08:00:00Z',
    members: [
      {
        captain: true,
        display_name: 'Rei',
        joined_at: '2026-07-02T08:00:00Z',
        user_id: 'user-1'
      }
    ],
    name: 'Foxden',
    recent_solves: [
      {
        awarded_points: 450,
        category: 'Web',
        challenge_id: 'challenge-1',
        challenge_name: 'Shrine gate',
        first_blood: true,
        solved_at: '2026-07-24T13:30:00Z'
      }
    ],
    registration: {
      bracket_id: 'bracket-1',
      bracket_name: 'Open',
      division_id: 'division-1',
      division_name: 'Collegiate',
      registered_at: '2026-07-10T10:00:00Z'
    },
    scoreboard_frozen: false,
    scoreboard_hidden: false,
    standing: {
      rank: 2,
      reached_at: '2026-07-24T13:30:00Z',
      score: 1450,
      solves: 6
    },
    teams: [],
    ...overrides
  };
}

describe('competitor profile helpers', () => {
  it('builds stable profile links and labels supported kinds', () => {
    expect(parseCompetitorKind('user')).toBe('user');
    expect(parseCompetitorKind('team')).toBe('team');
    expect(parseCompetitorKind('organization')).toBeNull();
    expect(competitorProfileHref('team', 'team/one')).toBe('/competitors/team/team%2Fone');
    expect(competitorKindLabel('user')).toBe('Individual');
    expect(competitorMembershipLabel(true)).toBe('Captain');
    expect(competitorMembershipLabel(false)).toBe('Member');
  });

  it('normalizes kind-specific associations and solve order', () => {
    const normalized = normalizeCompetitorProfile(
      profile({
        competitor_id: 'user-1',
        competitor_kind: 'user',
        members: [
          {
            captain: false,
            display_name: 'Unexpected member',
            joined_at: '2026-07-02T08:00:00Z',
            user_id: 'user-2'
          }
        ],
        recent_solves: [
          {
            awarded_points: 100,
            category: 'Crypto',
            challenge_id: 'older',
            challenge_name: 'Older',
            first_blood: false,
            solved_at: '2026-07-24T12:00:00Z'
          },
          {
            awarded_points: 200,
            category: 'Crypto',
            challenge_id: 'newer',
            challenge_name: 'Newer',
            first_blood: false,
            solved_at: '2026-07-24T14:00:00Z'
          }
        ],
        teams: [
          {
            captain: false,
            joined_at: '2026-07-02T08:00:00Z',
            team_id: 'team-1',
            team_name: 'Foxden'
          }
        ]
      })
    );

    expect(normalized.members).toEqual([]);
    expect(normalized.teams).toHaveLength(1);
    expect(normalized.recent_solves.map((solve) => solve.challenge_id)).toEqual(['newer', 'older']);
    expect(formatCompetitorTimestamp('not-a-date')).toBe('Unavailable');
  });

  it('rejects unsupported profile kinds', () => {
    expect(() =>
      normalizeCompetitorProfile(
        profile({
          competitor_kind: 'organization'
        })
      )
    ).toThrow('Kitsune returned an unsupported competitor kind.');
  });
});

describe('CompetitorProfileView', () => {
  it('renders team standing, registration, roster links, and recent solves', () => {
    render(<CompetitorProfileView event={event} profile={normalizeCompetitorProfile(profile())} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Foxden' })).toBeVisible();
    expect(screen.getByText('1,450')).toBeVisible();
    expect(screen.getByText('Collegiate')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Rei' })).toHaveAttribute(
      'href',
      '/competitors/user/user-1'
    );
    expect(screen.getByText('First solve')).toBeVisible();
    expect(screen.getByText('Shrine gate')).toBeVisible();
  });

  it('renders concealed activity and user team associations honestly', () => {
    const hiddenProfile = normalizeCompetitorProfile(
      profile({
        competitor_id: 'user-1',
        competitor_kind: 'user',
        members: [],
        name: 'Rei',
        recent_solves: [],
        registration: null,
        scoreboard_hidden: true,
        standing: null,
        teams: [
          {
            captain: true,
            joined_at: '2026-07-02T08:00:00Z',
            team_id: 'team-1',
            team_name: 'Foxden'
          }
        ]
      })
    );

    render(<CompetitorProfileView event={event} profile={hiddenProfile} />);

    expect(screen.getByText('Standings hidden')).toBeVisible();
    expect(screen.getByText('Solve history unavailable')).toBeVisible();
    expect(screen.getByText('Not registered')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Foxden' })).toHaveAttribute(
      'href',
      '/competitors/team/team-1'
    );
    expect(screen.queryByText('No visible solves for this event.')).not.toBeInTheDocument();
  });
});
