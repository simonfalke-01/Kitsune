'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { createChallengeDemo, createChallengeDemoActions } from './challenge-demo';
import { challengeDetailTab, challengeWorkspacePath } from './challenge-workspace-memory';
import { ChallengeWorkspace } from './challenge-workspace';
import { challengeSelection } from '@/lib/challenges';

export function ChallengeBoard() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedPathname = pathname ?? '/challenges';
  const resolvedSearchParams = searchParams?.toString() ?? '';
  const requestedChallengeId = challengeSelection(new URLSearchParams(resolvedSearchParams));
  const requestedTab = challengeDetailTab(new URLSearchParams(resolvedSearchParams).get('tab'));
  const challenges = useMemo(() => createChallengeDemo('demo-event'), []);
  const actions = useMemo(() => createChallengeDemoActions(challenges), [challenges]);
  const selectedChallengeId = requestedChallengeId
    ? challenges.some((challenge) => challenge.id === requestedChallengeId)
      ? requestedChallengeId
      : (challenges[0]?.id ?? null)
    : null;

  return (
    <ChallengeWorkspace
      actions={actions}
      challenges={challenges}
      currentCompetitor={{
        id: 'kitsune-labs',
        name: 'Kitsune Labs'
      }}
      eventId="demo-event"
      eventName="Kitsune Open"
      eventStartedAt="2026-07-26T04:00:00Z"
      getChallengeHref={(challengeId, tab) => {
        return challengeWorkspacePath(
          resolvedPathname,
          new URLSearchParams(resolvedSearchParams),
          challengeId,
          tab
        );
      }}
      onClearSelection={() => {
        router.push(
          challengeWorkspacePath(resolvedPathname, new URLSearchParams(resolvedSearchParams))
        );
      }}
      onSelectChallenge={(challengeId, tab) => {
        router.push(
          challengeWorkspacePath(
            resolvedPathname,
            new URLSearchParams(resolvedSearchParams),
            challengeId,
            tab
          )
        );
      }}
      onSelectTab={(challengeId, tab) => {
        router.push(
          challengeWorkspacePath(
            resolvedPathname,
            new URLSearchParams(resolvedSearchParams),
            challengeId,
            tab
          )
        );
      }}
      selectedChallengeId={selectedChallengeId}
      selectedChallengeTab={requestedTab}
    />
  );
}
