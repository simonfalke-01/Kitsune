import type { Metadata } from 'next';

import { TeamView } from './team-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerTeamBootstrap } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Team'
};

export default async function TeamPage() {
  const bootstrap = await getServerTeamBootstrap();

  return (
    <div className="grid gap-8">
      <PageHeader title="Team" />
      <TeamView
        initialBrackets={bootstrap.brackets}
        initialDivisions={bootstrap.divisions}
        initialError={bootstrap.error}
        initialEventId={bootstrap.eventId}
        initialRegistration={bootstrap.registration}
        initialTeams={bootstrap.teams}
      />
    </div>
  );
}
