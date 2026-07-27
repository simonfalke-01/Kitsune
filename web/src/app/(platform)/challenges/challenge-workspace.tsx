'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { ChallengeCollection } from './challenge-collection';
import { ChallengeDetail } from './challenge-detail';
import { ChallengeEventTrail } from './challenge-event-trail';
import { ChallengeOverview } from './challenge-overview';
import {
  challengePresentationSettingsStub,
  type FlagSubmitSuccessEffect
} from './challenge-presentation';
import {
  appendCurrentCompetitorSolve,
  createChallengeEventStandingStub,
  createChallengeSolveContextMap,
  type ChallengeCompetitorStub
} from './challenge-solve-stub';
import type { ChallengeWorkspaceActions } from './challenge-types';
import { Sheet, SplitWorkspace } from '@/components/ui';
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
  flagSubmitSuccessEffect?: FlagSubmitSuccessEffect;
  getChallengeHref?: (challengeId: string) => string;
  onChallengeChanged?: () => Promise<void>;
  onClearSelection: () => void;
  onSelectChallenge?: (challengeId: string) => void;
  selectedChallengeId: string | null;
}

interface ImmediateSelection {
  current: string | null;
  source: string | null;
}

export function ChallengeWorkspace({
  actions,
  challenges,
  currentCompetitor,
  eventId,
  eventName,
  eventStartedAt,
  flagSubmitSuccessEffect = challengePresentationSettingsStub.flagSubmitSuccessEffect,
  getChallengeHref,
  onChallengeChanged,
  onClearSelection,
  onSelectChallenge,
  selectedChallengeId
}: ChallengeWorkspaceProps) {
  const isDesktop = useSyncExternalStore(subscribeToDesktop, getIsDesktop, () => true);
  const [immediateSelection, setImmediateSelection] = useState<ImmediateSelection>({
    current: selectedChallengeId,
    source: selectedChallengeId
  });
  const [optimisticSolveTimes, setOptimisticSolveTimes] = useState<ReadonlyMap<string, string>>(
    new Map()
  );
  let immediateSelectedChallengeId = immediateSelection.current;

  if (immediateSelection.source !== selectedChallengeId) {
    immediateSelectedChallengeId = selectedChallengeId;
    setImmediateSelection({
      current: selectedChallengeId,
      source: selectedChallengeId
    });
  }
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
    setImmediateSelection({ current: null, source: selectedChallengeId });
    onClearSelection();
  }

  function selectChallenge(challengeId: string, trigger: HTMLElement) {
    selectionTriggerRef.current = trigger;
    setImmediateSelection({ current: challengeId, source: selectedChallengeId });
    onSelectChallenge?.(challengeId);
  }

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
      getChallengeHref={getChallengeHref}
      onSelectChallenge={(challengeId, trigger) => {
        selectChallenge(challengeId, trigger);
      }}
      selectedChallengeId={immediateSelectedChallengeId}
      solveContexts={solveContexts}
    />
  );
  const detail = selectedChallenge ? (
    <ChallengeDetail
      actions={actions}
      challenge={selectedChallenge}
      flagSubmitSuccessEffect={flagSubmitSuccessEffect}
      key={selectedChallenge.id}
      onChallengeChanged={onChallengeChanged}
      onSolved={handleSolved}
      solveContext={solveContexts.get(selectedChallenge.id)!}
    />
  ) : (
    <ChallengeOverview
      challenges={displayedChallenges}
      getChallengeHref={getChallengeHref}
      onSelectChallenge={(challengeId, trigger) => {
        selectChallenge(challengeId, trigger);
      }}
      solveContexts={solveContexts}
      standing={standing}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-event-id={eventId}>
      <ChallengeEventTrail
        challenges={displayedChallenges}
        eventName={eventName}
        selectedChallenge={selectedChallenge}
        standing={standing}
      />
      {isDesktop ? (
        <div className="min-h-0 flex-1">
          <SplitWorkspace
            appearance="workspace"
            ariaLabel="Challenge list width"
            defaultValue={38}
            left={collection}
            maximum={48}
            minimum={28}
            right={detail}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-surface-raised">
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
            challenge={selectedChallenge}
            flagSubmitSuccessEffect={flagSubmitSuccessEffect}
            key={selectedChallenge.id}
            onChallengeChanged={onChallengeChanged}
            onSolved={handleSolved}
            showTitle={false}
            solveContext={solveContexts.get(selectedChallenge.id)!}
          />
        </Sheet>
      ) : null}
    </div>
  );
}
