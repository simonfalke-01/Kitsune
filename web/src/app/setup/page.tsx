import type { Metadata } from 'next';

import { SetupForm } from './setup-form';
import { AuthShell } from '@/components/layout/auth-shell';
import { Link } from '@/components/ui';
import { getServerSetupRequired } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Set up'
};

export default async function SetupPage() {
  let setupRequired: boolean | null = null;

  try {
    setupRequired = await getServerSetupRequired();
  } catch {
    setupRequired = null;
  }

  return (
    <AuthShell title={setupRequired === false ? 'Setup complete' : 'Set up Kitsune'}>
      {setupRequired === true ? <SetupForm /> : null}
      {setupRequired === false ? (
        <div>
          <Link href="/login">Sign in</Link>
        </div>
      ) : null}
      {setupRequired === null ? (
        <div className="grid gap-4">
          <p className="m-0 text-base text-text-muted">The API is unavailable.</p>
          <div>
            <Link href="/setup">Retry</Link>
          </div>
        </div>
      ) : null}
    </AuthShell>
  );
}
