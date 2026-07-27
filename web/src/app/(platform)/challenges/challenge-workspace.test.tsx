import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChallengeWorkspace, type ChallengeWorkspaceActions } from './challenge-workspace';
import type { ChallengeSummary } from '@/lib/api/client';
import { createChallengeExperience, type ChallengeExperience } from '@/lib/challenges';

function challenge(overrides: Partial<ChallengeSummary> = {}): ChallengeSummary {
  return {
    category: 'Web',
    description: 'Trace the request through the shrine.',
    event_id: 'event',
    id: 'challenge',
    kind: {
      type: 'static_flag'
    },
    max_attempts: 5,
    name: 'Shrine gate',
    position: 0,
    scoring: {
      kind: 'static',
      points: 300
    },
    solved: false,
    state: 'published',
    survey: [],
    tags: ['request'],
    visibility: {
      division_ids: [],
      prerequisites: [],
      visible_from: null,
      visible_until: null
    },
    writeups_enabled: false,
    ...overrides
  };
}

function actions(): ChallengeWorkspaceActions {
  return {
    loadHints: vi.fn().mockResolvedValue([]),
    loadWriteup: vi.fn().mockResolvedValue(null),
    saveWriteup: vi.fn(),
    submitAnswer: vi.fn(),
    submitSurvey: vi.fn().mockResolvedValue({
      answers: {
        clarity: 4
      },
      challenge_id: 'survey',
      id: 'response',
      submitted_at: new Date().toISOString()
    }),
    unlockHint: vi.fn()
  };
}

function renderWorkspace(
  challenges: ChallengeExperience[],
  selectedChallengeId: string | null,
  workspaceActions = actions()
) {
  render(
    <ChallengeWorkspace
      actions={workspaceActions}
      challenges={challenges}
      currentCompetitor={{ id: 'foxden', name: 'Foxden' }}
      eventId="event"
      eventName="Foxden Invitational"
      getChallengeHref={(challengeId) => `/challenges?challenge=${challengeId}`}
      onClearSelection={vi.fn()}
      onSelectChallenge={vi.fn()}
      selectedChallengeId={selectedChallengeId}
    />
  );

  return workspaceActions;
}

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    matches: query === '(min-width: 48rem)',
    media: query,
    removeEventListener: vi.fn()
  }));
});

