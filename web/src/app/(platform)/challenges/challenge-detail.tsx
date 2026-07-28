'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';

import { ChallengeDescription, ChallengeResources } from './challenge-content';
import { ChallengeDetailHeader } from './challenge-detail-header';
import { ChallengeHints } from './challenge-hints';
import { ChallengeInstance } from './challenge-instance';
import {
  firstBloodToastTone,
  type FirstBloodEdgeColor,
  type FirstBloodHighlightColor,
  type FlagSubmitSuccessEffect
} from './challenge-presentation';
import type { ChallengeSolveContext } from './challenge-solve-stub';
import { ChallengeSolvedSummary, ChallengeSolves, ChallengeSolveStrip } from './challenge-solves';
import { ChallengeSubmission } from './challenge-submission';
import {
  ChallengeFeedbackEffect,
  type ChallengeFeedbackEffectOrigin
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
  SkipLink,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  showToast
} from '@/components/ui';
import type { SubmissionReceipt } from '@/lib/api/client';
import { challengeConnection, type ChallengeExperience } from '@/lib/challenges';

interface ChallengeDetailProps {
  actions: ChallengeWorkspaceActions;
  answerInputRef?: RefObject<HTMLInputElement | null>;
  challenge: ChallengeExperience;
  eventId: string;
  firstBloodEdgeColor: FirstBloodEdgeColor;
  firstBloodHighlightColor: FirstBloodHighlightColor;
  flagSubmitSuccessEffect: FlagSubmitSuccessEffect;
  onChallengeChanged?: () => Promise<void>;
  onSolved?: (challengeId: string, solvedAt: string) => void;
  onTabChange: (tab: ChallengeDetailTab) => void;
  selectedTab: ChallengeDetailTab;
  shareHref?: string;
  showListFocusLink?: boolean;
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
      data-scroll-region
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
  answerInputRef,
  challenge,
  eventId,
  firstBloodEdgeColor,
  firstBloodHighlightColor,
  flagSubmitSuccessEffect,
  onChallengeChanged,
  onSolved,
  onTabChange,
  selectedTab,
  shareHref,
  showListFocusLink = false,
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
  const [feedbackEffectOrigin, setFeedbackEffectOrigin] =
    useState<ChallengeFeedbackEffectOrigin | null>(null);
  const shouldReduceMotion = useReducedMotion();
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
        tone: receipt.first_blood ? firstBloodToastTone(firstBloodHighlightColor) : 'success'
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

  function startSuccessEffect(origin: DOMRect, value: string, firstBlood: boolean) {
    if (
      flagSubmitSuccessEffect === 'none' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    setFeedbackEffectOrigin({
      height: origin.height,
      left: origin.left,
      outcome: firstBlood ? 'first-blood' : 'correct',
      top: origin.top,
      value,
      width: origin.width
    });
  }

  function startIncorrectEffect(origin: DOMRect) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    setFeedbackEffectOrigin({
      height: origin.height,
      left: origin.left,
      outcome: 'incorrect',
      top: origin.top,
      value: '',
      width: origin.width
    });
  }

  return (
    <article
      aria-label={`${challenge.name} details`}
      className="kitsune-challenge-detail relative flex h-full min-h-0 flex-col overflow-hidden bg-surface-raised"
      key={challenge.id}
    >
      {showListFocusLink ? (
        <SkipLink href="#challenge-search">Back to challenge search</SkipLink>
      ) : null}
      {feedbackEffectOrigin ? (
        <ChallengeFeedbackEffect
          effect={flagSubmitSuccessEffect}
          firstBloodEdgeColor={firstBloodEdgeColor}
          onComplete={() => setFeedbackEffectOrigin(null)}
          origin={feedbackEffectOrigin}
        />
      ) : null}
      <ChallengeDetailHeader
        challenge={resolvedChallenge}
        firstBloodHighlightColor={firstBloodHighlightColor}
        isFirstBlood={isFirstBlood}
        isPendingReview={isPendingReview}
        isSolved={isSolved}
        shareHref={shareHref}
        showTitle={showTitle}
        solveCount={solveContext.totalSolves}
      />

      <Tabs
        layout="workspace"
        onSelectionChange={(key) => {
          onTabChange(challengeDetailTab(key));
        }}
        selectedKey={selectedTab}
      >
        <TabsList aria-label="Challenge sections" className="shrink-0 border-b-0 px-6">
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
            <ChallengeDescription challengeId={challenge.id} content={challenge.description} />

            <ChallengeResources
              attachments={challenge.attachments}
              challengeId={challenge.id}
              connection={connection}
            />

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
              <section aria-labelledby={`rating-${challenge.id}`} className="grid gap-4">
                <h3 className="m-0 text-base font-semibold text-text" id={`rating-${challenge.id}`}>
                  Rate this challenge
                </h3>
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
          <div className="grid w-full">
            <AnimatePresence initial={false}>
              {selectedTab === 'details' ? (
                <motion.div
                  animate={{ height: 'auto', opacity: 1 }}
                  className="overflow-hidden"
                  exit={{ height: 0, opacity: 0 }}
                  initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                  key="solve-context-drawer"
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.18, ease: [0.25, 1, 0.5, 1] }
                  }
                >
                  <div className="pb-4">
                    <ChallengeSolveStrip context={solveContext} />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {isSolved ? (
              <ChallengeSolvedSummary
                firstBloodHighlightColor={firstBloodHighlightColor}
                isFirstBlood={isFirstBlood}
                label={challenge.kind.type === 'manual_verification' ? 'Answer' : 'Flag'}
              />
            ) : (
              <ChallengeSubmission
                answerInputRef={answerInputRef}
                challenge={resolvedChallenge}
                onCorrectOrigin={startSuccessEffect}
                onIncorrectOrigin={startIncorrectEffect}
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
