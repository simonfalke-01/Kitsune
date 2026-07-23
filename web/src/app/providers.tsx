import type { ReactNode } from 'react';

import { EventProvider } from './event-context';
import { RealtimeProvider } from './realtime-context';
import { SessionProvider } from './session-context';
import { ThemeProvider } from './theme-context';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <RealtimeProvider>
          <EventProvider>{children}</EventProvider>
        </RealtimeProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
