import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CompetitorProfileView } from './competitor-profile';
import { getCompetitorProfileBootstrap } from './data';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/components/ui/link';
import { parseCompetitorKind } from '@/lib/competitors';

export const metadata: Metadata = {
  title: 'Competitor profile'
};

interface CompetitorProfilePageProps {
  params: Promise<{
    id: string;
    kind: string;
  }>;
}

export default async function CompetitorProfilePage({ params }: CompetitorProfilePageProps) {
  const { id, kind: kindParam } = await params;
  const kind = parseCompetitorKind(kindParam);

  if (!kind) {
    notFound();
  }

  const bootstrap = await getCompetitorProfileBootstrap(kind, id);

  if (bootstrap.status === 'not-found') {
    notFound();
  }

  if (bootstrap.status === 'no-event') {
    return (
      <div className="grid gap-8">
        <PageHeader title="Competitor profile" />
        <EmptyState
          action={<Link href="/scoreboard">Open scoreboard</Link>}
          description="Select an event before opening a competitor profile."
          title="No event selected"
        />
      </div>
    );
  }

  return (
    <CompetitorProfileView
      event={bootstrap.event}
      history={bootstrap.history}
      profile={bootstrap.profile}
    />
  );
}
