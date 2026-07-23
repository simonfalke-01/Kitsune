import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from './login-form';
import { getServerSetupRequired } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Sign in'
};

export default async function LoginPage() {
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
    <main className="grid min-h-screen place-items-center px-4 py-12 sm:px-6">
      <section className="grid w-full max-w-auth gap-8" aria-labelledby="login-title">
        <header className="grid gap-2">
          <p className="m-0 font-display text-lg font-semibold tracking-tight text-text">Kitsune</p>
          <h1
            className="m-0 font-display text-2xl font-semibold tracking-tight text-text"
            id="login-title"
          >
            Sign in
          </h1>
        </header>
        <LoginForm />
      </section>
    </main>
  );
}
