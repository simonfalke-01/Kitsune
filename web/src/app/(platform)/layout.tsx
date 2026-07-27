import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { PlatformProviders } from '../platform-providers';
import { AppShell } from '@/components/layout/app-shell';
import { getPlatformBootstrap, getServerSession } from '@/lib/api/server';

interface PlatformLayoutProps {
  children: ReactNode;
}

export default async function PlatformLayout({ children }: PlatformLayoutProps) {
  const isPublicDemo = process.env.KITSUNE_PUBLIC_DEMO !== 'false';
  const session = isPublicDemo ? null : await getServerSession();

  if (!isPublicDemo && !session) {
    redirect('/login');
  }

  const bootstrap = session
    ? await getPlatformBootstrap()
    : {
        challenges: [],
        events: [],
        selectedEventId: null
      };

  return (
    <PlatformProviders
      initialChallenges={bootstrap.challenges}
      initialEvents={bootstrap.events}
      initialSelectedEventId={bootstrap.selectedEventId}
      initialSession={session}
    >
      <AppShell>{children}</AppShell>
    </PlatformProviders>
  );
}
