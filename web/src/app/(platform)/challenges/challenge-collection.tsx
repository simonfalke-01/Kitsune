'use client';

import { ChevronsUpDown, Eye, EyeOff, PanelLeftClose } from 'lucide-react';
import {
  forwardRef,
  type RefObject,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';

import { ChallengeCategoryLabel, challengeCategoryDefinition } from './challenge-category';
import { ChallengeCollectionRow } from './challenge-collection-row';
import type { FirstBloodHighlightColor } from './challenge-presentation';
import type { ChallengeSolveContext } from './challenge-solve-stub';
import {
  Button,
  CollectionTree,
  CollectionTreeItem,
  EmptyState,
  IconButton,
  SearchField,
  SkipLink,
  Tooltip,
  TooltipTrigger
} from '@/components/ui';
import type { ChallengePresenceMember } from '@/lib/api/client';
import {
  challengeProgress,
  filterChallenges,
  groupChallenges,
  type ChallengeExperience
} from '@/lib/challenges';

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
  showDetailFocusLink?: boolean;
  solveContexts: ReadonlyMap<string, ChallengeSolveContext>;
}

export interface ChallengeCollectionHandle {
  focusSelected(): boolean;
  moveSelection(direction: 1 | -1): void;
}

function categoryTreeKey(category: string): string {
  return `category:${category}`;
}

function challengeTreeKey(challengeId: string): string {
  return `challenge:${challengeId}`;
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
      showDetailFocusLink = false,
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
    const expandedTreeKeys = useMemo(
      () => new Set([...resolvedExpandedCategories].map(categoryTreeKey)),
      [resolvedExpandedCategories]
    );
    const categoryTreeKeys = useMemo(
      () => new Set(groups.map((group) => categoryTreeKey(group.category))),
      [groups]
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
    const challengeRowRefs = useRef(new Map<string, HTMLDivElement>());

    function savePreferences(nextHideSolved: boolean, nextExpandedKeys: Set<string>) {
      writePreferences(eventId, {
        collapsed: allCategories.filter((category) => !nextExpandedKeys.has(category)),
        hideSolved: nextHideSolved
      });
    }

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
        }
      }),
      [onSelectChallenge, selectedChallengeId, visibleChallengeIds]
    );

    return (
      <section
        aria-label="Challenge list"
        className="relative flex min-h-full flex-col bg-surface-raised"
      >
        {showDetailFocusLink ? (
          <SkipLink href="#challenge-detail">Skip challenge list</SkipLink>
        ) : null}
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
              inputId="challenge-search"
              inputRef={searchInputRef}
              onChange={setQuery}
              placeholder="Name or category"
              value={query}
            />
            <TooltipTrigger>
              <IconButton
                aria-pressed={hideSolved}
                label={hideSolved ? 'Show solved challenges' : 'Hide solved challenges'}
                onPress={() => {
                  const nextHideSolved = !hideSolved;
                  const hidesSelection =
                    nextHideSolved &&
                    challenges.some(
                      (challenge) => challenge.id === selectedChallengeId && challenge.solved
                    );

                  if (hidesSelection) {
                    onClearSelectedChallenge?.();
                  }

                  savePreferences(nextHideSolved, expandedKeys);
                }}
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
                label={
                  expandedKeys.size === 0 ? 'Expand all categories' : 'Collapse all categories'
                }
                onPress={() => {
                  const visibleCategories = groups.map((group) => group.category);
                  const next =
                    expandedKeys.size === 0
                      ? new Set<string>(visibleCategories)
                      : new Set<string>();
                  savePreferences(hideSolved, next);
                }}
              >
                <ChevronsUpDown aria-hidden className="size-4" />
              </IconButton>
              <Tooltip>{expandedKeys.size === 0 ? 'Expand all' : 'Collapse all'}</Tooltip>
            </TooltipTrigger>
            {onCollapseChallengeList ? (
              <TooltipTrigger>
                <IconButton label="Collapse challenge list" onPress={onCollapseChallengeList}>
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
          <CollectionTree
            aria-label="Challenges"
            disabledBehavior="selection"
            disabledKeys={categoryTreeKeys}
            expandedKeys={expandedTreeKeys}
            onExpandedChange={(keys) => {
              const next = new Set(
                [...keys]
                  .map(String)
                  .filter((key) => key.startsWith('category:'))
                  .map((key) => key.slice('category:'.length))
              );
              savePreferences(hideSolved, next);
            }}
            onSelectionChange={(keys) => {
              if (keys === 'all') {
                return;
              }

              const selectedKey = [...keys][0];
              if (typeof selectedKey !== 'string' || !selectedKey.startsWith('challenge:')) {
                return;
              }

              const challengeId = selectedKey.slice('challenge:'.length);
              const trigger = challengeRowRefs.current.get(challengeId);
              if (trigger && challengeId !== selectedChallengeId) {
                onSelectChallenge?.(challengeId, trigger);
              }
            }}
            selectedKeys={
              selectedChallengeId ? new Set([challengeTreeKey(selectedChallengeId)]) : new Set()
            }
            selectionBehavior="replace"
            selectionMode="single"
          >
            {groups.map((group) => {
              const definition = challengeCategoryDefinition(group.category);
              const tone = definition.tone;

              return (
                <CollectionTreeItem
                  appearance="category"
                  content={<ChallengeCategoryLabel category={group.category} />}
                  id={categoryTreeKey(group.category)}
                  key={group.category}
                  meta={`${group.solved} / ${group.challenges.length}`}
                  onAction={() => {
                    const next = new Set(resolvedExpandedCategories);
                    if (next.has(group.category)) {
                      next.delete(group.category);
                    } else {
                      next.add(group.category);
                    }
                    savePreferences(hideSolved, next);
                  }}
                  textValue={definition.label}
                  tone={tone}
                >
                  {group.challenges.map((challenge) => {
                    const challengePresence = presenceByChallenge.get(challenge.id) ?? [];
                    const solveContext = solveContexts.get(challenge.id);

                    return (
                      <ChallengeCollectionRow
                        challenge={challenge}
                        firstBloodHighlightColor={firstBloodHighlightColor}
                        key={challenge.id}
                        presence={challengePresence}
                        rowRef={(row) => {
                          if (row) {
                            challengeRowRefs.current.set(challenge.id, row);
                          } else {
                            challengeRowRefs.current.delete(challenge.id);
                          }
                        }}
                        solveContext={solveContext}
                        tone={tone}
                      />
                    );
                  })}
                </CollectionTreeItem>
              );
            })}
          </CollectionTree>
        )}
      </section>
    );
  }
);
