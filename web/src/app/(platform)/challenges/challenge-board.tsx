'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { createChallengeDemo, createChallengeDemoActions } from './challenge-demo';
import { ChallengeWorkspace } from './challenge-workspace';
import { challengeSelection } from '@/lib/challenges';

function challengePath(pathname: string, searchParams: URLSearchParams, challengeId?: string) {
  const next = new URLSearchParams(searchParams);

  if (challengeId) {
    next.set('challenge', challengeId);
  } else {
    next.delete('challenge');
  }

  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function ChallengeBoard() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const resolvedPathname = pathname ?? '/challenges';
  const resolvedSearchParams = searchParams?.toString() ?? '';
  const requestedChallengeId = challengeSelection(new URLSearchParams(resolvedSearchParams));
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
      eventName="Kitsune Open 2026"
      eventStartedAt="2026-07-26T04:00:00Z"
      getChallengeHref={(challengeId) => {
        return challengePath(
          resolvedPathname,
          new URLSearchParams(resolvedSearchParams),
          challengeId
        );
      }}
      onClearSelection={() => {
        router.push(challengePath(resolvedPathname, new URLSearchParams(resolvedSearchParams)));
      }}
      onSelectChallenge={() => undefined}
      selectedChallengeId={selectedChallengeId}
    />
  );
}
