import type { Metadata } from 'next';

import { ScoreboardView } from './scoreboard-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerScoreboardBootstrap } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Scoreboard'
};

export default async function ScoreboardPage() {
  const bootstrap = await getServerScoreboardBootstrap();

  return (
    <div className="grid gap-8">
      <PageHeader title="Scoreboard" />
      <ScoreboardView
        initialDivisions={bootstrap.divisions}
        initialError={bootstrap.error}
        initialEventId={bootstrap.eventId}
        initialHistory={bootstrap.history}
        initialScoreboard={bootstrap.scoreboard}
      />
    </div>
  );
}
