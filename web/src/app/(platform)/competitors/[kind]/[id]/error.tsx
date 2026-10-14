'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface CompetitorProfileErrorProps {
  reset: () => void;
}

export default function CompetitorProfileError({ reset }: CompetitorProfileErrorProps) {
  return (
    <div className="grid gap-8">
      <PageHeader title="Competitor profile" />
      <Alert
        actions={<Button onPress={reset}>Retry</Button>}
        description="Check the API service and try loading this competitor again."
        title="Competitor profile unavailable"
        tone="danger"
      />
    </div>
  );
}
