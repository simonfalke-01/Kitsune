import type { Metadata } from 'next';

import { EngagementReviewView } from './engagement-review-view';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Engagement review'
};

export default function EngagementReviewPage() {
  return (
    <div className="grid gap-8">
      <PageHeader title="Engagement review" />
      <EngagementReviewView />
    </div>
  );
}
