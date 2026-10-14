import type { Metadata } from 'next';

import { PasskeyLoginForm } from './passkey-login-form';
import { AuthShell } from '@/components/layout/auth-shell';
import { safeReturnPath } from '@/lib/auth/public-auth';

export const metadata: Metadata = {
  title: 'Sign in with a passkey'
};

interface PasskeyLoginPageProps {
  searchParams: Promise<{
    next?: string | string[];
    organization?: string | string[];
  }>;
}

export default async function PasskeyLoginPage({ searchParams }: PasskeyLoginPageProps) {
  const parameters = await searchParams;
  const organization = Array.isArray(parameters.organization)
    ? (parameters.organization[0] ?? '')
    : (parameters.organization ?? '');

  return (
    <AuthShell title="Sign in with a passkey">
      <PasskeyLoginForm
        initialOrganization={organization}
        returnTo={safeReturnPath(parameters.next)}
      />
    </AuthShell>
  );
}
