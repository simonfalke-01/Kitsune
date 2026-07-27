import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionProvider } from '@/app/session-context';
import { ThemeProvider } from '@/app/theme-context';
import type { FlagSubmitSuccessEffect } from './challenge-presentation';
import {
  rememberChallengeListScroll,
  rememberChallengeScroll,
  rememberChallengeTab,
  type ChallengeDetailTab
} from './challenge-workspace-memory';
import { ChallengeWorkspace, type ChallengeWorkspaceActions } from './challenge-workspace';
import type { ChallengeSummary } from '@/lib/api/client';
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
  selectedChallengeTab: ChallengeDetailTab = 'details'
) {
  render(
    <ThemeProvider>
      <SessionProvider initialSession={null}>
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
    expect(
      screen.getByRole('heading', { name: 'Foxden Invitational' }).closest('header')
    ).toHaveClass('kitsune-merged-header');
    expect(screen.getByRole('navigation', { name: 'Player' })).toContainElement(
      screen.getByRole('link', { name: 'Challenges' })
    );
    expect(screen.getByRole('heading', { name: 'Your run' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Around your rank' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Chart data' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Scores around your rank series' })
    ).not.toBeInTheDocument();
    const nearbyTeams = screen.getByRole('complementary', { name: 'Teams around your rank' });
    const nearbyRows = within(nearbyTeams).getAllByRole('listitem');
    const currentTeam = within(nearbyTeams).getByText('Foxden');
    const nearbyRanks = nearbyRows.map((row) =>
      Number(within(row).getByText(/^#/).textContent.slice(1))
    );
    expect(nearbyRows).toHaveLength(5);
    expect(nearbyRanks).toEqual(nearbyRows.map((_, index) => nearbyRanks[0]! + index));
    expect(currentTeam).toHaveClass('font-semibold', 'text-accent-text');
    expect(currentTeam.closest('li')).toHaveAttribute('aria-current', 'true');
    expect(nearbyTeams).toHaveClass('lg:h-chart');
    expect(nearbyTeams.querySelector('.bg-linear-to-b')).toBeInTheDocument();
    const challengeFieldHeading = screen.getByRole('heading', { name: 'Challenge field' });
    const challengeField = screen.getByRole('region', { name: 'Challenge field' });
    const overview = screen.getByRole('heading', { name: 'Your run' }).closest('section');
    const overviewLayout = overview?.firstElementChild;
    const categoryBreakdown = screen.getByRole('list', { name: 'Category breakdown' });
    const categoryScrollOwner = categoryBreakdown.parentElement;
    expect(challengeFieldHeading).toBeVisible();
    expect(challengeFieldHeading.parentElement).toHaveClass('px-3');
    expect(overview).toHaveClass('overflow-hidden');
    expect(overviewLayout).toHaveClass('w-full', 'px-6', 'py-6');
    expect(overviewLayout).not.toHaveClass('mx-auto', 'max-w-shell');
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
    const rankLabel = screen.getByText('rank');
    expect(rankLabel.parentElement).toHaveClass('items-baseline', 'gap-2');
    expect(screen.queryByText('Rank')).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Challenge list width' })).toHaveValue('34');
    expect(screen.getByRole('slider', { name: 'Challenge list width' })).toHaveAttribute(
      'min',
      '24'
    );
    expect(screen.getByRole('button', { name: /Web/ }).closest('h2')).toHaveClass(
      'sticky',
      'top-challenge-list-header'
    );
    const progressSummary = screen.getByLabelText('Challenge progress');
    const challengeSearch = screen.getByRole('searchbox', { name: 'Search challenges' });
    expect(progressSummary).toHaveClass('kitsune-optical-center', 'gap-6');
    expect(progressSummary.parentElement).toHaveClass('min-h-12', 'justify-start', 'px-4');
    expect(challengeSearch.closest('.min-h-16')).toHaveClass('items-start', 'pt-1');
    expect(progressSummary.compareDocumentPosition(challengeSearch)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
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

  it('restores the challenge list, selected tab, and detail scroll positions', async () => {
    rememberChallengeListScroll('event', 84);
    rememberChallengeTab('event', 'challenge', 'solves');
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
    const first = within(challengeList).getByRole('link', { name: /First trail/ });
    const second = within(challengeList).getByRole('link', { name: /Second trail/ });

    fireEvent.keyDown(window, { key: 'j' });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('heading', { name: 'First trail' })).toBeVisible();

    fireEvent.keyDown(window, { key: 'j' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('aria-current', 'true');
    expect(first).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { name: 'Second trail' })).toBeVisible();

    fireEvent.keyDown(window, { key: 'k' });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(first).toHaveAttribute('href', '/challenges?challenge=first');
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

  it('keeps locked hint state, cost, and action in one aligned row', async () => {
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
    expect(hintRow).toHaveClass('flex', 'min-h-control', 'items-center', 'justify-between');
    expect(within(hintRow as HTMLElement).getByText('Locked')).toBeVisible();
    expect(within(hintRow as HTMLElement).getByText('10 pts')).toBeVisible();
    const unlock = within(hintRow as HTMLElement).getByRole('button', { name: 'Unlock hint' });
    expect(unlock).toHaveClass('min-h-control', 'border-transparent');

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
    const first = within(challengeList).getByRole('link', { name: /First trail/ });
    const second = within(challengeList).getByRole('link', { name: /Second trail/ });

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
    expect(within(dialog).getByText('Resize challenge list')).toBeVisible();
    expect(within(dialog).getByText('Toggle challenge list')).toBeVisible();
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
    const first = within(challengeList).getByRole('link', { name: /First trail/ });
    const second = within(challengeList).getByRole('link', { name: /Second trail/ });

    expect(first).toHaveAttribute('aria-current', 'true');
    fireEvent.click(second);

    expect(second).toHaveAttribute('aria-current', 'true');
    expect(second).toHaveClass('ring-1', 'ring-accent-border');
    expect(first).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { name: 'Second trail' })).toBeVisible();
  });

  it('aligns trusted author metadata beside the challenge title', () => {
    renderWorkspace(
      [createChallengeExperience(challenge(), { authorName: 'simonfalke' })],
      'challenge'
    );

    const title = screen.getByRole('heading', { name: 'Shrine gate' });
    const titleLine = title.parentElement;
    const detailHeader = title.closest('header');
    const author = within(titleLine as HTMLElement).getByText('by simonfalke');
    const collectionAuthor = within(
      screen.getByRole('region', { name: 'Challenge list' })
    ).getByText('by simonfalke');
    const tabList = screen.getByRole('tablist', { name: 'Challenge sections' });
    const detailsTab = within(tabList).getByRole('tab', { name: 'Details' });

    expect(detailHeader).toHaveClass('px-6', 'py-6');
    expect(titleLine).toHaveClass('items-baseline', 'gap-x-2');
    expect(author).toHaveClass('text-sm', 'text-text-muted');
    expect(collectionAuthor).toHaveClass('text-xs', 'text-text-subtle', 'truncate');
    expect(tabList).toHaveClass('px-6');
    expect(detailsTab).toHaveClass('px-3');
    expect(detailsTab).not.toHaveClass('first:pl-0');
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
      expect(row).toHaveClass('flex', 'min-h-16', 'items-center');
      expect(row).not.toHaveClass('grid');
    }
    for (const avatar of within(solveStrip).getAllByRole('img')) {
      expect(avatar).toHaveClass('size-control', 'rounded-lg');
    }
    for (const identity of within(solveStrip).getAllByText('Foxden')) {
      expect(identity).toHaveClass('text-sm', 'font-semibold');
      expect(identity.nextElementSibling).toHaveClass('text-xs', 'font-normal');
    }
    expect(within(solveStrip).getAllByText(/^First blood \(.+\)$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Foxden').length).toBeGreaterThan(0);
    const selectedChallenge = screen.getByRole('link', { name: /Solved timeline/ });
    const firstBlood = within(selectedChallenge).getByText('First blood');
    expect(selectedChallenge).toHaveAttribute('aria-current', 'true');
    expect(selectedChallenge).toHaveAttribute('data-solved', 'true');
    expect(selectedChallenge).toHaveAttribute('data-blood', '1');
    expect(selectedChallenge).toHaveClass('ring-1', 'ring-accent-border');
    expect(selectedChallenge.querySelector('.kitsune-collection-marker')).toBeInTheDocument();
    expect(firstBlood.querySelector('svg')).toHaveClass('-translate-y-optical');

    fireEvent.click(screen.getByRole('tab', { name: '18 Solves' }));

    expect(window.localStorage.getItem('kitsune.challenge-workspace.v1.event')).toContain(
      '"tab":"solves"'
    );

    const standings = screen.getByRole('list', { name: 'Solve standings' });
    expect(within(standings).getAllByRole('listitem').length).toBeGreaterThanOrEqual(18);
    expect(within(standings).getAllByText(/^First blood \(.+\)$/).length).toBeGreaterThan(0);
    expect(within(standings).getAllByText(/UTC/).length).toBeGreaterThan(0);
    expect(within(standings).getAllByText('Foxden').length).toBeGreaterThan(0);
  });

  it('keeps unsolved podium places as stable neutral slots', () => {
    const open = createChallengeExperience(challenge({ id: 'open-podium' }), {
      solveCount: 0
    });

    renderWorkspace([open], open.id);

    const solveStrip = screen.getByLabelText('Challenge solve context');
    const openStatuses = within(solveStrip).getAllByText('Open, no solve yet');

    expect(openStatuses).toHaveLength(3);
    for (const status of openStatuses) {
      const slot = status.closest('li');
      const placeholder = slot?.querySelector('.kitsune-open-podium-slot');
      expect(status).toHaveClass('sr-only');
      expect(slot).toHaveClass('min-h-16');
      expect(slot).not.toHaveClass('kitsune-open-podium-slot');
      expect(placeholder).toHaveClass('flex-1', 'self-stretch', 'border-l-2', 'border-border');
      expect(slot?.firstElementChild).toHaveClass('text-text-muted');
      expect(within(slot!).queryByRole('img')).not.toBeInTheDocument();
    }
    expect(within(solveStrip).queryByText('No solve')).not.toBeInTheDocument();
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
  ] as const)(
    'uses the configured first-blood state for the %s effect',
    async (effect, effectPart) => {
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
      if (effect === 'edge-border' || effect === 'screen-imprint') {
        expect(solveEffect?.querySelector('.kitsune-solve-edge-frame')).toHaveAttribute(
          'data-edge-color',
          'rainbow'
        );
      }
      expect(solvedSummary).toHaveAttribute('data-first-blood', 'true');
      expect(solvedMessage.parentElement).toHaveClass('text-first-blood-text');
      expect(selectedChallenge).toHaveAttribute('data-blood', '1');
      expect(screen.getAllByText('First blood').length).toBeGreaterThan(0);
    }
  );

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
    expect(document.querySelector('.kitsune-solve-effect')).not.toBeInTheDocument();
  });
});
