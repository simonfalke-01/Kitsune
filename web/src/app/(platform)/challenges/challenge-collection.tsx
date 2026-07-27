'use client';

import { Check, ChevronsUpDown, Eye, EyeOff, PanelLeftClose, Trophy } from 'lucide-react';
import { type RefObject, useMemo, useState, useSyncExternalStore } from 'react';

import {
  categoryTextClasses,
  ChallengeCategoryLabel,
  challengeCategoryDefinition
} from './challenge-category';
import { solveCountLabel, type ChallengeSolveContext } from './challenge-solve-stub';
import {
  Button,
  CollectionLink,
  Disclosure,
  DisclosureGroup,
  EmptyState,
  SearchField,
  Tooltip,
  TooltipTrigger
} from '@/components/ui';
import {
  challengePoints,
  challengeProgress,
  filterChallenges,
  groupChallenges,
  type ChallengeCategoryTone,
  type ChallengeExperience
} from '@/lib/challenges';

const categoryBorderClasses: Record<ChallengeCategoryTone, string> = {
  amber: 'border-l-2 border-l-category-amber',
  blue: 'border-l-2 border-l-category-blue',
  cyan: 'border-l-2 border-l-category-cyan',
  lime: 'border-l-2 border-l-category-lime',
  orange: 'border-l-2 border-l-category-orange',
  pink: 'border-l-2 border-l-category-pink',
  teal: 'border-l-2 border-l-category-teal',
  violet: 'border-l-2 border-l-category-violet'
};

const bloodTextClasses = {
  1: 'text-podium-first',
  2: 'text-podium-second',
  3: 'text-podium-third'
} as const;

const bloodLabels = {
  1: 'First blood',
  2: 'Second blood',
  3: 'Third blood'
} as const;

const preferencesEvent = 'kitsune-challenge-preferences';
const preferencesVersion = 'v2';

interface ChallengeCollectionPreferences {
  collapsed: string[];
  hideSolved: boolean;
}

function subscribeToPreferences(change: () => void): () => void {
  window.addEventListener('storage', change);
  window.addEventListener(preferencesEvent, change);

  return () => {
    window.removeEventListener('storage', change);
    window.removeEventListener(preferencesEvent, change);
  };
}

function preferenceSnapshot(eventId: string): string {
  return (
    window.localStorage.getItem(`kitsune.challenge-preferences.${preferencesVersion}.${eventId}`) ??
    '{}'
  );
}

function parsePreferences(snapshot: string): ChallengeCollectionPreferences {
  try {
    const stored = JSON.parse(snapshot) as {
      collapsed?: unknown;
      hideSolved?: unknown;
    };
    return {
      collapsed: Array.isArray(stored.collapsed)
        ? stored.collapsed.filter((value): value is string => typeof value === 'string')
        : [],
      hideSolved: stored.hideSolved === true
    };
  } catch {
    return {
      collapsed: [],
      hideSolved: false
    };
  }
}

function writePreferences(eventId: string, preferences: ChallengeCollectionPreferences) {
  window.localStorage.setItem(
    `kitsune.challenge-preferences.${preferencesVersion}.${eventId}`,
    JSON.stringify(preferences)
  );
  window.dispatchEvent(new Event(preferencesEvent));
}

interface ChallengeCollectionProps {
  challenges: ChallengeExperience[];
  eventId: string;
  getChallengeHref?: (challengeId: string) => string | undefined;
  onCollapseChallengeList?: () => void;
  onExitSearch?: () => void;
  onSelectChallenge?: (challengeId: string, trigger: HTMLElement) => void;
  selectedChallengeId: string | null;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  solveContexts: ReadonlyMap<string, ChallengeSolveContext>;
}

