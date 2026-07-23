import type { Metadata } from 'next';

import { AccessAdminView } from './access-admin-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerAccessBootstrap } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Access'
};

export default async function AccessAdminPage() {
  const bootstrap = await getServerAccessBootstrap();

  return (
    <div className="grid gap-8">
      <PageHeader title="Access" />
      <AccessAdminView
        initialError={bootstrap.error}
        initialGrants={bootstrap.grants}
        initialPermissions={bootstrap.permissions}
        initialRoles={bootstrap.roles}
        initialUsers={bootstrap.users}
      />
    </div>
  );
}
