'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { I18nProvider, RouterProvider } from 'react-aria-components';

import { ThemeProvider } from './theme-context';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const router = useRouter();

  return (
    <RouterProvider
      navigate={(href) => {
        router.push(href.toString());
      }}
    >
      <I18nProvider locale="en">
        <ThemeProvider>{children}</ThemeProvider>
      </I18nProvider>
    </RouterProvider>
  );
}
