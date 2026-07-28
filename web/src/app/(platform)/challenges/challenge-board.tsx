'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { createChallengeApiActions } from './challenge-api-actions';
import {
  createChallengeDemo,
  createChallengeDemoActions,
  createChallengeDemoPresence
} from './challenge-demo';
import { useChallengePresence } from './use-challenge-presence';
import { challengeDetailTab, challengeWorkspacePath } from './challenge-workspace-memory';
import { ChallengeWorkspace } from './challenge-workspace';
import { useEvent } from '@/app/event-context';
import { useRealtime } from '@/app/realtime-context';
import { useSession } from '@/app/session-context';
import { Alert, Button, EmptyState, Skeleton } from '@/components/ui';
import { challengeSelection, createChallengeExperience } from '@/lib/challenges';

export function ChallengeBoard() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    challenges: eventChallenges,
    error: eventError,
    isLoading: isEventLoading,
    refresh: refreshEvents,
    refreshChallenges,
    selectedEvent
  } = useEvent();
  const { status: realtimeStatus } = useRealtime();
  const { can, isAuthenticated, session } = useSession();
  const resolvedPathname = pathname ?? '/challenges';
  const resolvedSearchParams = searchParams?.toString() ?? '';
  const requestedChallengeId = challengeSelection(new URLSearchParams(resolvedSearchParams));
  const requestedTab = challengeDetailTab(new URLSearchParams(resolvedSearchParams).get('tab'));
  const demoChallenges = useMemo(() => createChallengeDemo('demo-event'), []);
  const demoPresence = useMemo(() => createChallengeDemoPresence(), []);
  const authenticatedChallenges = useMemo(
    () => eventChallenges.map((challenge) => createChallengeExperience(challenge)),
    [eventChallenges]
  );
  const isDemo = !isAuthenticated || !session;
  const challenges = isDemo ? demoChallenges : authenticatedChallenges;
  const eventId = isDemo ? 'demo-event' : (selectedEvent?.id ?? '');
  const eventName = isDemo ? 'Kitsune Open' : (selectedEvent?.name ?? 'Challenges');
  const actions = useMemo(() => {
    return isDemo
      ? createChallengeDemoActions(demoChallenges)
      : createChallengeApiActions(eventId, session.csrf_token);
  }, [demoChallenges, eventId, isDemo, session]);
  const selectedChallengeId = requestedChallengeId
    ? challenges.some((challenge) => challenge.id === requestedChallengeId)
      ? requestedChallengeId
      : (challenges[0]?.id ?? null)
    : null;
  const presence = useChallengePresence({
    csrfToken: session?.csrf_token ?? null,
    eventId,
    isEnabled:
      !isDemo &&
      Boolean(selectedEvent) &&
      can('challenge_read') &&
      can('event_read') &&
      can('team_join'),
    selectedChallengeId
  });

  if (!isDemo && isEventLoading && !selectedEvent) {
    return (
      <div aria-label="Loading challenges" className="grid h-full gap-3" role="status">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!isDemo && eventError && !selectedEvent) {
    return (
      <Alert
        actions={
          <Button
            onPress={() => {
              void refreshEvents();
            }}
            size="small"
            tone="secondary"
          >
            Retry
          </Button>
        }
        title={eventError}
        tone="danger"
      />
    );
  }

  if (!isDemo && !selectedEvent) {
    return <EmptyState title="No event available" />;
  }

  return (
    <ChallengeWorkspace
      actions={actions}
      challenges={challenges}
      currentCompetitor={{
        id: session?.user.id ?? 'kitsune-labs',
        name: session?.user.display_name ?? 'Kitsune Labs'
      }}
      eventId={eventId}
      eventName={eventName}
      eventStartedAt={isDemo ? '2026-07-26T04:00:00Z' : selectedEvent?.starts_at}
      getChallengeHref={(challengeId, tab) => {
        return challengeWorkspacePath(
          resolvedPathname,
          new URLSearchParams(resolvedSearchParams),
          challengeId,
          tab
        );
      }}
      onClearSelection={() => {
        presence.selectChallenge(null);
        router.push(
          challengeWorkspacePath(resolvedPathname, new URLSearchParams(resolvedSearchParams))
        );
      }}
      onSelectChallenge={(challengeId, tab) => {
        presence.selectChallenge(challengeId);
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
      onChallengeChanged={isDemo ? undefined : refreshChallenges}
      presenceMembers={isDemo ? demoPresence : presence.members}
      presenceStatus={isDemo ? 'ready' : presence.status}
      realtimeStatus={realtimeStatus}
      selectedChallengeId={selectedChallengeId}
      selectedChallengeTab={requestedTab}
    />
  );
}
