'use client';

import type { ReactNode } from 'react';

import { EventProvider } from './event-context';
import { RealtimeProvider } from './realtime-context';
import { SessionProvider } from './session-context';
import type { ChallengeSummary, EventSummary, Session } from '@/lib/api/client';

interface PlatformProvidersProps {
  children: ReactNode;
  initialChallenges: ChallengeSummary[];
  initialEvents: EventSummary[];
  initialSelectedEventId: string | null;
  initialSession: Session;
}

export function PlatformProviders({
  children,
  initialChallenges,
  initialEvents,
  initialSelectedEventId,
  initialSession
}: PlatformProvidersProps) {
  return (
    <SessionProvider initialSession={initialSession}>
      <RealtimeProvider>
        <EventProvider
          initialChallenges={initialChallenges}
          initialEvents={initialEvents}
          initialSelectedEventId={initialSelectedEventId}
        >
          {children}
        </EventProvider>
      </RealtimeProvider>
    </SessionProvider>
  );
}
