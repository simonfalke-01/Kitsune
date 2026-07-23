import type { Metadata } from 'next';

import { AccountView } from './account-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerAccountBootstrap } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Account'
};

export default async function AccountPage() {
  const bootstrap = await getServerAccountBootstrap();

  return (
    <div className="grid gap-8">
      <PageHeader title="Account" />
      <AccountView
        initialError={bootstrap.error}
        initialPasskeys={bootstrap.passkeys}
        initialSessions={bootstrap.sessions}
      />
    </div>
  );
}
