'use client';

import type { ReactNode } from 'react';

import { EventProvider } from './event-context';
import { RealtimeProvider } from './realtime-context';
import { SessionProvider } from './session-context';

interface PlatformProvidersProps {
  children: ReactNode;
}

export function PlatformProviders({ children }: PlatformProvidersProps) {
  return (
    <SessionProvider>
      <RealtimeProvider>
        <EventProvider>{children}</EventProvider>
      </RealtimeProvider>
    </SessionProvider>
  );
}
