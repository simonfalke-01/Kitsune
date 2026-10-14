import type { Metadata } from 'next';

import { VerifyEmail } from './verify-email';
import { AuthShell } from '@/components/layout/auth-shell';

export const metadata: Metadata = {
  title: 'Verify email'
};

interface VerifyEmailPageProps {
  searchParams: Promise<{
    token?: string | string[];
  }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const parameters = await searchParams;
  const token = Array.isArray(parameters.token)
    ? (parameters.token[0] ?? '')
    : (parameters.token ?? '');

  return (
    <AuthShell title="Verify email">
      <VerifyEmail token={token} />
    </AuthShell>
  );
}
