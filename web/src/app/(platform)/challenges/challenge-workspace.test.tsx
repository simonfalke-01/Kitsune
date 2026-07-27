import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlagSubmitSuccessEffect } from './challenge-presentation';
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
  workspaceActions = actions(),
  flagSubmitSuccessEffect?: FlagSubmitSuccessEffect
) {
  render(
    <ChallengeWorkspace
      actions={workspaceActions}
      challenges={challenges}
      currentCompetitor={{ id: 'foxden', name: 'Foxden' }}
      eventId="event"
      eventName="Foxden Invitational"
      flagSubmitSuccessEffect={flagSubmitSuccessEffect}
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
    expect(screen.queryByRole('button', { name: 'Chart data' })).not.toBeInTheDocument();
    const challengeFieldHeading = screen.getByRole('heading', { name: 'Challenge field' });
    const challengeField = screen.getByRole('region', { name: 'Challenge field' });
    const overview = screen.getByRole('heading', { name: 'Your run' }).closest('section');
    const categoryBreakdown = screen.getByRole('list', { name: 'Category breakdown' });
    const categoryScrollOwner = categoryBreakdown.parentElement;
    expect(challengeFieldHeading).toBeVisible();
    expect(challengeFieldHeading.parentElement).toHaveClass('px-3');
    expect(overview).toHaveClass('overflow-hidden');
    expect(challengeField).toHaveClass('min-h-0', 'flex-1');
    expect(categoryScrollOwner).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(categoryScrollOwner).not.toContainElement(screen.getByText('Progress'));
    expect(categoryScrollOwner).not.toContainElement(
      screen.getByLabelText('0 of 1 challenges solved')
    );
    expect(screen.getByText('18 recorded solves')).toBeVisible();
    expect(screen.getByLabelText('0 of 1 challenges solved')).toHaveClass('px-3');
    expect(within(challengeField).getByText('Progress').parentElement).toHaveClass('grid-cols-12');
    expect(screen.getByLabelText('0 of 1 Web challenges solved').parentElement).toHaveClass(
      'xl:col-span-7'
    );
    expect(screen.getByLabelText('0 of 1 Web challenges solved').closest('li')).toHaveClass('py-0');
    expect(
      within(screen.getByRole('region', { name: 'Your run' })).getAllByRole('link', {
        name: 'Open Shrine gate, 300 pts, 18 solves, Unsolved'
      })[0]
    ).toHaveAttribute('href', '/challenges?challenge=challenge');
    expect(screen.getAllByText('Web')[0]).toBeVisible();
    expect(screen.getAllByText('18 solves')[0]).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Challenge list width' })).toHaveValue('34');
    expect(screen.getByRole('slider', { name: 'Challenge list width' })).toHaveAttribute(
      'min',
      '24'
    );
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

  it('changes selection and detail in the activation frame before URL synchronization', () => {
    renderWorkspace(
      [
        createChallengeExperience(
          challenge({
            id: 'first',
            name: 'First trail'
          })
        ),
        createChallengeExperience(
          challenge({
            id: 'second',
            name: 'Second trail',
            position: 1
          })
        )
      ],
      'first'
    );

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    const first = within(challengeList).getByRole('link', { name: /First trail/ });
    const second = within(challengeList).getByRole('link', { name: /Second trail/ });

    expect(first).toHaveAttribute('aria-current', 'true');
    fireEvent.click(second);

    expect(second).toHaveAttribute('aria-current', 'true');
    expect(second).toHaveClass('ring-1', 'ring-accent-border');
    expect(first).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { name: 'Second trail' })).toBeVisible();
  });

  it('packs solved progress segments before unsolved segments', () => {
    renderWorkspace(
      [
        createChallengeExperience(
          challenge({
            id: 'open-first',
            name: 'Open first',
            position: 0
          })
        ),
        createChallengeExperience(
          challenge({
            id: 'solved-second',
            name: 'Solved second',
            position: 1,
            solved: true
          })
        )
      ],
      null
    );

    const overallProgress = screen.getByLabelText('1 of 2 challenges solved');
    const categoryProgress = screen.getByLabelText('1 of 2 Web challenges solved');
    const overallSegments = within(overallProgress).getAllByRole('link');
    const segments = within(categoryProgress).getAllByRole('link');

    expect(overallSegments[0]).toHaveAccessibleName(/Open Open first/);
    expect(overallSegments[1]).toHaveAccessibleName(/Open Solved second/);
    expect(segments[0]).toHaveAccessibleName(/Open Solved second/);
    expect(segments[1]).toHaveAccessibleName(/Open Open first/);
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
        id: 'blood-5',
        name: 'Solved timeline',
        solved: true
      }),
      {
        solveCount: 18
      }
    );

    renderWorkspace([solved], solved.id);

    const solveStrip = screen.getByLabelText('Challenge solve context');
    const solveStripRows = within(solveStrip).getAllByRole('listitem');
    expect(solveStrip).toBeVisible();
    expect(solveStripRows).toHaveLength(4);
    for (const row of solveStripRows) {
      expect(row).toHaveClass('flex', 'min-h-control', 'items-center');
      expect(row).not.toHaveClass('grid');
    }
    expect(screen.getAllByText('Foxden').length).toBeGreaterThan(0);
    const selectedChallenge = screen.getByRole('link', { name: /Solved timeline/ });
    const firstBlood = within(selectedChallenge).getByText('First blood');
    expect(selectedChallenge).toHaveAttribute('aria-current', 'true');
    expect(selectedChallenge).toHaveAttribute('data-solved', 'true');
    expect(selectedChallenge).toHaveAttribute('data-blood', '1');
    expect(selectedChallenge).toHaveClass('ring-1', 'ring-accent-border');
    expect(selectedChallenge.querySelector('.kitsune-collection-marker')).toBeInTheDocument();
    expect(firstBlood.querySelector('svg')).toHaveClass('-translate-y-optical');

    fireEvent.click(screen.getByRole('tab', { name: 'Solves 18' }));

    const standings = screen.getByRole('list', { name: 'Solve standings' });
    expect(within(standings).getAllByRole('listitem').length).toBeGreaterThanOrEqual(18);
    expect(within(standings).getAllByText('First blood').length).toBeGreaterThan(0);
    expect(within(standings).getAllByText(/UTC/).length).toBeGreaterThan(0);
    expect(within(standings).getAllByText('Foxden').length).toBeGreaterThan(0);
  });

  it('preserves the solved dock and emits the default edge border', async () => {
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

    const flagField = screen.getByLabelText('Flag');
    expect(flagField).toHaveClass('h-control', 'px-3', 'text-base');
    const origin = new DOMRect(120, 600, 400, 44);
    vi.spyOn(flagField, 'getBoundingClientRect').mockReturnValue(origin);

    fireEvent.change(flagField, {
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
    const solvedLabel = screen.getByText('Flag');
    const solvedSummary = solvedLabel.parentElement;
    const solvedMessage = within(solvedSummary as HTMLElement).getByText('Challenge solved');
    const selectedChallenge = screen.getByRole('link', { name: /Shrine gate/ });
    expect(solvedSummary).toHaveClass('grid', 'gap-2');
    expect(solvedLabel).toHaveClass('text-sm', 'font-medium');
    expect(solvedMessage).toHaveClass('text-base', 'font-medium');
    expect(solvedMessage.parentElement).toHaveClass('h-control', 'border', 'px-3');
    expect(selectedChallenge).toHaveAttribute('aria-current', 'true');
    expect(selectedChallenge).toHaveAttribute('data-solved', 'true');
    expect(selectedChallenge).toHaveClass('ring-1', 'ring-accent-border');
    expect(selectedChallenge).not.toHaveAttribute('data-newly-solved');
    const solveEffect = document.querySelector('.kitsune-solve-effect');
    const edgeFrame = document.querySelector('.kitsune-solve-edge-frame');
    expect(solveEffect?.parentElement).toBe(document.body);
    expect(solveEffect).toHaveClass('fixed', 'inset-0', 'z-celebration');
    expect(solveEffect).not.toHaveAttribute('data-first-blood');
    expect(edgeFrame?.tagName.toLowerCase()).toBe('span');
    expect(edgeFrame).toHaveClass('inset-0');
    expect(edgeFrame).toBeEmptyDOMElement();
    expect(edgeFrame?.querySelector('svg')).not.toBeInTheDocument();
    expect(edgeFrame?.parentElement).toBe(solveEffect);
    expect(document.querySelector('.kitsune-solve-edge-wash')).not.toBeInTheDocument();
    expect(document.querySelector('.kitsune-solve-origin')).not.toBeInTheDocument();
    expect(document.querySelector('.kitsune-solve-wave')).not.toBeInTheDocument();
  });

  it('keeps the full-screen imprint available as a presentation setting', async () => {
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
      workspaceActions,
      'screen-imprint'
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

    const solveEffect = document.querySelector('.kitsune-solve-effect');
    expect(document.querySelector('.kitsune-solve-edge-frame')?.parentElement).toBe(solveEffect);
    expect(document.querySelector('.kitsune-solve-edge-frame')).toHaveClass('inset-0');
    expect(document.querySelector('.kitsune-solve-edge-frame')).toBeEmptyDOMElement();
    expect(document.querySelector('.kitsune-solve-edge-frame svg')).not.toBeInTheDocument();
    expect(document.querySelector('.kitsune-solve-edge-wash')?.parentElement).toBe(solveEffect);
  });

  it('keeps the field wave available as a presentation setting', async () => {
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
      workspaceActions,
      'field-wave'
    );
    const flagField = screen.getByLabelText('Flag');
    const origin = new DOMRect(120, 600, 400, 44);
    vi.spyOn(flagField, 'getBoundingClientRect').mockReturnValue(origin);
    fireEvent.change(flagField, {
      target: {
        value: 'kit{correct}'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit flag' }));

    await waitFor(() => {
      expect(workspaceActions.submitAnswer).toHaveBeenCalledWith('challenge', 'kit{correct}');
    });

    const solveEffect = document.querySelector('.kitsune-solve-effect');
    const solveOrigin = document.querySelector('.kitsune-solve-origin');
    const solveWave = document.querySelector('.kitsune-solve-wave');
    const x = origin.left + origin.width / 2;
    const y = origin.top + origin.height / 2;
    const farthestCorner = Math.max(
      Math.hypot(x, y),
      Math.hypot(window.innerWidth - x, y),
      Math.hypot(x, window.innerHeight - y),
      Math.hypot(window.innerWidth - x, window.innerHeight - y)
    );
    const diameter = farthestCorner * 2;
    expect(solveEffect?.parentElement).toBe(document.body);
    expect(solveEffect).toHaveClass('fixed', 'inset-0', 'z-celebration');
    expect(solveEffect).not.toHaveAttribute('data-first-blood');
    expect(solveOrigin).toHaveClass('rounded-md', 'border', 'font-mono');
    expect(solveOrigin).not.toHaveClass('rounded-full');
    expect(solveOrigin).toHaveTextContent('kit{correct}');
    expect(solveWave).toHaveClass('aspect-square', 'rounded-full');
    expect(solveEffect).toHaveStyle({
      '--solve-origin-height': `${origin.height}px`,
      '--solve-origin-left': `${origin.left}px`,
      '--solve-origin-top': `${origin.top}px`,
      '--solve-origin-width': `${origin.width}px`,
      '--solve-wave-diameter': `${diameter}px`,
      '--solve-wave-start-scale': String(Math.min(origin.width, origin.height) / diameter),
      '--solve-wave-x': `${x}px`,
      '--solve-wave-y': `${y}px`
    });
  });

  it.each([
    ['edge-border', '.kitsune-solve-edge-frame'],
    ['screen-imprint', '.kitsune-solve-edge-wash'],
    ['field-wave', '.kitsune-solve-wave']
  ] as const)('uses one first-blood gold state for the %s effect', async (effect, effectPart) => {
    const workspaceActions = actions();
    workspaceActions.submitAnswer = vi.fn().mockResolvedValue({
      attempts_remaining: 4,
      awarded_points: 300,
      challenge_id: 'challenge',
      first_blood: true,
      id: 'submission',
      outcome: 'correct',
      replayed: false,
      submitted_at: '2026-07-23T12:00:00Z'
    });
    renderWorkspace(
      [createChallengeExperience(challenge(), { solveCount: 0 })],
      'challenge',
      workspaceActions,
      effect
    );
    const flagField = screen.getByLabelText('Flag');
    vi.spyOn(flagField, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 600, 400, 44));
    fireEvent.change(flagField, {
      target: {
        value: 'kit{first}'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit flag' }));

    await waitFor(() => {
      expect(workspaceActions.submitAnswer).toHaveBeenCalledWith('challenge', 'kit{first}');
    });

    const solveEffect = document.querySelector('.kitsune-solve-effect');
    const solvedMessage = screen.getByText('Challenge solved');
    const solvedSummary = solvedMessage.closest('[data-first-blood]');
    const selectedChallenge = screen.getByRole('link', { name: /Shrine gate/ });
    expect(solveEffect).toHaveAttribute('data-first-blood', 'true');
    expect(solveEffect?.querySelector(effectPart)).toBeInTheDocument();
    expect(solvedSummary).toHaveAttribute('data-first-blood', 'true');
    expect(solvedMessage.parentElement).toHaveClass('text-first-blood-text');
    expect(selectedChallenge).toHaveAttribute('data-blood', '1');
    expect(screen.getAllByText('First blood').length).toBeGreaterThan(0);
  });

  it('supports disabling the flag success effect', async () => {
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
      workspaceActions,
      'none'
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

    expect(screen.getAllByText('Challenge solved').length).toBeGreaterThan(0);
    expect(document.querySelector('.kitsune-solve-effect')).not.toBeInTheDocument();
  });

  it('does not emit a success effect for an incorrect flag', async () => {
    const workspaceActions = actions();
    workspaceActions.submitAnswer = vi.fn().mockResolvedValue({
      attempts_remaining: 3,
      awarded_points: 0,
      challenge_id: 'challenge',
      first_blood: false,
      id: 'submission',
      outcome: 'incorrect',
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
        value: 'kit{incorrect}'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit flag' }));

    expect(await screen.findByText('Incorrect. 3 attempts remain.')).toBeVisible();
    expect(document.querySelector('.kitsune-solve-effect')).not.toBeInTheDocument();
  });
});