export function ChallengeCollection({
  challenges,
  eventId,
  getChallengeHref,
  onCollapseChallengeList,
  onExitSearch,
  onSelectChallenge,
  selectedChallengeId,
  searchInputRef,
  solveContexts
}: ChallengeCollectionProps) {
  const preferenceValue = useSyncExternalStore(
    subscribeToPreferences,
    () => preferenceSnapshot(eventId),
    () => '{}'
  );
  const preferences = useMemo(() => parsePreferences(preferenceValue), [preferenceValue]);
  const [query, setQuery] = useState('');
  const hideSolved = preferences.hideSolved;
  const progress = useMemo(() => challengeProgress(challenges), [challenges]);
  const allCategories = useMemo(
    () => groupChallenges(challenges).map((group) => group.category),
    [challenges]
  );
  const expandedKeys = useMemo<Set<string>>(() => {
    return new Set(allCategories.filter((category) => !preferences.collapsed.includes(category)));
  }, [allCategories, preferences.collapsed]);
  const filteredChallenges = useMemo(
    () =>
      filterChallenges(challenges, query).filter((challenge) => {
        return !hideSolved || !challenge.solved || challenge.id === selectedChallengeId;
      }),
    [challenges, hideSolved, query, selectedChallengeId]
  );
  const groups = useMemo(() => groupChallenges(filteredChallenges), [filteredChallenges]);
  const resolvedExpandedKeys = query
    ? new Set<string>(groups.map((group) => group.category))
    : expandedKeys;

  function savePreferences(nextHideSolved: boolean, nextExpandedKeys: Set<string>) {
    writePreferences(eventId, {
      collapsed: allCategories.filter((category) => !nextExpandedKeys.has(category)),
      hideSolved: nextHideSolved
    });
  }

  return (
    <section aria-label="Challenge list" className="flex min-h-full flex-col bg-surface-raised">
      <div className="sticky top-0 z-20 bg-surface-raised">
        <div className="flex min-h-12 items-center justify-start px-4">
          <dl
            aria-label="Challenge progress"
            className="kitsune-optical-center m-0 flex gap-6 text-sm tabular-nums text-text-muted"
          >
            <div>
              <dt className="sr-only">Challenges solved</dt>
              <dd className="m-0">
                <strong className="font-semibold text-text">{progress.solved}</strong> /{' '}
                {progress.total} solved
              </dd>
            </div>
            <div>
              <dt className="sr-only">Points earned</dt>
              <dd className="m-0">
                <strong className="font-semibold text-text">
                  {progress.earnedPoints.toLocaleString()}
                </strong>{' '}
                / {progress.availablePoints.toLocaleString()} pts
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex min-h-16 items-start gap-2 px-3 pt-1">
          <SearchField
            className="min-w-0 flex-1"
            label="Search challenges"
            labelHidden
            inputRef={searchInputRef}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onExitSearch?.();
              }
            }}
            onChange={setQuery}
            placeholder="Name or category"
            value={query}
          />
          <TooltipTrigger>
            <Button
              aria-label={hideSolved ? 'Show solved challenges' : 'Hide solved challenges'}
              aria-pressed={hideSolved}
              className="size-control"
              onPress={() => {
                savePreferences(!hideSolved, expandedKeys);
              }}
              size="icon"
              tone="quiet"
            >
              {hideSolved ? (
                <EyeOff aria-hidden className="size-4" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )}
            </Button>
            <Tooltip>{hideSolved ? 'Show solved' : 'Hide solved'}</Tooltip>
          </TooltipTrigger>
          <TooltipTrigger>
            <Button
              aria-label={
                expandedKeys.size === 0 ? 'Expand all categories' : 'Collapse all categories'
              }
              className="size-control"
              onPress={() => {
                const visibleCategories = groups.map((group) => group.category);
                const next =
                  expandedKeys.size === 0 ? new Set<string>(visibleCategories) : new Set<string>();
                savePreferences(hideSolved, next);
              }}
              size="icon"
              tone="quiet"
            >
              <ChevronsUpDown aria-hidden className="size-4" />
            </Button>
            <Tooltip>{expandedKeys.size === 0 ? 'Expand all' : 'Collapse all'}</Tooltip>
          </TooltipTrigger>
          {onCollapseChallengeList ? (
            <TooltipTrigger>
              <Button
                aria-label="Collapse challenge list"
                className="size-control"
                onPress={onCollapseChallengeList}
                size="icon"
                tone="quiet"
              >
                <PanelLeftClose aria-hidden className="size-4" />
              </Button>
              <Tooltip>Collapse challenge list</Tooltip>
            </TooltipTrigger>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="p-4">
          <EmptyState
            action={
              <Button
                onPress={() => {
                  setQuery('');
                }}
                size="small"
                tone="secondary"
              >
                Clear search
              </Button>
            }
            title="No matches"
          />
        </div>
      ) : (
        <DisclosureGroup
          allowsMultipleExpanded
          appearance="plain"
          expandedKeys={resolvedExpandedKeys}
          onExpandedChange={(keys) => {
            const next = new Set([...keys].map(String));
            savePreferences(hideSolved, next);
          }}
        >
          {groups.map((group) => {
            const definition = challengeCategoryDefinition(group.category);
            const tone = definition.tone;

            return (
              <Disclosure
                className={`${categoryTextClasses[tone]} bg-surface-raised`}
                density="compact"
                headingClassName="sticky top-challenge-list-header z-10 bg-surface-sunken"
                headingLevel={2}
                id={group.category}
                key={group.category}
                meta={`${group.solved} / ${group.challenges.length}`}
                title={<ChallengeCategoryLabel category={group.category} />}
                tone="inherit"
                triggerClassName={categoryBorderClasses[tone]}
              >
                <ul className="m-0 grid list-none bg-surface-raised p-0">
                  {group.challenges.map((challenge) => {
                    const solveContext = solveContexts.get(challenge.id);
                    const solveCount = solveContext?.totalSolves ?? challenge.solveCount ?? 0;
                    const selfRank = challenge.solved ? solveContext?.selfEntry?.rank : null;
                    const bloodRank = selfRank && selfRank <= 3 ? (selfRank as 1 | 2 | 3) : null;

                    return (
                      <li key={challenge.id}>
                        <CollectionLink
                          appearance="challenge"
                          className="kitsune-challenge-row"
                          data-blood={bloodRank ?? undefined}
                          data-challenge-id={challenge.id}
                          data-challenge-row
                          data-solved={challenge.solved || undefined}
                          href={getChallengeHref?.(challenge.id)}
                          isSelected={selectedChallengeId === challenge.id}
                          onPress={(event) => {
                            const target = event.target as HTMLElement;
                            onSelectChallenge?.(challenge.id, target.closest('a') ?? target);
                          }}
                          tone={tone}
                        >
                          <span className="flex items-center justify-between gap-4">
                            <span className="grid min-w-0 gap-1">
                              <span className="flex min-w-0 items-baseline gap-2">
                                <span className="min-w-0 flex-1 truncate text-base font-semibold text-text">
                                  {challenge.name}
                                </span>
                                {challenge.authorName ? (
                                  <span className="max-w-menu shrink truncate text-xs font-normal text-text-subtle">
                                    by {challenge.authorName}
                                  </span>
                                ) : null}
                              </span>
                              {challenge.solved ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-sm font-medium ${
                                    bloodRank ? bloodTextClasses[bloodRank] : 'text-success-text'
                                  }`}
                                >
                                  {bloodRank ? (
                                    <Trophy
                                      aria-hidden
                                      className="size-4 shrink-0 -translate-y-optical"
                                    />
                                  ) : (
                                    <Check aria-hidden className="size-4 shrink-0" />
                                  )}
                                  {bloodRank ? bloodLabels[bloodRank] : 'Solved'}
                                </span>
                              ) : (
                                <span className="text-sm text-text-subtle">Unsolved</span>
                              )}
                            </span>
                            <span className="grid shrink-0 justify-items-end gap-1">
                              <span className="text-sm font-medium tabular-nums text-text">
                                {challengePoints(challenge)}
                              </span>
                              <span className="text-sm tabular-nums text-text-muted">
                                {solveCountLabel(solveCount)}
                              </span>
                            </span>
                          </span>
                        </CollectionLink>
                      </li>
                    );
                  })}
                </ul>
              </Disclosure>
            );
          })}
        </DisclosureGroup>
      )}
    </section>
  );
}
