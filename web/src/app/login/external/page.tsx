import type { Metadata } from 'next';

import { ExternalLoginForm } from './external-login-form';
import { AuthShell } from '@/components/layout/auth-shell';
import { safeReturnPath } from '@/lib/auth/public-auth';

export const metadata: Metadata = {
  title: 'Organization sign in'
};

interface ExternalLoginPageProps {
  searchParams: Promise<{
    next?: string | string[];
    organization?: string | string[];
  }>;
}

export default async function ExternalLoginPage({ searchParams }: ExternalLoginPageProps) {
  const parameters = await searchParams;
  const organization = Array.isArray(parameters.organization)
    ? (parameters.organization[0] ?? '')
    : (parameters.organization ?? '');

  return (
    <AuthShell title="Organization sign in">
      <ExternalLoginForm
        initialOrganization={organization}
        returnTo={safeReturnPath(parameters.next)}
      />
    </AuthShell>
  );
}
