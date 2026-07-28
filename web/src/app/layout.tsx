import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

import '../app.css';
import { AppProviders } from './providers';
import { splitWorkspaceBootstrapScript } from './split-workspace-bootstrap';
import { themeBootstrapScript } from './theme-bootstrap';

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
      <head>
        <Script id="kitsune-theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrapScript}
        </Script>
        <Script id="kitsune-split-workspace-bootstrap" strategy="beforeInteractive">
          {splitWorkspaceBootstrapScript}
        </Script>
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
