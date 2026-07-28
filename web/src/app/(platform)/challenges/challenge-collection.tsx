'use client';

import { ChevronsUpDown, Eye, EyeOff, PanelLeftClose } from 'lucide-react';
import { type RefObject, useMemo, useState, useSyncExternalStore } from 'react';

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
  SkipLink,
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
  getChallengeHref?: (challengeId: string) => string | undefined;
  onCollapseChallengeList?: () => void;
  onExitSearch?: () => void;
  onSelectChallenge?: (challengeId: string, trigger: HTMLElement) => void;
  presenceByChallenge: ReadonlyMap<string, ChallengePresenceMember[]>;
  selectedChallengeId: string | null;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  showDetailFocusLink?: boolean;
  solveContexts: ReadonlyMap<string, ChallengeSolveContext>;
}

export function ChallengeCollection({
  challenges,
  eventId,
  firstBloodHighlightColor,
  getChallengeHref,
  onCollapseChallengeList,
  onExitSearch,
  onSelectChallenge,
  presenceByChallenge,
  selectedChallengeId,
  searchInputRef,
  showDetailFocusLink = false,
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
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onExitSearch?.();
              }
            }}
            onChange={setQuery}
            placeholder="Name or category"
            value={query}
          />
          <TooltipTrigger>
            <IconButton
              aria-pressed={hideSolved}
              label={hideSolved ? 'Show solved challenges' : 'Hide solved challenges'}
              onPress={() => {
                savePreferences(!hideSolved, expandedKeys);
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
              label={expandedKeys.size === 0 ? 'Expand all categories' : 'Collapse all categories'}
              onPress={() => {
                const visibleCategories = groups.map((group) => group.category);
                const next =
                  expandedKeys.size === 0 ? new Set<string>(visibleCategories) : new Set<string>();
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
                        href={getChallengeHref?.(challenge.id)}
                        isSelected={selectedChallengeId === challenge.id}
                        key={challenge.id}
                        onSelect={onSelectChallenge}
                        presence={challengePresence}
                        solveContext={solveContext}
                        tone={tone}
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