describe('ChallengeWorkspace', () => {
  it('shows grouped rows and an event overview before selection', () => {
    renderWorkspace(
      [
        createChallengeExperience(challenge(), {
          solveCount: 18
        })
      ],
      null
    );

    expect(screen.getByRole('heading', { name: 'Foxden Invitational' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Your run' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Around your rank' })).toBeVisible();
    const challengeFieldHeading = screen.getByRole('heading', { name: 'Challenge field' });
    const challengeField = screen.getByRole('region', { name: 'Challenge field' });
    expect(challengeFieldHeading).toBeVisible();
    expect(challengeFieldHeading.parentElement).toHaveClass('px-3');
    expect(screen.getByText('18 recorded solves')).toBeVisible();
    expect(screen.getByLabelText('0 of 1 challenges solved')).toHaveClass('px-3');
    expect(within(challengeField).getByText('Progress').parentElement).toHaveClass('grid-cols-12');
    expect(screen.getByLabelText('0 of 1 Web challenges solved').parentElement).toHaveClass(
      'xl:col-span-7'
    );
    expect(
      within(screen.getByRole('region', { name: 'Your run' })).getAllByRole('link', {
        name: 'Open Shrine gate, 300 pts, 18 solves, Unsolved'
      })[0]
    ).toHaveAttribute('href', '/challenges?challenge=challenge');
    expect(screen.getAllByText('Web')[0]).toBeVisible();
    expect(screen.getAllByText('18 solves')[0]).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Challenge list width' })).toHaveValue('38');
    expect(screen.getByRole('button', { name: /Web/ }).closest('h2')).toHaveClass(
      'sticky',
      'top-24'
    );
  });

  it('starts with every category expanded and keeps categories independently open', () => {
    renderWorkspace(
      [
        createChallengeExperience(
          challenge({
            id: 'web',
            name: 'Web trail'
          })
        ),
        createChallengeExperience(
          challenge({
            category: 'Crypto',
            id: 'crypto',
            name: 'Crypto trail'
          })
        )
      ],
      null
    );

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });

    expect(within(challengeList).getByRole('link', { name: /Web trail/ })).toBeVisible();
    expect(within(challengeList).getByRole('link', { name: /Crypto trail/ })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Web/ }));

    expect(
      within(challengeList).queryByRole('link', { name: /Web trail/ })
    ).not.toBeInTheDocument();
    expect(within(challengeList).getByRole('link', { name: /Crypto trail/ })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Web/ }));

    expect(within(challengeList).getByRole('link', { name: /Web trail/ })).toBeVisible();
    expect(within(challengeList).getByRole('link', { name: /Crypto trail/ })).toBeVisible();
  });

  it('supports a survey-gated challenge that reveals a normal submission flag', async () => {
    const workspaceActions = actions();
    const gated = createChallengeExperience(
      challenge({
        id: 'survey',
        name: 'Entry survey',
        survey: [
          {
            key: 'clarity',
            prompt: 'How clear was the briefing?',
            range: [1, 5],
            required: true
          }
        ]
      }),
      {
        surveyMode: 'gate',
        surveyRewardFlag: 'kit{survey-complete}'
      }
    );

    renderWorkspace([gated], gated.id, workspaceActions);

    expect(screen.getByRole('heading', { name: 'Entry survey' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: /Entry survey/ })[0]).toHaveAttribute(
      'aria-current',
      'true'
    );
    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal flag' }));

    await waitFor(() => {
      expect(workspaceActions.submitSurvey).toHaveBeenCalledWith('survey', {
        clarity: 4
      });
    });
    expect(await screen.findByText('kit{survey-complete}')).toBeVisible();
    expect(screen.getByLabelText('Flag')).toBeVisible();
  });

  it('persists hide-solved collection preferences', () => {
    renderWorkspace(
      [
        createChallengeExperience(
          challenge({
            id: 'solved',
            name: 'Solved trail',
            solved: true
          })
        ),
        createChallengeExperience(
          challenge({
            id: 'open',
            name: 'Open trail'
          })
        )
      ],
      null
    );

    fireEvent.click(screen.getByRole('button', { name: 'Hide solved challenges' }));

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    expect(
      within(challengeList).queryByRole('link', { name: /Solved trail/ })
    ).not.toBeInTheDocument();
    expect(within(challengeList).getByRole('link', { name: /Open trail/ })).toBeVisible();
    expect(window.localStorage.getItem('kitsune.challenge-preferences.v2.event')).toContain(
      '"hideSolved":true'
    );
  });

  it('shows podium context and a complete solve timeline with the current competitor', () => {
    const solved = createChallengeExperience(
      challenge({
        id: 'solved-timeline',
        name: 'Solved timeline',
        solved: true
      }),
      {
        solveCount: 18
      }
    );

    renderWorkspace([solved], solved.id);

    expect(screen.getByLabelText('Challenge solve context')).toBeVisible();
    expect(screen.getAllByText('Foxden').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Solved timeline/ })).toHaveAttribute(
      'aria-current',
      'true'
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Solves 18' }));

    const standings = screen.getByRole('list', { name: 'Solve standings' });
    expect(within(standings).getAllByRole('listitem').length).toBeGreaterThanOrEqual(18);
    expect(within(standings).getAllByText('First blood').length).toBeGreaterThan(0);
    expect(within(standings).getAllByText(/UTC/).length).toBeGreaterThan(0);
    expect(within(standings).getAllByText('Foxden').length).toBeGreaterThan(0);
  });

  it('replaces the full-width submission action with an in-place solved status', async () => {
    const workspaceActions = actions();
    workspaceActions.submitAnswer = vi.fn().mockResolvedValue({
      attempts_remaining: 4,
      awarded_points: 300,
      challenge_id: 'challenge',
      first_blood: false,
      id: 'submission',
      outcome: 'correct',
      replayed: false,
      submitted_at: '2026-07-23T12:00:00Z'
    });

    renderWorkspace(
      [createChallengeExperience(challenge(), { solveCount: 4 })],
      'challenge',
      workspaceActions
    );

    fireEvent.change(screen.getByLabelText('Flag'), {
      target: {
        value: 'kit{correct}'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit flag' }));

    await waitFor(() => {
      expect(workspaceActions.submitAnswer).toHaveBeenCalledWith('challenge', 'kit{correct}');
    });
    expect(screen.queryByRole('button', { name: 'Submit flag' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Challenge solved').length).toBeGreaterThan(0);
  });
});
