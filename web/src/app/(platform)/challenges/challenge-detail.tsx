'use client';

import { Check, Trophy } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { ChallengeCategoryLabel } from './challenge-category';
import { ChallengeHints } from './challenge-hints';
import { ChallengeInstance } from './challenge-instance';
import type { FirstBloodEdgeColor, FlagSubmitSuccessEffect } from './challenge-presentation';
import type { ChallengeSolveContext } from './challenge-solve-stub';
import { ChallengeSolvedSummary, ChallengeSolves, ChallengeSolveStrip } from './challenge-solves';
import { ChallengeSubmission } from './challenge-submission';
import {
  ChallengeSuccessEffect,
  type ChallengeSuccessEffectOrigin
} from './challenge-success-effect';
import { ChallengeSurvey } from './challenge-survey';
import type { ChallengeWorkspaceActions } from './challenge-types';
import {
  challengeDetailTab,
  challengeWorkspaceMemorySnapshot,
  parseChallengeWorkspaceMemory,
  rememberChallengeScroll,
  type ChallengeDetailTab
} from './challenge-workspace-memory';
import { ChallengeWriteup } from './challenge-writeup';
import {
  Alert,
  CodeBlock,
  Link,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  showToast
} from '@/components/ui';
import type { SubmissionReceipt } from '@/lib/api/client';
import {
  challengeAttempts,
  challengeConnection,
  challengePoints,
  type ChallengeExperience
} from '@/lib/challenges';

interface ChallengeDetailProps {
  actions: ChallengeWorkspaceActions;
  challenge: ChallengeExperience;
  eventId: string;
  firstBloodEdgeColor: FirstBloodEdgeColor;
  flagSubmitSuccessEffect: FlagSubmitSuccessEffect;
  onChallengeChanged?: () => Promise<void>;
  onSolved?: (challengeId: string, solvedAt: string) => void;
  onTabChange: (tab: ChallengeDetailTab) => void;
  selectedTab: ChallengeDetailTab;
  showTitle?: boolean;
  solveContext: ChallengeSolveContext;
}

interface RememberedTabPanelProps {
  challengeId: string;
  children: ReactNode;
  eventId: string;
  tab: ChallengeDetailTab;
}

function RememberedTabPanel({ challengeId, children, eventId, tab }: RememberedTabPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const panel = panelRef.current;

    if (panel) {
      const memory = parseChallengeWorkspaceMemory(challengeWorkspaceMemorySnapshot(eventId));
      panel.scrollTop = memory.challenges[challengeId]?.scrollTop[tab] ?? 0;
    }

    return () => {
      if (scrollTimerRef.current) {
        window.clearTimeout(scrollTimerRef.current);
      }

      if (panel) {
        rememberChallengeScroll(eventId, challengeId, tab, panel.scrollTop);
      }
    };
  }, [challengeId, eventId, tab]);

  return (
    <TabsPanel
      className="kitsune-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-none"
      id={tab}
      onScroll={(event) => {
        if (scrollTimerRef.current) {
          window.clearTimeout(scrollTimerRef.current);
        }

        const scrollTop = event.currentTarget.scrollTop;
        scrollTimerRef.current = window.setTimeout(() => {
          rememberChallengeScroll(eventId, challengeId, tab, scrollTop);
          scrollTimerRef.current = null;
        }, 120);
      }}
      panelRef={panelRef}
      shouldForceMount
    >
      {children}
    </TabsPanel>
  );
}

