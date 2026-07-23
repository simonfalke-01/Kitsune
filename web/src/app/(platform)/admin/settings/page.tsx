import type { Metadata } from 'next';

import { SettingsAdminView } from './settings-admin-view';
import { PageHeader } from '@/components/layout/page-header';
import { getServerSettingsBootstrap } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Settings'
};

export default async function SettingsAdminPage() {
  const bootstrap = await getServerSettingsBootstrap();

  return (
    <div className="grid gap-8">
      <PageHeader title="Settings" />
      <SettingsAdminView
        initialError={bootstrap.error}
        initialOAuthClients={bootstrap.oauthClients}
        initialOidcProviders={bootstrap.oidcProviders}
        initialSamlProviders={bootstrap.samlProviders}
      />
    </div>
  );
}
