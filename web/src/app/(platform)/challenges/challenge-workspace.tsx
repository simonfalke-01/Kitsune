'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { ChallengeCollapsedRail } from './challenge-collapsed-rail';
import { ChallengeCollection } from './challenge-collection';
import { ChallengeDetail } from './challenge-detail';
import { ChallengeEventTrail } from './challenge-event-trail';
import {
  challengePresentationSettingsStub,
  type FirstBloodEdgeColor,
  type FirstBloodHighlightColor,
  type FlagSubmitSuccessEffect
} from './challenge-presentation';
import {
  challengeWorkspaceMemorySnapshot,
  getServerChallengeWorkspaceMemorySnapshot,
  parseChallengeWorkspaceMemory,
  rememberChallengeListScroll,
  subscribeToChallengeWorkspaceMemory,
  type ChallengeDetailTab
} from './challenge-workspace-memory';
import {
  appendCurrentCompetitorSolve,
  createChallengeEventStandingStub,
  createChallengeSolveContextMap,
  type ChallengeCompetitorStub
} from './challenge-solve-stub';
import type { ChallengeWorkspaceActions } from './challenge-types';
import type { ChallengePresenceStatus } from './use-challenge-presence';
import type { RealtimeStatus } from '@/app/realtime-context';
import { EmptyState, Sheet, SplitWorkspace, type SplitWorkspaceHandle } from '@/components/ui';
import type { ChallengePresenceMember } from '@/lib/api/client';
import type { ChallengeExperience } from '@/lib/challenges';

export type { ChallengeWorkspaceActions } from './challenge-types';

const desktopMediaQuery = '(min-width: 48rem)';

function subscribeToDesktop(change: () => void): () => void {
  const query = window.matchMedia(desktopMediaQuery);
  query.addEventListener('change', change);

  return () => {
    query.removeEventListener('change', change);
  };
}

function getIsDesktop(): boolean {
  return window.matchMedia(desktopMediaQuery).matches;
}

export interface ChallengeWorkspaceProps {
  actions: ChallengeWorkspaceActions;
  challenges: ChallengeExperience[];
  currentCompetitor: ChallengeCompetitorStub;
  eventId: string;
  eventName: string;
  eventStartedAt?: string | null;
  firstBloodEdgeColor?: FirstBloodEdgeColor;
  firstBloodHighlightColor?: FirstBloodHighlightColor;
  flagSubmitSuccessEffect?: FlagSubmitSuccessEffect;
  getChallengeHref?: (challengeId: string, tab: ChallengeDetailTab) => string;
  onChallengeChanged?: () => Promise<void>;
  onClearSelection: () => void;
  onSelectChallenge?: (challengeId: string, tab: ChallengeDetailTab) => void;
  onSelectTab?: (challengeId: string, tab: ChallengeDetailTab) => void;
  presenceMembers?: ChallengePresenceMember[];
  presenceStatus?: ChallengePresenceStatus;
  realtimeStatus?: RealtimeStatus;
  selectedChallengeId: string | null;
  selectedChallengeTab?: ChallengeDetailTab;
}

interface ImmediateSelection {
  current: string | null;
  sourceTab: ChallengeDetailTab;
  source: string | null;
  tab: ChallengeDetailTab;
}

const scrollMemoryDelay = 120;
const splitShortcutStep = 4;

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

function availableTab(
  challenge: ChallengeExperience | null | undefined,
  requestedTab: ChallengeDetailTab,
  actions: ChallengeWorkspaceActions
): ChallengeDetailTab {
  if (
    requestedTab === 'writeup' &&
    (!challenge?.solved ||
      !challenge.writeups_enabled ||
      !actions.loadWriteup ||
      !actions.saveWriteup)
  ) {
    return 'details';
  }

  return requestedTab;
}