export function ChallengeDetail({
  actions,
  challenge,
  eventId,
  firstBloodEdgeColor,
  flagSubmitSuccessEffect,
  onChallengeChanged,
  onSolved,
  onTabChange,
  selectedTab,
  showTitle = true,
  solveContext
}: ChallengeDetailProps) {
  const [attemptsRemaining, setAttemptsRemaining] = useState(challenge.attemptsRemaining);
  const [gateComplete, setGateComplete] = useState(false);
  const [isPendingReview, setIsPendingReview] = useState(false);
  const [isFirstBlood, setIsFirstBlood] = useState(
    challenge.solved && solveContext.selfEntry?.rank === 1
  );
  const [isSolved, setIsSolved] = useState(challenge.solved);
  const [postSolveSurveyComplete, setPostSolveSurveyComplete] = useState(false);
  const [successEffectOrigin, setSuccessEffectOrigin] =
    useState<ChallengeSuccessEffectOrigin | null>(null);
  const connection = challengeConnection(challenge);
  const resolvedChallenge: ChallengeExperience = {
    ...challenge,
    attemptsRemaining,
    solved: isSolved
  };

  async function handleReceipt(receipt: SubmissionReceipt) {
    if (typeof receipt.attempts_remaining === 'number') {
      setAttemptsRemaining(receipt.attempts_remaining);
    }

    if (receipt.outcome === 'correct') {
      setIsPendingReview(false);
      setIsFirstBlood(receipt.first_blood);
      setIsSolved(true);
      onSolved?.(challenge.id, receipt.submitted_at);
      showToast({
        description: receipt.first_blood
          ? `First blood and ${receipt.awarded_points} points.`
          : `${receipt.awarded_points} points awarded.`,
        title: 'Challenge solved',
        tone: receipt.first_blood ? 'firstBlood' : 'success'
      });
      await onChallengeChanged?.();
      return;
    }

    if (receipt.outcome === 'pending') {
      setIsPendingReview(true);
      showToast({
        title: 'Submitted for review',
        tone: 'info'
      });
    }
  }

  async function submitSurvey(answers: Record<string, number>) {
    await actions.submitSurvey(challenge.id, answers);
  }

  const showGate = challenge.surveyMode === 'gate' && challenge.survey.length > 0;
  const showPostSolveSurvey =
    challenge.surveyMode === 'post_solve' && challenge.survey.length > 0 && isSolved;
  const hasResources = Boolean(connection) || challenge.attachments.length > 0;
  function startSuccessEffect(origin: DOMRect, value: string, firstBlood: boolean) {
    if (
      flagSubmitSuccessEffect === 'none' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    setSuccessEffectOrigin({
      height: origin.height,
      isFirstBlood: firstBlood,
      left: origin.left,
      top: origin.top,
      value,
      width: origin.width
    });
  }

  return (
    <article
      className="kitsune-challenge-detail flex h-full min-h-0 flex-col overflow-hidden bg-surface-raised"
      key={challenge.id}
    >
      {successEffectOrigin ? (
        <ChallengeSuccessEffect
          effect={flagSubmitSuccessEffect}
          firstBloodEdgeColor={firstBloodEdgeColor}
          onComplete={() => setSuccessEffectOrigin(null)}
          origin={successEffectOrigin}
        />
      ) : null}
      <header className="shrink-0 px-6 py-6">
        <div className="flex w-full items-start justify-between gap-6">
          <div className="grid min-w-0 gap-2">
            {showTitle ? (
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="m-0 font-display text-xl font-semibold tracking-tight text-text">
                  {challenge.name}
                </h2>
                {challenge.authorName ? (
                  <span className="text-sm text-text-muted">by {challenge.authorName}</span>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
              <ChallengeCategoryLabel category={challenge.category} />
              <span>{challengeAttempts(resolvedChallenge)}</span>
              <span className="tabular-nums">
                {solveContext.totalSolves.toLocaleString()} solves
              </span>
              {isSolved ? (
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    isFirstBlood ? 'text-first-blood-text' : 'text-success-text'
                  }`}
                >
                  {isFirstBlood ? (
                    <Trophy aria-hidden className="size-4 -translate-y-optical" />
                  ) : (
                    <Check aria-hidden className="size-4" />
                  )}
                  {isFirstBlood ? 'First blood' : 'Solved'}
                </span>
              ) : null}
              {isPendingReview ? (
                <span className="font-medium text-info-text">Pending review</span>
              ) : null}
            </div>
          </div>
          <strong className="shrink-0 text-lg tabular-nums text-text">
            {challengePoints(resolvedChallenge)}
          </strong>
        </div>
      </header>

      <Tabs
        layout="workspace"
        onSelectionChange={(key) => {
          onTabChange(challengeDetailTab(key));
        }}
        selectedKey={selectedTab}
      >
        <TabsList aria-label="Challenge sections" className="shrink-0 border-b-0 px-3">
          <TabsTab id="details">Details</TabsTab>
          <TabsTab id="solves">
            <strong className="font-semibold tabular-nums">
              {solveContext.totalSolves.toLocaleString()}
            </strong>{' '}
            {solveContext.totalSolves === 1 ? 'Solve' : 'Solves'}
          </TabsTab>
          <TabsTab id="hints">Hints</TabsTab>
          {isSolved && challenge.writeups_enabled && actions.loadWriteup && actions.saveWriteup ? (
            <TabsTab id="writeup">Writeup</TabsTab>
          ) : null}
        </TabsList>

        <RememberedTabPanel challengeId={challenge.id} eventId={eventId} tab="details">
          <div className="grid w-full content-start gap-6 px-6 py-6">
            <section
              aria-labelledby={`description-${challenge.id}`}
              className="grid gap-3 rounded-md border border-border-subtle bg-surface-sunken p-4"
            >
              <h3
                className="m-0 text-sm font-semibold text-text"
                id={`description-${challenge.id}`}
              >
                Description
              </h3>
              <p className="m-0 max-w-prose whitespace-pre-line text-base text-text-muted">
                {challenge.description}
              </p>
            </section>

            {hasResources ? (
              <section aria-labelledby={`resources-${challenge.id}`} className="grid gap-3">
                <h3
                  className="m-0 text-sm font-semibold text-text"
                  id={`resources-${challenge.id}`}
                >
                  Resources
                </h3>
                {connection ? <CodeBlock code={connection} label="Connection" /> : null}
                {challenge.attachments.length > 0 ? (
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {challenge.attachments.map((attachment) => (
                      <li
                        className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-sunken px-3 py-2"
                        key={attachment.id}
                      >
                        <span className="grid gap-1">
                          <strong className="text-base text-text">{attachment.label}</strong>
                          <span className="text-sm text-text-muted">{attachment.size}</span>
                        </span>
                        <Link href={attachment.url}>Download</Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {challenge.kind.type === 'dynamic_instance' ? (
              <ChallengeInstance
                state="unavailable"
                unavailableReason="Challenge instances are unavailable right now. Try again later."
              />
            ) : null}

            {challenge.kind.type === 'file_backed' && challenge.attachments.length === 0 ? (
              <Alert
                description="Ask an organizer to attach the required files."
                title="Challenge files unavailable"
                tone="info"
              />
            ) : null}

            {showGate && !gateComplete ? (
              <section aria-labelledby={`survey-${challenge.id}`} className="grid gap-4">
                <h3 className="m-0 text-base font-semibold text-text" id={`survey-${challenge.id}`}>
                  Complete the survey
                </h3>
                <ChallengeSurvey
                  challenge={challenge}
                  isGate
                  onComplete={async (answers) => {
                    await submitSurvey(answers);
                    setGateComplete(true);
                    showToast({
                      title: 'Flag revealed',
                      tone: 'success'
                    });
                  }}
                />
              </section>
            ) : showGate && challenge.surveyRewardFlag ? (
              <CodeBlock code={challenge.surveyRewardFlag} label="Survey flag" />
            ) : null}

            {showPostSolveSurvey ? (
              <section className="grid gap-4">
                <h3 className="m-0 text-base font-semibold text-text">Rate this challenge</h3>
                {postSolveSurveyComplete ? (
                  <p className="m-0 text-sm font-medium text-success-text">Rating submitted</p>
                ) : (
                  <ChallengeSurvey
                    challenge={challenge}
                    isGate={false}
                    onComplete={async (answers) => {
                      await submitSurvey(answers);
                      setPostSolveSurveyComplete(true);
                      showToast({
                        title: 'Rating submitted',
                        tone: 'success'
                      });
                    }}
                  />
                )}
              </section>
            ) : null}
          </div>
        </RememberedTabPanel>

        <RememberedTabPanel challengeId={challenge.id} eventId={eventId} tab="solves">
          <div className="w-full px-6 py-6">
            <ChallengeSolves context={solveContext} />
          </div>
        </RememberedTabPanel>

        <RememberedTabPanel challengeId={challenge.id} eventId={eventId} tab="hints">
          <div className="w-full px-6 py-6">
            <ChallengeHints
              challenge={challenge}
              loadHints={actions.loadHints}
              unlockHint={actions.unlockHint}
            />
          </div>
        </RememberedTabPanel>

        {isSolved && challenge.writeups_enabled && actions.loadWriteup && actions.saveWriteup ? (
          <RememberedTabPanel challengeId={challenge.id} eventId={eventId} tab="writeup">
            <div className="w-full px-6 py-6">
              <ChallengeWriteup
                challengeId={challenge.id}
                loadWriteup={actions.loadWriteup}
                saveWriteup={actions.saveWriteup}
                showTitle={false}
              />
            </div>
          </RememberedTabPanel>
        ) : null}
      </Tabs>

      {showGate && !gateComplete ? null : !isPendingReview ? (
        <footer className="z-20 shrink-0 bg-surface-sunken px-6 py-4">
          <div className="grid w-full gap-4">
            <ChallengeSolveStrip context={solveContext} />
            {isSolved ? (
              <ChallengeSolvedSummary
                isFirstBlood={isFirstBlood}
                label={challenge.kind.type === 'manual_verification' ? 'Answer' : 'Flag'}
              />
            ) : (
              <ChallengeSubmission
                challenge={resolvedChallenge}
                onCorrectOrigin={startSuccessEffect}
                onReceipt={handleReceipt}
                submitAnswer={actions.submitAnswer}
              />
            )}
          </div>
        </footer>
      ) : null}
    </article>
  );
}
