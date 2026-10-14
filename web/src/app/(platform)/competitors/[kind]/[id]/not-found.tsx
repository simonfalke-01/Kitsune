import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Link } from '@/components/ui/link';

export default function CompetitorProfileNotFound() {
  return (
    <div className="grid gap-8">
      <PageHeader title="Competitor profile" />
      <EmptyState
        action={<Link href="/scoreboard">Return to scoreboard</Link>}
        description="This competitor does not exist in the selected event."
        title="Competitor not found"
      />
    </div>
  );
}
