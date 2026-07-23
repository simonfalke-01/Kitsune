import type { Metadata } from 'next';

import { EventAdminView } from './event-admin-view';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Events'
};

export default function EventAdminPage() {
  return (
    <div className="grid gap-8">
      <PageHeader title="Events" />
      <EventAdminView />
    </div>
  );
}
