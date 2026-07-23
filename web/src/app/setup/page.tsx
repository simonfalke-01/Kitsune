import type { Metadata } from 'next';

import { SetupForm } from './setup-form';
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
    <main className="grid min-h-screen place-items-center px-4 py-12 sm:px-6">
      <section className="grid w-full max-w-auth gap-8" aria-labelledby="setup-title">
        <header className="grid gap-2">
          <p className="m-0 font-display text-lg font-semibold tracking-tight text-text">Kitsune</p>
          <h1
            className="m-0 font-display text-2xl font-semibold tracking-tight text-text"
            id="setup-title"
          >
            {setupRequired === false ? 'Setup complete' : 'Set up Kitsune'}
          </h1>
        </header>
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
      </section>
    </main>
  );
}
