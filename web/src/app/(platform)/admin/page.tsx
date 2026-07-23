import type { Metadata } from 'next';

import { AdminView } from './admin-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerAdminBootstrap } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Live operations'
};

export default async function AdminPage() {
  const bootstrap = await getServerAdminBootstrap();

  return (
    <div className="grid gap-8">
      <PageHeader title="Live operations" />
      <AdminView
        initialError={bootstrap.error}
        initialHealth={bootstrap.health}
        initialReadiness={bootstrap.readiness}
      />
    </div>
  );
}
