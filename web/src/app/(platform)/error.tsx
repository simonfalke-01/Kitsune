'use client';

import { Button } from '@/components/ui';

interface PlatformErrorProps {
  reset: () => void;
}

export default function PlatformError({ reset }: PlatformErrorProps) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12 sm:px-6">
      <section className="grid w-full max-w-auth gap-6">
        <div className="grid gap-2">
          <h1 className="m-0 font-display text-xl font-semibold tracking-tight text-text">
            Kitsune is unavailable
          </h1>
          <p className="m-0 text-base text-text-muted">Check the API service, then retry.</p>
        </div>
        <div>
          <Button onPress={reset}>Retry</Button>
        </div>
      </section>
    </main>
  );
}
