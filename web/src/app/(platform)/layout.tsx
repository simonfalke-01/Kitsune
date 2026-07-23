import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { PlatformProviders } from '../platform-providers';
import { AppShell } from '@/components/layout/app-shell';
import { getPlatformBootstrap, getServerSession } from '@/lib/api/server';

interface PlatformLayoutProps {
  children: ReactNode;
}

export default async function PlatformLayout({ children }: PlatformLayoutProps) {
  const session = await getServerSession();

  if (!session) {
    redirect('/login');
  }

  const bootstrap = await getPlatformBootstrap();

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
