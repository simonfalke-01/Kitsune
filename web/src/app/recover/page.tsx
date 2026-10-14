import type { Metadata } from 'next';

import { RecoveryForm } from './recovery-form';
import { AuthShell } from '@/components/layout/auth-shell';

export const metadata: Metadata = {
  title: 'Recover account'
};

interface RecoveryPageProps {
  searchParams: Promise<{
    organization?: string | string[];
    token?: string | string[];
  }>;
}

export default async function RecoveryPage({ searchParams }: RecoveryPageProps) {
  const parameters = await searchParams;
  const organization = Array.isArray(parameters.organization)
    ? (parameters.organization[0] ?? '')
    : (parameters.organization ?? '');
  const token = Array.isArray(parameters.token)
    ? (parameters.token[0] ?? '')
    : (parameters.token ?? '');

  return (
    <AuthShell title={token ? 'Choose a new password' : 'Recover account'}>
      <RecoveryForm initialOrganization={organization} token={token} />
    </AuthShell>
  );
}
