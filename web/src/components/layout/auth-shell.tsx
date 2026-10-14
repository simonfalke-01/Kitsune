'use client';

import { Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId } from 'react';

import { useTheme } from '@/app/theme-context';
import { Button, Link } from '@/components/ui';

interface AuthShellProps {
  children: ReactNode;
  title: ReactNode;
}

export function AuthShell({ children, title }: AuthShellProps) {
  const titleId = useId();
  const { isDark, setPreference } = useTheme();
  const themeButton = (
    <Button
      aria-label={isDark ? 'Use light theme' : 'Use dark theme'}
      onPress={() => {
        setPreference(isDark ? 'light' : 'dark');
      }}
      size="icon"
      tone="quiet"
    >
      {isDark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </Button>
  );

  return (
    <main className="min-h-screen bg-surface px-4 py-6 sm:px-6">
      <div className="mx-auto flex min-h-screen w-full max-w-auth flex-col">
        <div className="flex items-center justify-between gap-4">
          <Link
            className="font-display text-lg font-semibold tracking-tight no-underline"
            href="/"
            tone="current"
          >
            Kitsune
          </Link>
          {themeButton}
        </div>

        <section aria-labelledby={titleId} className="flex flex-1 items-center py-12">
          <div className="grid w-full gap-8">
            <header>
              <h1
                className="m-0 font-display text-xl font-semibold tracking-tight text-text"
                id={titleId}
              >
                {title}
              </h1>
            </header>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