export function ChallengeWorkspace({
  actions,
  challenges,
  currentCompetitor,
  eventId,
  eventName,
  eventStartedAt,
  firstBloodEdgeColor = challengePresentationSettingsStub.firstBloodEdgeColor,
  firstBloodHighlightColor = challengePresentationSettingsStub.firstBloodHighlightColor,
  flagSubmitSuccessEffect = challengePresentationSettingsStub.flagSubmitSuccessEffect,
  getChallengeHref,
  onChallengeChanged,
  onClearSelection,
  onSelectChallenge,
  onSelectTab,
  presenceMembers = [],
  presenceStatus = 'idle',
  realtimeStatus = 'disabled',
  selectedChallengeId,
  selectedChallengeTab = 'details'
}: ChallengeWorkspaceProps) {
  const isDesktop = useSyncExternalStore(subscribeToDesktop, getIsDesktop, () => true);
  const getMemorySnapshot = useCallback(() => challengeWorkspaceMemorySnapshot(eventId), [eventId]);
  const memorySnapshot = useSyncExternalStore(
    subscribeToChallengeWorkspaceMemory,
    getMemorySnapshot,
    getServerChallengeWorkspaceMemorySnapshot
  );
  const workspaceMemory = useMemo(
    () => parseChallengeWorkspaceMemory(memorySnapshot),
    [memorySnapshot]
  );
  const requestedChallenge = challenges.find((challenge) => challenge.id === selectedChallengeId);
  const requestedTab = availableTab(requestedChallenge, selectedChallengeTab, actions);
  const [immediateSelection, setImmediateSelection] = useState<ImmediateSelection>({
    current: selectedChallengeId,
    source: selectedChallengeId,
    sourceTab: requestedTab,
    tab: requestedTab
  });
  const [optimisticSolveTimes, setOptimisticSolveTimes] = useState<ReadonlyMap<string, string>>(
    new Map()
  );
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [focusedChallengeId, setFocusedChallengeId] = useState<string | null>(null);
  let immediateSelectedChallengeId = immediateSelection.current;
  let immediateSelectedTab = immediateSelection.tab;

  if (
    immediateSelection.source !== selectedChallengeId ||
    immediateSelection.sourceTab !== requestedTab
  ) {
    immediateSelectedChallengeId = selectedChallengeId;
    immediateSelectedTab = requestedTab;
    setImmediateSelection({
      current: selectedChallengeId,
      source: selectedChallengeId,
      sourceTab: requestedTab,
      tab: requestedTab
    });
  }
  const collectionScrollRef = useRef<HTMLDivElement>(null);
  const collectionScrollTimerRef = useRef<number | null>(null);
  const collapsedRailRef = useRef<HTMLElement>(null);
  const answerInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const splitWorkspaceRef = useRef<SplitWorkspaceHandle>(null);
  const restoreSelectionFocusRef = useRef(false);
  const selectionTriggerRef = useRef<HTMLElement | null>(null);
  const displayedChallenges = useMemo(() => {
    return challenges.map((challenge) => {
      return optimisticSolveTimes.has(challenge.id) ? { ...challenge, solved: true } : challenge;
    });
  }, [challenges, optimisticSolveTimes]);
  const baseSolveContexts = useMemo(() => {
    return createChallengeSolveContextMap({
      challenges,
      currentCompetitor,
      eventStartedAt
    });
  }, [challenges, currentCompetitor, eventStartedAt]);
  const solveContexts = useMemo(() => {
    const next = new Map(baseSolveContexts);

    for (const [challengeId, solvedAt] of optimisticSolveTimes) {
      const context = next.get(challengeId);

      if (context) {
        next.set(challengeId, appendCurrentCompetitorSolve(context, currentCompetitor, solvedAt));
      }
    }

    return next;
  }, [baseSolveContexts, currentCompetitor, optimisticSolveTimes]);
  const standing = useMemo(() => {
    return createChallengeEventStandingStub({
      challenges: displayedChallenges,
      currentCompetitor,
      eventId,
      eventStartedAt
    });
  }, [currentCompetitor, displayedChallenges, eventId, eventStartedAt]);
  const selectedChallenge =
    displayedChallenges.find((challenge) => challenge.id === immediateSelectedChallengeId) ?? null;
  const isFocusModeActive = focusedChallengeId === selectedChallenge?.id;
  const presenceByChallenge = useMemo(() => {
    const grouped = new Map<string, ChallengePresenceMember[]>();

    for (const member of presenceMembers) {
      const current = grouped.get(member.challenge_id) ?? [];
      current.push(member);
      grouped.set(member.challenge_id, current);
    }

    return grouped;
  }, [presenceMembers]);
  immediateSelectedTab = availableTab(selectedChallenge, immediateSelectedTab, actions);
  const visibleChallengeRows = useCallback(() => {
    return Array.from(
      collectionScrollRef.current?.querySelectorAll<HTMLElement>('[data-challenge-row]') ?? []
    ).filter((row) => !row.closest('[hidden], [aria-hidden="true"], [inert]'));
  }, []);
  const exitChallengeSearch = useCallback(() => {
    const selectedRow = visibleChallengeRows().find(
      (row) => row.dataset.challengeId === selectedChallenge?.id
    );

    if (selectedRow) {
      selectedRow.focus();
    } else {
      searchInputRef.current?.blur();
    }
  }, [selectedChallenge?.id, visibleChallengeRows]);
  const restoreChallengeList = useCallback(() => {
    setFocusedChallengeId(null);
    window.requestAnimationFrame(() => {
      const selectedRow = visibleChallengeRows().find(
        (row) => row.dataset.challengeId === selectedChallenge?.id
      );
      selectedRow?.focus();
    });
  }, [selectedChallenge?.id, visibleChallengeRows]);
  const collapseChallengeList = useCallback(() => {
    if (!selectedChallenge) {
      return;
    }

    setFocusedChallengeId(selectedChallenge.id);
    window.requestAnimationFrame(() => {
      collapsedRailRef.current?.querySelector<HTMLElement>('button')?.focus();
    });
  }, [selectedChallenge]);

  useEffect(() => {
    const scrollOwner = collectionScrollRef.current;

    if (scrollOwner) {
      scrollOwner.scrollTop = workspaceMemory.listScrollTop;
    }
  }, [eventId, isDesktop, workspaceMemory.listScrollTop]);

  useEffect(() => {
    const scrollOwner = collectionScrollRef.current;

    return () => {
      if (collectionScrollTimerRef.current) {
        window.clearTimeout(collectionScrollTimerRef.current);
      }

      if (scrollOwner) {
        rememberChallengeListScroll(eventId, scrollOwner.scrollTop);
      }
    };
  }, [eventId, isDesktop]);

  useEffect(() => {
    if (selectedChallengeId || !restoreSelectionFocusRef.current) {
      return;
    }

    restoreSelectionFocusRef.current = false;
    window.requestAnimationFrame(() => {
      selectionTriggerRef.current?.focus();
    });
  }, [selectedChallengeId]);

  function closeDetail() {
    restoreSelectionFocusRef.current = true;
    setFocusedChallengeId(null);
    setImmediateSelection({
      current: null,
      source: selectedChallengeId,
      sourceTab: selectedChallengeTab,
      tab: 'details'
    });
    onClearSelection();
  }

  const selectChallenge = useCallback(
    (challengeId: string, trigger: HTMLElement) => {
      selectionTriggerRef.current = trigger;
      setImmediateSelection({
        current: challengeId,
        source: selectedChallengeId,
        sourceTab: selectedChallengeTab,
        tab: 'details'
      });
      onSelectChallenge?.(challengeId, 'details');
    },
    [onSelectChallenge, selectedChallengeId, selectedChallengeTab]
  );

  const selectTab = useCallback(
    (tab: ChallengeDetailTab) => {
      if (!selectedChallenge) {
        return;
      }

      const resolvedTab = availableTab(selectedChallenge, tab, actions);
      setImmediateSelection((current) => ({
        ...current,
        tab: resolvedTab
      }));
      onSelectTab?.(selectedChallenge.id, resolvedTab);
    },
    [actions, onSelectTab, selectedChallenge]
  );

  function rememberCollectionScroll(scrollTop: number) {
    if (collectionScrollTimerRef.current) {
      window.clearTimeout(collectionScrollTimerRef.current);
    }

    collectionScrollTimerRef.current = window.setTimeout(() => {
      rememberChallengeListScroll(eventId, scrollTop);
      collectionScrollTimerRef.current = null;
    }, scrollMemoryDelay);
  }

  useEffect(() => {
    function moveChallengeSelection(direction: 1 | -1) {
      const rows = visibleChallengeRows();

      if (rows.length === 0) {
        return;
      }

      const activeElement = document.activeElement;
      const activeIndex = rows.findIndex(
        (row) => row === activeElement || (activeElement && row.contains(activeElement))
      );
      const selectedIndex = rows.findIndex(
        (row) => row.dataset.challengeId === selectedChallenge?.id
      );
      const currentIndex = activeIndex >= 0 ? activeIndex : selectedIndex;
      const nextIndex =
        currentIndex < 0
          ? direction > 0
            ? 0
            : rows.length - 1
          : Math.min(Math.max(currentIndex + direction, 0), rows.length - 1);
      const nextRow = rows[nextIndex];
      const nextChallengeId = nextRow?.dataset.challengeId;

      if (!nextRow || !nextChallengeId) {
        return;
      }

      nextRow.focus();

      if (nextChallengeId !== selectedChallenge?.id) {
        selectChallenge(nextChallengeId, nextRow);
      }
    }

    function handleWorkspaceShortcut(event: globalThis.KeyboardEvent) {
      const hasOpenOverlay = Boolean(
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      );

      if (event.key === 'Escape' && event.target === searchInputRef.current) {
        event.preventDefault();
        exitChallengeSearch();
        return;
      }

      if (event.key === 'Escape' && isFocusModeActive && !hasOpenOverlay) {
        event.preventDefault();
        restoreChallengeList();
        return;
      }

      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTextEntryTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLocaleLowerCase();

      if (event.key === '?' && (!hasOpenOverlay || isShortcutHelpOpen)) {
        event.preventDefault();
        setIsShortcutHelpOpen((current) => !current);
        return;
      }

      if (hasOpenOverlay) {
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (!isFocusModeActive && (key === 'j' || key === 'k')) {
        event.preventDefault();
        moveChallengeSelection(key === 'j' ? 1 : -1);
        return;
      }

      if (selectedChallenge && (key === 'd' || key === 's' || key === 'h')) {
        event.preventDefault();
        selectTab(key === 'd' ? 'details' : key === 's' ? 'solves' : 'hints');
        return;
      }

      if (selectedChallenge && key === 'a') {
        event.preventDefault();
        answerInputRef.current?.focus();
        return;
      }

      if (isDesktop && selectedChallenge && key === 'f') {
        event.preventDefault();
        if (isFocusModeActive) {
          restoreChallengeList();
        } else {
          collapseChallengeList();
        }
        return;
      }

      if (!isFocusModeActive && isDesktop && (event.key === '[' || event.key === ']')) {
        event.preventDefault();
        splitWorkspaceRef.current?.adjustBy(
          event.key === '[' ? -splitShortcutStep : splitShortcutStep
        );
        return;
      }
    }

    window.addEventListener('keydown', handleWorkspaceShortcut);
    return () => {
      window.removeEventListener('keydown', handleWorkspaceShortcut);
    };
  }, [
    exitChallengeSearch,
    collapseChallengeList,
    isDesktop,
    isFocusModeActive,
    isShortcutHelpOpen,
    restoreChallengeList,
    selectChallenge,
    selectTab,
    selectedChallenge,
    visibleChallengeRows
  ]);

  function handleSolved(challengeId: string, solvedAt: string) {
    setOptimisticSolveTimes((current) => {
      const next = new Map(current);
      next.set(challengeId, solvedAt);
      return next;
    });
  }

  const collection = (
    <ChallengeCollection
      challenges={displayedChallenges}
      eventId={eventId}
      firstBloodHighlightColor={firstBloodHighlightColor}
      getChallengeHref={(challengeId) => {
        return getChallengeHref?.(challengeId, 'details');
      }}
      onCollapseChallengeList={isDesktop && selectedChallenge ? collapseChallengeList : undefined}
      onExitSearch={exitChallengeSearch}
      onSelectChallenge={(challengeId, trigger) => {
        selectChallenge(challengeId, trigger);
      }}
      selectedChallengeId={immediateSelectedChallengeId}
      searchInputRef={searchInputRef}
      showDetailFocusLink={Boolean(isDesktop && selectedChallenge)}
      solveContexts={solveContexts}
      presenceByChallenge={presenceByChallenge}
    />
  );
  const detail = selectedChallenge ? (
    <ChallengeDetail
      actions={actions}
      answerInputRef={answerInputRef}
      challenge={selectedChallenge}
      eventId={eventId}
      firstBloodEdgeColor={firstBloodEdgeColor}
      firstBloodHighlightColor={firstBloodHighlightColor}
      flagSubmitSuccessEffect={flagSubmitSuccessEffect}
      key={selectedChallenge.id}
      onChallengeChanged={onChallengeChanged}
      onSolved={handleSolved}
      onTabChange={selectTab}
      selectedTab={immediateSelectedTab}
      shareHref={getChallengeHref?.(selectedChallenge.id, 'details')}
      showListFocusLink
      solveContext={solveContexts.get(selectedChallenge.id)!}
    />
  ) : (
    <EmptyState appearance="plain" className="h-full" title="No challenge selected" />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-event-id={eventId}>
      <ChallengeEventTrail
        challenges={displayedChallenges}
        eventName={eventName}
        isShortcutHelpOpen={isShortcutHelpOpen}
        onShortcutHelpOpenChange={setIsShortcutHelpOpen}
        standing={standing}
        presenceStatus={presenceStatus}
        realtimeStatus={realtimeStatus}
      />
      {isDesktop ? (
        <div className="min-h-0 flex-1">
          <SplitWorkspace
            appearance="workspace"
            ariaLabel="Challenge list width"
            collapsedLeft={
              <ChallengeCollapsedRail
                onShowChallengeList={() => {
                  restoreChallengeList();
                }}
                railRef={collapsedRailRef}
              />
            }
            defaultValue={34}
            left={collection}
            isLeftCollapsed={isFocusModeActive}
            maximum={48}
            minimum={20}
            leftScrollRef={collectionScrollRef}
            onLeftScroll={(event) => {
              rememberCollectionScroll(event.currentTarget.scrollTop);
            }}
            persistenceKey="challenge-list"
            right={detail}
            workspaceHandleRef={splitWorkspaceRef}
          />
        </div>
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-md bg-surface-raised"
          onScroll={(event) => {
            rememberCollectionScroll(event.currentTarget.scrollTop);
          }}
          ref={collectionScrollRef}
        >
          {collection}
        </div>
      )}
      {!isDesktop && selectedChallenge ? (
        <Sheet
          contentClassName="p-0"
          isOpen
          onOpenChange={(open) => {
            if (!open) {
              closeDetail();
            }
          }}
          title={selectedChallenge.name}
        >
          <ChallengeDetail
            actions={actions}
            answerInputRef={answerInputRef}
            challenge={selectedChallenge}
            eventId={eventId}
            firstBloodEdgeColor={firstBloodEdgeColor}
            firstBloodHighlightColor={firstBloodHighlightColor}
            flagSubmitSuccessEffect={flagSubmitSuccessEffect}
            key={selectedChallenge.id}
            onChallengeChanged={onChallengeChanged}
            onSolved={handleSolved}
            onTabChange={selectTab}
            selectedTab={immediateSelectedTab}
            shareHref={getChallengeHref?.(selectedChallenge.id, 'details')}
            showTitle={false}
            solveContext={solveContexts.get(selectedChallenge.id)!}
          />
        </Sheet>
      ) : null}
    </div>
  );
}
