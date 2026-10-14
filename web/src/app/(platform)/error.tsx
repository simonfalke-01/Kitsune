'use client';

import { Button } from '@/components/ui';

interface PlatformErrorProps {
  reset: () => void;
}

export default function PlatformError({ reset }: PlatformErrorProps) {
  return (
    <div className="grid h-full w-full place-items-center px-4 py-12 sm:px-6">
      <section className="grid w-full max-w-auth -translate-y-12 gap-6 text-center">
        <div className="grid gap-2">
          <h1 className="m-0 font-display text-xl font-semibold tracking-tight text-text">
            Kitsune is unavailable
          </h1>
          <p className="m-0 text-base text-text-muted">Check the API service, then retry.</p>
        </div>
        <div className="flex justify-center">
          <Button onPress={reset}>Retry</Button>
        </div>
      </section>
    </div>
  );
}
