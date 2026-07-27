import type { Metadata, Viewport } from 'next';
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
        <link
          as="font"
          crossOrigin="anonymous"
          href="/fonts/suisse-intl-regular.otf"
          rel="preload"
          type="font/otf"
        />
        <link
          as="font"
          crossOrigin="anonymous"
          href="/fonts/suisse-intl-semibold.otf"
          rel="preload"
          type="font/otf"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: splitWorkspaceBootstrapScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
