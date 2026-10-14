import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from './login-form';
import { AuthShell } from '@/components/layout/auth-shell';
import { getServerSetupRequired } from '@/lib/api/server';
import { safeReturnPath } from '@/lib/auth/public-auth';

export const metadata: Metadata = {
  title: 'Sign in'
};

interface LoginPageProps {
  searchParams: Promise<{
    next?: string | string[];
    organization?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const parameters = await searchParams;
  const organization = Array.isArray(parameters.organization)
    ? (parameters.organization[0] ?? '')
    : (parameters.organization ?? '');
  let setupRequired = false;

  try {
    setupRequired = await getServerSetupRequired();
  } catch {
    // The sign-in form remains useful while the API recovers.
  }

  if (setupRequired) {
    redirect('/setup');
  }

  return (
    <AuthShell title="Sign in">
      <LoginForm initialOrganization={organization} returnTo={safeReturnPath(parameters.next)} />
    </AuthShell>
  );
}
