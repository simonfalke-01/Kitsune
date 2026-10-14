import type { Metadata } from 'next';

import { SubmissionAdminView } from './submission-admin-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerSubmissionAuditBootstrap } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Submissions'
};

export default async function SubmissionAdminPage() {
  const bootstrap = await getServerSubmissionAuditBootstrap();

  return (
    <div className="grid gap-8">
      <PageHeader title="Submissions" />
      <SubmissionAdminView initialError={bootstrap.error} initialPage={bootstrap.page} />
    </div>
  );
}
