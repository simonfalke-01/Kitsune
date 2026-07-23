import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '../app.css';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  description: 'Operate and compete in capture the flag events.',
  title: {
    default: 'Kitsune',
    template: '%s | Kitsune'
  }
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  width: 'device-width'
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
