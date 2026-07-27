'use client';

import { Check } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { createPortal } from 'react-dom';

import { ChallengeCategoryLabel } from './challenge-category';
import { ChallengeHints } from './challenge-hints';
import { ChallengeInstance } from './challenge-instance';
import type { ChallengeSolveContext } from './challenge-solve-stub';
import { ChallengeSolvedSummary, ChallengeSolves, ChallengeSolveStrip } from './challenge-solves';
import { ChallengeSubmission } from './challenge-submission';
import { ChallengeSurvey } from './challenge-survey';
import type { ChallengeWorkspaceActions } from './challenge-types';
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
  onChallengeChanged?: () => Promise<void>;
  onSolved?: (challengeId: string, solvedAt: string) => void;
  showTitle?: boolean;
  solveContext: ChallengeSolveContext;
}

interface SolveWaveGeometry {
  diameter: number;
  originHeight: number;
  originLeft: number;
  originTop: number;
  originValue: string;
  originWidth: number;
  startScale: number;
  x: number;
  y: number;
}

interface SolveWaveStyle extends CSSProperties {
  '--solve-origin-height'?: string;
  '--solve-origin-left'?: string;
  '--solve-origin-top'?: string;
  '--solve-origin-width'?: string;
  '--solve-wave-diameter'?: string;
  '--solve-wave-start-scale'?: string;
  '--solve-wave-x'?: string;
  '--solve-wave-y'?: string;
}

export function ChallengeDetail({
  actions,
  challenge,
  onChallengeChanged,
  onSolved,
  showTitle = true,
  solveContext
}: ChallengeDetailProps) {
  const [attemptsRemaining, setAttemptsRemaining] = useState(challenge.attemptsRemaining);
  const [gateComplete, setGateComplete] = useState(false);
  const [isPendingReview, setIsPendingReview] = useState(false);
  const [isSolved, setIsSolved] = useState(challenge.solved);
  const [postSolveSurveyComplete, setPostSolveSurveyComplete] = useState(false);
  const [solveWave, setSolveWave] = useState<SolveWaveGeometry | null>(null);
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
      setIsSolved(true);
      onSolved?.(challenge.id, receipt.submitted_at);
      showToast({
        description: receipt.first_blood
          ? `First blood and ${receipt.awarded_points} points.`
          : `${receipt.awarded_points} points awarded.`,
        title: 'Challenge solved',
        tone: 'success'
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
  const solveWaveStyle: SolveWaveStyle | undefined = solveWave
    ? {
        '--solve-origin-height': `${solveWave.originHeight}px`,
        '--solve-origin-left': `${solveWave.originLeft}px`,
        '--solve-origin-top': `${solveWave.originTop}px`,
        '--solve-origin-width': `${solveWave.originWidth}px`,
        '--solve-wave-diameter': `${solveWave.diameter}px`,
        '--solve-wave-start-scale': String(solveWave.startScale),
        '--solve-wave-x': `${solveWave.x}px`,
        '--solve-wave-y': `${solveWave.y}px`
      }
    : undefined;

  function startSolveWave(origin: DOMRect, originValue: string) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const x = origin.left + origin.width / 2;
    const y = origin.top + origin.height / 2;
    const farthestCorner = Math.max(
      Math.hypot(x, y),
      Math.hypot(window.innerWidth - x, y),
      Math.hypot(x, window.innerHeight - y),
      Math.hypot(window.innerWidth - x, window.innerHeight - y)
    );
    const diameter = Math.max(1, farthestCorner * 2);

    setSolveWave({
      diameter,
      originHeight: origin.height,
      originLeft: origin.left,
      originTop: origin.top,
      originValue,
      originWidth: origin.width,
      startScale: Math.max(1, Math.min(origin.width, origin.height)) / diameter,
      x,
      y
    });
  }

  return (
    <article
      className="kitsune-challenge-detail flex h-full min-h-0 flex-col overflow-hidden bg-surface-raised"
      key={challenge.id}
    >
      {solveWave
        ? createPortal(
            <div
              aria-hidden
              className="kitsune-solve-effect pointer-events-none fixed inset-0 z-celebration"
              style={solveWaveStyle}
            >
              <span className="kitsune-solve-origin absolute flex items-center overflow-hidden whitespace-nowrap rounded-md border border-success-border bg-success-subtle px-3 font-mono text-base text-success-text">
                {solveWave.originValue}
              </span>
              <span
                className="kitsune-solve-wave absolute aspect-square rounded-full"
                onAnimationEnd={() => setSolveWave(null)}
              />
            </div>,
            document.body
          )
        : null}
      <header className="shrink-0 px-6 py-6">
        <div className="flex w-full items-start justify-between gap-6">
          <div className="grid min-w-0 gap-2">
            {showTitle ? (
              <h2 className="m-0 font-display text-xl font-semibold tracking-tight text-text">
                {challenge.name}
              </h2>
            ) : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
              <ChallengeCategoryLabel category={challenge.category} />
              <span>{challengeAttempts(resolvedChallenge)}</span>
              <span className="tabular-nums">
                {solveContext.totalSolves.toLocaleString()} solves
              </span>
              {isSolved ? (
                <span className="inline-flex items-center gap-1 font-medium text-success-text">
                  <Check aria-hidden className="size-4" />
                  Solved
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

      <Tabs defaultSelectedKey="details" layout="workspace">
        <TabsList aria-label="Challenge sections" className="shrink-0 border-b-0 px-6">
          <TabsTab className="first:pl-0" id="details">
            Details
          </TabsTab>
          <TabsTab id="solves">Solves {solveContext.totalSolves.toLocaleString()}</TabsTab>
          <TabsTab id="hints">Hints</TabsTab>
          {isSolved && challenge.writeups_enabled && actions.loadWriteup && actions.saveWriteup ? (
            <TabsTab id="writeup">Writeup</TabsTab>
          ) : null}
        </TabsList>

        <TabsPanel
          className="kitsune-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-none"
          id="details"
          shouldForceMount
        >
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
        </TabsPanel>

        <TabsPanel
          className="kitsune-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-none"
          id="solves"
          shouldForceMount
        >
          <div className="w-full px-6 py-6">
            <ChallengeSolves context={solveContext} />
          </div>
        </TabsPanel>

        <TabsPanel
          className="kitsune-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-none"
          id="hints"
          shouldForceMount
        >
          <div className="w-full px-6 py-6">
            <ChallengeHints
              challenge={challenge}
              loadHints={actions.loadHints}
              unlockHint={actions.unlockHint}
            />
          </div>
        </TabsPanel>

        {isSolved && challenge.writeups_enabled && actions.loadWriteup && actions.saveWriteup ? (
          <TabsPanel
            className="kitsune-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-none"
            id="writeup"
            shouldForceMount
          >
            <div className="w-full px-6 py-6">
              <ChallengeWriteup
                challengeId={challenge.id}
                loadWriteup={actions.loadWriteup}
                saveWriteup={actions.saveWriteup}
                showTitle={false}
              />
            </div>
          </TabsPanel>
        ) : null}
      </Tabs>

      {showGate && !gateComplete ? null : !isPendingReview ? (
        <footer className="z-20 shrink-0 bg-surface-sunken px-6 py-4">
          <div className="grid w-full gap-4">
            <ChallengeSolveStrip context={solveContext} />
            {isSolved ? (
              <ChallengeSolvedSummary />
            ) : (
              <ChallengeSubmission
                challenge={resolvedChallenge}
                onCorrectOrigin={startSolveWave}
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
