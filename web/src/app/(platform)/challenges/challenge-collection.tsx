'use client';

import { ChevronsUpDown, Eye, EyeOff, PanelLeftClose } from 'lucide-react';
import {
  forwardRef,
  type RefObject,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';

import {
  categoryTextClasses,
  ChallengeCategoryLabel,
  challengeCategoryDefinition
} from './challenge-category';
import { ChallengeCollectionRow } from './challenge-collection-row';
import type { FirstBloodHighlightColor } from './challenge-presentation';
import type { ChallengeSolveContext } from './challenge-solve-stub';
import {
  Button,
  Disclosure,
  DisclosureGroup,
  EmptyState,
  IconButton,
  SearchField,
  Tooltip,
  TooltipTrigger
} from '@/components/ui';
import type { ChallengePresenceMember } from '@/lib/api/client';
import {
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
  firstBloodHighlightColor: FirstBloodHighlightColor;
  onCollapseChallengeList?: () => void;
  onClearSelectedChallenge?: () => void;
  onSelectChallenge?: (challengeId: string, trigger: HTMLElement) => void;
  presenceByChallenge: ReadonlyMap<string, ChallengePresenceMember[]>;
  selectedChallengeId: string | null;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  solveContexts: ReadonlyMap<string, ChallengeSolveContext>;
}

export interface ChallengeCollectionHandle {
  focusSelected(): boolean;
  moveSelection(direction: 1 | -1): void;
  toggleCategories(): void;
  toggleSolvedVisibility(): void;
}

export const ChallengeCollection = forwardRef<ChallengeCollectionHandle, ChallengeCollectionProps>(
  function ChallengeCollection(
    {
      challenges,
      eventId,
      firstBloodHighlightColor,
      onCollapseChallengeList,
      onClearSelectedChallenge,
      onSelectChallenge,
      presenceByChallenge,
      selectedChallengeId,
      searchInputRef,
      solveContexts
    },
    ref
  ) {
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
          return !hideSolved || !challenge.solved;
        }),
      [challenges, hideSolved, query]
    );
    const groups = useMemo(() => groupChallenges(filteredChallenges), [filteredChallenges]);
    const resolvedExpandedCategories = useMemo(
      () => (query ? new Set<string>(groups.map((group) => group.category)) : expandedKeys),
      [expandedKeys, groups, query]
    );
    const visibleChallengeIds = useMemo(
      () =>
        groups.flatMap((group) =>
          resolvedExpandedCategories.has(group.category)
            ? group.challenges.map((challenge) => challenge.id)
            : []
        ),
      [groups, resolvedExpandedCategories]
    );
    const challengeRowRefs = useRef(new Map<string, HTMLButtonElement>());

    const savePreferences = useCallback(
      (nextHideSolved: boolean, nextExpandedKeys: Set<string>) => {
        writePreferences(eventId, {
          collapsed: allCategories.filter((category) => !nextExpandedKeys.has(category)),
          hideSolved: nextHideSolved
        });
      },
      [allCategories, eventId]
    );
    const toggleSolvedVisibility = useCallback(() => {
      const nextHideSolved = !hideSolved;
      const hidesSelection =
        nextHideSolved &&
        challenges.some((challenge) => challenge.id === selectedChallengeId && challenge.solved);

      if (hidesSelection) {
        onClearSelectedChallenge?.();
      }

      savePreferences(nextHideSolved, expandedKeys);
    }, [
      challenges,
      expandedKeys,
      hideSolved,
      onClearSelectedChallenge,
      savePreferences,
      selectedChallengeId
    ]);
    const toggleCategories = useCallback(() => {
      const visibleCategories = groups.map((group) => group.category);
      const next = expandedKeys.size === 0 ? new Set<string>(visibleCategories) : new Set<string>();
      savePreferences(hideSolved, next);
    }, [expandedKeys.size, groups, hideSolved, savePreferences]);

    useImperativeHandle(
      ref,
      () => ({
        focusSelected() {
          const selectedRow = selectedChallengeId
            ? challengeRowRefs.current.get(selectedChallengeId)
            : undefined;
          selectedRow?.focus();
          return Boolean(selectedRow);
        },
        moveSelection(direction) {
          if (visibleChallengeIds.length === 0) {
            return;
          }

          const activeElement = document.activeElement;
          const focusedIndex = visibleChallengeIds.findIndex((challengeId) => {
            const row = challengeRowRefs.current.get(challengeId);
            return Boolean(
              row && activeElement && (row === activeElement || row.contains(activeElement))
            );
          });
          const selectedIndex = selectedChallengeId
            ? visibleChallengeIds.indexOf(selectedChallengeId)
            : -1;
          const currentIndex = focusedIndex >= 0 ? focusedIndex : selectedIndex;
          const nextIndex =
            currentIndex < 0
              ? direction > 0
                ? 0
                : visibleChallengeIds.length - 1
              : Math.min(Math.max(currentIndex + direction, 0), visibleChallengeIds.length - 1);
          const nextChallengeId = visibleChallengeIds[nextIndex];
          const nextRow = nextChallengeId
            ? challengeRowRefs.current.get(nextChallengeId)
            : undefined;

          if (!nextChallengeId || !nextRow) {
            return;
          }

          nextRow.focus();
          if (nextChallengeId !== selectedChallengeId) {
            onSelectChallenge?.(nextChallengeId, nextRow);
          }
        },
        toggleCategories,
        toggleSolvedVisibility
      }),
      [
        onSelectChallenge,
        selectedChallengeId,
        toggleCategories,
        toggleSolvedVisibility,
        visibleChallengeIds
      ]
    );

    return (
      <section
        aria-keyshortcuts="/ J K X E F"
        aria-label="Challenge list"
        className="relative flex min-h-full flex-col bg-surface-raised"
      >
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
              excludeFromTabOrder
              label="Search challenges"
              labelHidden
              inputId="challenge-search"
              inputRef={searchInputRef}
              onChange={setQuery}
              placeholder="Name or category"
              value={query}
            />
            <TooltipTrigger>
              <IconButton
                aria-pressed={hideSolved}
                excludeFromTabOrder
                label={hideSolved ? 'Show solved challenges' : 'Hide solved challenges'}
                onPress={toggleSolvedVisibility}
              >
                {hideSolved ? (
                  <EyeOff aria-hidden className="size-4" />
                ) : (
                  <Eye aria-hidden className="size-4" />
                )}
              </IconButton>
              <Tooltip>{hideSolved ? 'Show solved' : 'Hide solved'}</Tooltip>
            </TooltipTrigger>
            <TooltipTrigger>
              <IconButton
                excludeFromTabOrder
                label={
                  expandedKeys.size === 0 ? 'Expand all categories' : 'Collapse all categories'
                }
                onPress={toggleCategories}
              >
                <ChevronsUpDown aria-hidden className="size-4" />
              </IconButton>
              <Tooltip>{expandedKeys.size === 0 ? 'Expand all' : 'Collapse all'}</Tooltip>
            </TooltipTrigger>
            {onCollapseChallengeList ? (
              <TooltipTrigger>
                <IconButton
                  excludeFromTabOrder
                  label="Collapse challenge list"
                  onPress={onCollapseChallengeList}
                >
                  <PanelLeftClose aria-hidden className="size-4" />
                </IconButton>
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
                  excludeFromTabOrder
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
            expandedKeys={resolvedExpandedCategories}
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
                  excludeTriggerFromTabOrder
                  focusAppearance="inset"
                  headingClassName="sticky top-challenge-list-header z-sticky bg-surface-sunken"
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
                      const challengePresence = presenceByChallenge.get(challenge.id) ?? [];
                      const solveContext = solveContexts.get(challenge.id);

                      return (
                        <ChallengeCollectionRow
                          challenge={challenge}
                          firstBloodHighlightColor={firstBloodHighlightColor}
                          isSelected={selectedChallengeId === challenge.id}
                          key={challenge.id}
                          onSelect={onSelectChallenge}
                          presence={challengePresence}
                          rowRef={(row) => {
                            if (row) {
                              challengeRowRefs.current.set(challenge.id, row);
                            } else {
                              challengeRowRefs.current.delete(challenge.id);
                            }
                          }}
                          solveContext={solveContext}
                        />
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
);
