import type { Metadata } from 'next';

import { AuditAdminView } from './audit-admin-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerAuditBootstrap } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Audit trail'
};

export default async function AuditAdminPage() {
  const bootstrap = await getServerAuditBootstrap();

  return (
    <div className="grid gap-8">
      <PageHeader title="Audit trail" />
      <AuditAdminView initialError={bootstrap.error} initialPage={bootstrap.page} />
    </div>
  );
}
