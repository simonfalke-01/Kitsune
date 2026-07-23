import type { Metadata } from 'next';

import { TeamAdminView } from './team-admin-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerTeamAdminBootstrap } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Team administration'
};

export default async function TeamAdminPage() {
  const bootstrap = await getServerTeamAdminBootstrap();

  return (
    <div className="grid gap-8">
      <PageHeader title="Team administration" />
      <TeamAdminView initialError={bootstrap.error} initialTeams={bootstrap.teams} />
    </div>
  );
}
