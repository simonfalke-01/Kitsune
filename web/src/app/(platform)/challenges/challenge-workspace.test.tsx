import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/app/session-context';
import { ThemeProvider } from '@/app/theme-context';
import { EscapeFocusManager } from '@/components/ui';
import type {
  FirstBloodEdgeColor,
  FirstBloodHighlightColor,
  FlagSubmitSuccessEffect
} from './challenge-presentation';
import {
  rememberChallengeListScroll,
  rememberChallengeScroll,
  type ChallengeDetailTab
} from './challenge-workspace-memory';
import { ChallengeWorkspace, type ChallengeWorkspaceActions } from './challenge-workspace';
import type { ChallengePresenceMember, ChallengeSummary } from '@/lib/api/client';
import { createChallengeExperience, type ChallengeExperience } from '@/lib/challenges';

vi.mock('next/navigation', () => ({
  usePathname: () => '/challenges',
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn()
  })
}));

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
  flagSubmitSuccessEffect?: FlagSubmitSuccessEffect,
  selectedChallengeTab: ChallengeDetailTab = 'details',
  firstBloodHighlightColor?: FirstBloodHighlightColor,
  firstBloodEdgeColor?: FirstBloodEdgeColor,
  presenceMembers: ChallengePresenceMember[] = []
) {
  render(
    <ThemeProvider>
      <EscapeFocusManager />
      <SessionProvider initialSession={null}>
        <ChallengeWorkspace
          actions={workspaceActions}
          challenges={challenges}
          currentCompetitor={{ id: 'foxden', name: 'Foxden' }}
          eventId="event"
          eventName="Foxden Invitational"
          firstBloodEdgeColor={firstBloodEdgeColor}
          firstBloodHighlightColor={firstBloodHighlightColor}
          flagSubmitSuccessEffect={flagSubmitSuccessEffect}
          getChallengeHref={(challengeId) => `/challenges?challenge=${challengeId}`}
          onClearSelection={vi.fn()}
          onSelectChallenge={vi.fn()}
          presenceMembers={presenceMembers}
          selectedChallengeId={selectedChallengeId}
          selectedChallengeTab={selectedChallengeTab}
        />
      </SessionProvider>
    </ThemeProvider>
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
  it('shows teammate presence only in the challenge row', () => {
    const presence = [
      {
        challenge_id: 'challenge',
        display_name: 'Mina Park',
        updated_at: '2026-07-28T04:00:00Z',
        user_id: 'mina'
      }
    ];
    renderWorkspace(
      [createChallengeExperience(challenge(), { solveCount: 18 })],
      'challenge',
      actions(),
      undefined,
      'details',
      undefined,
      undefined,
      presence
    );

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    const challengeRow = within(challengeList).getByRole('button', { name: /Shrine gate/ });
    expect(within(challengeRow).getByText('Mina Park viewing')).toBeVisible();
    expect(
      within(screen.getByRole('article', { name: 'Shrine gate details' })).queryByText(
        'Mina Park viewing'
      )
    ).not.toBeInTheDocument();
  });

  it('copies the selected challenge deep link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    renderWorkspace([createChallengeExperience(challenge())], 'challenge');

    fireEvent.click(screen.getByRole('button', { name: 'Copy challenge link' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringMatching(/\/challenges\?challenge=challenge$/)
      );
    });
    expect(screen.getByRole('button', { name: 'Challenge link copied' })).toBeVisible();
  });

  it('shows grouped rows with a quiet selection prompt before selection', () => {
    renderWorkspace(
      [
        createChallengeExperience(challenge(), {
          solveCount: 18
        })
      ],
      null
    );

    expect(screen.getByRole('heading', { name: 'Foxden Invitational' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Player' })).toContainElement(
      screen.getByRole('link', { name: 'Challenges' })
    );
    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    const workspace = challengeList.closest('.kitsune-split-workspace');
    const detailPane = workspace?.children.item(1);
    expect(within(challengeList).getByRole('button', { name: /Shrine gate/ })).toBeVisible();
    const selectionPrompt = within(detailPane as HTMLElement).getByRole('heading', {
      name: 'No challenge selected'
    });
    expect(selectionPrompt).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Challenge list width' })).toHaveValue('34');
    expect(screen.getByRole('button', { name: /Web/ }).closest('h2')).toHaveClass(
      'sticky',
      'top-challenge-list-header'
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

    expect(within(challengeList).getByRole('button', { name: /Web trail/ })).toBeVisible();
    expect(within(challengeList).getByRole('button', { name: /Crypto trail/ })).toBeVisible();
    const webCategory = within(challengeList).getByText('Web').closest('button');

    fireEvent.click(webCategory!);

    expect(
      within(challengeList).queryByRole('button', { name: /Web trail/ })
    ).not.toBeInTheDocument();
    expect(within(challengeList).getByRole('button', { name: /Crypto trail/ })).toBeVisible();

    fireEvent.click(webCategory!);

    expect(within(challengeList).getByRole('button', { name: /Web trail/ })).toBeVisible();
    expect(within(challengeList).getByRole('button', { name: /Crypto trail/ })).toBeVisible();
  });

  it('restores the challenge list, URL-selected tab, and detail scroll positions', async () => {
    rememberChallengeListScroll('event', 84);
    rememberChallengeScroll('event', 'challenge', 'solves', 220);

    renderWorkspace(
      [createChallengeExperience(challenge(), { solveCount: 4 })],
      'challenge',
      actions(),
      undefined,
      'solves'
    );

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    const listScrollOwner = challengeList.closest('.kitsune-scroll-region');
    const selectedPanel = screen.getByRole('tabpanel');

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '4 Solves' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(listScrollOwner?.scrollTop).toBe(84);
      expect(selectedPanel.scrollTop).toBe(220);
    });
  });

  it('moves selection through visible challenge rows with J and K', () => {
    renderWorkspace(
      [
        createChallengeExperience(challenge({ id: 'first', name: 'First trail' })),
        createChallengeExperience(challenge({ id: 'second', name: 'Second trail', position: 1 }))
      ],
      null
    );

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    const first = within(challengeList).getByRole('button', { name: /First trail/ });
    const second = within(challengeList).getByRole('button', { name: /Second trail/ });

    fireEvent.keyDown(window, { key: 'j' });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { name: 'First trail' })).toBeVisible();

    fireEvent.keyDown(first, { key: 'j' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-current', 'true');
    expect(first).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { name: 'Second trail' })).toBeVisible();

    fireEvent.keyDown(second, { key: 'k' });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-current', 'true');
  });

  it('opens Details when a different challenge is selected', () => {
    renderWorkspace(
      [
        createChallengeExperience(challenge({ id: 'first', name: 'First trail' }), {
          solveCount: 4
        }),
        createChallengeExperience(challenge({ id: 'second', name: 'Second trail', position: 1 }))
      ],
      'first'
    );

    fireEvent.click(screen.getByRole('tab', { name: '4 Solves' }));
    expect(screen.getByRole('tab', { name: '4 Solves' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Second trail/ }));

    expect(screen.getByRole('heading', { name: 'Second trail' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  });

  it('focuses search, switches detail tabs, and ignores shortcuts while typing', () => {
    renderWorkspace([createChallengeExperience(challenge(), { solveCount: 4 })], 'challenge');

    fireEvent.keyDown(window, { key: '/' });
    const search = screen.getByRole('searchbox', { name: 'Search challenges' });
    expect(search).toHaveFocus();

    fireEvent.keyDown(search, { key: 's' });
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).not.toHaveFocus();
    fireEvent.keyDown(window, { key: 's' });
    expect(screen.getByRole('tab', { name: '4 Solves' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(window, { key: 'h' });
    expect(screen.getByRole('tab', { name: 'Hints' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(window, { key: 'd' });
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the challenge browser out of sequential Tab order', () => {
    renderWorkspace([createChallengeExperience(challenge())], 'challenge');

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    expect(challengeList).toHaveAttribute('aria-keyshortcuts', '/ J K X E F');
    const interactiveElements = challengeList.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea'
    );
    expect(interactiveElements.length).toBeGreaterThan(0);
    for (const element of interactiveElements) {
      expect(element.tabIndex).toBe(-1);
    }
    expect(challengeList.closest('.kitsune-scroll-region')).toHaveAttribute('tabindex', '-1');
    expect(screen.queryByRole('link', { name: 'Skip challenge list' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to challenge search' })).toHaveAttribute(
      'href',
      '#challenge-search'
    );
    expect(screen.getByRole('searchbox', { name: 'Search challenges' })).toHaveAttribute(
      'id',
      'challenge-search'
    );
    expect(screen.getByRole('searchbox', { name: 'Search challenges' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('focuses the flag field with A, releases it with Escape, and resumes shortcuts', () => {
    renderWorkspace([createChallengeExperience(challenge(), { solveCount: 4 })], 'challenge');

    const flag = screen.getByLabelText('Flag');
    fireEvent.keyDown(window, { key: 'a' });

    expect(flag).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(flag, { key: 'Escape' });
    expect(flag).not.toHaveFocus();

    fireEvent.keyDown(window, { key: 's' });
    expect(screen.getByRole('tab', { name: '4 Solves' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps locked hint state, cost, and confirmation together', async () => {
    const workspaceActions = actions();
    workspaceActions.loadHints = vi.fn().mockResolvedValue([
      {
        content: null,
        cost: 10,
        id: 1,
        unlocked: false
      }
    ]);
    renderWorkspace([createChallengeExperience(challenge())], 'challenge', workspaceActions);

    fireEvent.click(screen.getByRole('tab', { name: 'Hints' }));

    const hintTitle = await screen.findByText('Hint 1');
    const hintRow = hintTitle.parentElement?.parentElement;
    expect(within(hintRow as HTMLElement).getByText('Locked')).toBeVisible();
    expect(within(hintRow as HTMLElement).getByText('10 pts')).toBeVisible();
    const unlock = within(hintRow as HTMLElement).getByRole('button', { name: 'Unlock hint' });

    fireEvent.click(unlock);
    expect(await screen.findByRole('alertdialog', { name: 'Unlock hint?' })).toHaveTextContent(
      '10 points will be deducted'
    );
  });

  it('returns from search to the selected row before J and K navigation resumes', () => {
    renderWorkspace(
      [
        createChallengeExperience(challenge({ id: 'first', name: 'First trail' })),
        createChallengeExperience(challenge({ id: 'second', name: 'Second trail', position: 1 }))
      ],
      'first'
    );

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    const first = within(challengeList).getByRole('button', { name: /First trail/ });
    const second = within(challengeList).getByRole('button', { name: /Second trail/ });

    fireEvent.keyDown(window, { key: '/' });
    const search = screen.getByRole('searchbox', { name: 'Search challenges' });
    expect(search).toHaveFocus();

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(window, { key: 'j' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-current', 'true');
    expect(first).not.toHaveAttribute('aria-current');
  });

  it('resizes the challenge list and exposes a shortcut reference', async () => {
    renderWorkspace([createChallengeExperience(challenge())], null);

    fireEvent.keyDown(window, { key: ']' });

    expect(screen.getByRole('slider', { name: 'Challenge list width' })).toHaveValue('38');
    expect(window.localStorage.getItem('kitsune.split-workspace.v1.challenge-list')).toBe('38');

    fireEvent.keyDown(window, { key: '?' });

    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Move challenge selection')).toBeVisible();
    expect(within(dialog).getByText('Toggle solved challenges')).toBeVisible();
    expect(within(dialog).getByText('Toggle challenge categories')).toBeVisible();
    expect(within(dialog).getByText('Resize challenge list')).toBeVisible();
    expect(within(dialog).getByText('Toggle challenge list')).toBeVisible();
    expect(within(dialog).getByText('Focus answer field')).toBeVisible();

    fireEvent.keyDown(window, { key: '?' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
    });
  });

  it('enters focus mode without remounting challenge state and restores the split on exit', () => {
    renderWorkspace([createChallengeExperience(challenge())], 'challenge');

    const flag = screen.getByLabelText('Flag');
    const workspace = screen
      .getByRole('slider', { name: 'Challenge list width' })
      .closest('.kitsune-split-workspace');
    fireEvent.change(flag, { target: { value: 'kit{draft}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Collapse challenge list' }));

    expect(workspace).toHaveStyle({
      '--split-workspace-left': 'var(--spacing-collapsed-rail)'
    });
    expect(workspace).toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByRole('complementary', { name: 'Collapsed challenge list' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show challenge list' })).toBeVisible();
    expect(screen.queryByText('0/1')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Challenge list width' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Flag')).toBe(flag);
    expect(screen.getByLabelText('Flag')).toHaveValue('kit{draft}');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Collapse challenge list' })).toBeVisible();
    expect(screen.getByRole('slider', { name: 'Challenge list width' })).toHaveValue('34');
    expect(screen.getByLabelText('Flag')).toBe(flag);

    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.getByRole('button', { name: 'Show challenge list' })).toBeVisible();
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
    const first = within(challengeList).getByRole('button', { name: /First trail/ });
    const second = within(challengeList).getByRole('button', { name: /Second trail/ });

    expect(first).toHaveAttribute('aria-current', 'true');
    fireEvent.click(second);

    expect(second).toHaveAttribute('aria-current', 'true');
    expect(first).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { name: 'Second trail' })).toBeVisible();
  });

  it('shows trusted author metadata beneath an unsolved collection title', () => {
    renderWorkspace(
      [
        createChallengeExperience(challenge(), { authorName: 'simonfalke' }),
        createChallengeExperience(challenge({ id: 'second', name: 'Second trail', position: 1 }), {
          authorName: 'willow'
        })
      ],
      'challenge'
    );

    const title = screen.getByRole('heading', { name: 'Shrine gate' });
    const titleLine = title.parentElement;
    const author = within(titleLine as HTMLElement).getByText('by simonfalke');
    const collectionAuthor = within(
      screen.getByRole('region', { name: 'Challenge list' })
    ).getByText('by simonfalke');
    const unselectedAuthor = within(
      screen.getByRole('region', { name: 'Challenge list' })
    ).getByText('by willow');
    expect(author).toBeVisible();
    expect(collectionAuthor.previousElementSibling).toHaveTextContent('Shrine gate');
    expect(unselectedAuthor.previousElementSibling).toHaveTextContent('Second trail');
    expect(
      within(screen.getByRole('region', { name: 'Challenge list' })).queryByText('Unsolved')
    ).not.toBeInTheDocument();
  });

  it.each([
    [0, '0 Solves'],
    [1, '1 Solve'],
    [2, '2 Solves']
  ] as const)('labels %i recorded solves correctly', (solveCount, label) => {
    renderWorkspace([createChallengeExperience(challenge(), { solveCount })], 'challenge');

    const tab = screen.getByRole('tab', { name: label });
    expect(within(tab).getByText(String(solveCount))).toHaveClass('font-semibold', 'tabular-nums');
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
    expect(screen.getByRole('button', { name: /Entry survey/ })).toHaveAttribute(
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
      within(challengeList).queryByRole('button', { name: /Solved trail/ })
    ).not.toBeInTheDocument();
    expect(within(challengeList).getByRole('button', { name: /Open trail/ })).toBeVisible();
    expect(window.localStorage.getItem('kitsune.challenge-preferences.v2.event')).toContain(
      '"hideSolved":true'
    );
  });

  it('keeps excluded browser controls available through X and E shortcuts', () => {
    renderWorkspace(
      [
        createChallengeExperience(
          challenge({
            id: 'solved',
            name: 'Solved trail',
            solved: true
          })
        ),
        createChallengeExperience(challenge({ id: 'open', name: 'Open trail', position: 1 }))
      ],
      null
    );

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    fireEvent.keyDown(window, { key: 'x' });
    expect(
      within(challengeList).queryByRole('button', { name: /Solved trail/ })
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'e' });
    expect(
      within(challengeList).queryByRole('button', { name: /Open trail/ })
    ).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'e' });
    expect(within(challengeList).getByRole('button', { name: /Open trail/ })).toBeVisible();
  });

  it('hides a selected solved challenge and clears its detail', () => {
    renderWorkspace(
      [
        createChallengeExperience(
          challenge({
            id: 'solved',
            name: 'Solved trail',
            solved: true
          })
        ),
        createChallengeExperience(challenge({ id: 'open', name: 'Open trail' }))
      ],
      'solved'
    );
    const hideSolved = screen.getByRole('button', { name: 'Hide solved challenges' });
    hideSolved.focus();

    fireEvent.click(hideSolved);

    const challengeList = screen.getByRole('region', { name: 'Challenge list' });
    expect(
      within(challengeList).queryByRole('button', { name: /Solved trail/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No challenge selected' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show solved challenges' })).toHaveFocus();
  });

  it('shows podium context and a complete solve timeline with the current competitor', async () => {
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

    const solveStrip = await screen.findByLabelText('Challenge solve context');
    const solveStripList = within(solveStrip).getByRole('list');
    const solveStripRows = within(solveStrip).getAllByRole('listitem');
    await waitFor(() => {
      expect(solveStrip).toBeVisible();
    });
    expect(solveStripList).toBeVisible();
    expect(solveStripRows).toHaveLength(4);
    expect(solveStripRows[0]).toHaveTextContent('1st');
    expect(solveStripRows[1]).toHaveTextContent('2nd');
    expect(solveStripRows[2]).toHaveTextContent('3rd');
    expect(solveStripRows[3]).toHaveTextContent('Foxden');
    expect(within(solveStrip).getAllByText(/^First blood \(.+\)$/).length).toBeGreaterThan(0);
    const selectedChallenge = screen.getByRole('button', { name: /Solved timeline/ });
    expect(selectedChallenge).toHaveAttribute('aria-current', 'true');
    expect(selectedChallenge).toHaveAttribute('data-solved', 'true');
    expect(selectedChallenge).toHaveAttribute('data-blood', '1');
    expect(within(selectedChallenge).getByText('First blood')).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: '18 Solves' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Challenge solve context')).not.toBeInTheDocument();
    });

    const standings = screen.getByRole('list', { name: 'Solve standings' });
    expect(within(standings).getAllByRole('listitem')).toHaveLength(18);
    expect(within(standings).getAllByText(/^First blood \(.+\)$/).length).toBeGreaterThan(0);
    expect(within(standings).getAllByText(/UTC/).length).toBeGreaterThan(0);
    expect(within(standings).getAllByText('Foxden').length).toBeGreaterThan(0);
  });

  it('keeps unsolved podium places quiet and explicit', async () => {
    const open = createChallengeExperience(challenge({ id: 'open-podium' }), {
      solveCount: 0
    });

    renderWorkspace([open], open.id);

    const solveStrip = screen.getByLabelText('Challenge solve context');
    const openStatuses = within(solveStrip).getAllByText('Open');

    expect(openStatuses).toHaveLength(3);
    for (const status of openStatuses) {
      const slot = status.closest('li');
      expect(within(slot!).queryByRole('img')).not.toBeInTheDocument();
    }
    expect(within(solveStrip).queryByText('No solve')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '0 Solves' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Challenge solve context')).not.toBeInTheDocument();
    });
  });

  it('keeps the current competitor at their true solve rank and docks it toward its position', async () => {
    const solved = createChallengeExperience(
      challenge({
        id: 'ordered-0',
        name: 'Ordered timeline',
        solved: true
      }),
      {
        solveCount: 18
      }
    );

    renderWorkspace([solved], solved.id);
    fireEvent.click(screen.getByRole('tab', { name: '18 Solves' }));

    const standings = screen.getByRole('list', { name: 'Solve standings' });
    const rows = within(standings).getAllByRole('listitem');
    const currentRow = within(standings).getByText('Foxden').closest('li');

    expect(rows).toHaveLength(18);
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual(
      Array.from({ length: 18 }, (_, index) => `#${index + 1}`)
    );
    expect(currentRow).toBe(rows[13]);
    expect(currentRow).toHaveAttribute('aria-current', 'true');
    const scrollOwner = currentRow?.closest<HTMLElement>('.kitsune-scroll-region');
    expect(scrollOwner).not.toBeNull();

    vi.spyOn(scrollOwner!, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 100, 600, 400)
    );
    const currentRowBounds = vi.spyOn(currentRow!, 'getBoundingClientRect');

    currentRowBounds.mockReturnValue(new DOMRect(124, 460, 552, 64));
    fireEvent.scroll(scrollOwner!);

    await waitFor(() => {
      expect(document.querySelector('[data-scroll-edge-dock="bottom"]')).toHaveTextContent(
        'Foxden'
      );
    });
  });

  it('replaces a successful submission with solved state across the workspace', async () => {
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
    vi.spyOn(flagField, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 600, 400, 44));

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
    const selectedChallenge = screen.getByRole('button', { name: /Shrine gate/ });
    expect(selectedChallenge).toHaveAttribute('aria-current', 'true');
    expect(selectedChallenge).toHaveAttribute('data-solved', 'true');
    expect(document.querySelector('.kitsune-solve-effect')).toBeInTheDocument();
  });

  it('keeps an incorrect answer editable without adding noisy inline feedback', async () => {
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

    const flagField = screen.getByLabelText('Flag');
    expect(flagField.parentElement?.querySelector('[data-slot="field-error"]')).toBeNull();

    fireEvent.change(flagField, {
      target: {
        value: 'kit{incorrect}'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit flag' }));

    await waitFor(() => {
      expect(workspaceActions.submitAnswer).toHaveBeenCalledWith('challenge', 'kit{incorrect}');
    });
    expect(screen.queryByText(/Incorrect/)).not.toBeInTheDocument();
    expect(flagField).toHaveValue('kit{incorrect}');
    expect(screen.queryByRole('button', { name: 'View attempts' })).not.toBeInTheDocument();
  });
});
