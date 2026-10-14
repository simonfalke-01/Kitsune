import type { Metadata } from 'next';

import { AnnouncementAdminView } from './announcement-admin-view';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Announcements'
};

export default function AnnouncementAdminPage() {
  return (
    <div className="grid gap-8">
      <PageHeader title="Announcements" />
      <AnnouncementAdminView />
    </div>
  );
}
