'use client';

import { LogOut, Menu as MenuIcon, Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { useSession } from '@/app/session-context';
import { useTheme } from '@/app/theme-context';
import {
  Button,
  Link,
  Menu,
  MenuTrigger,
  NavigationLink,
  showToast,
  ToastRegion
} from '@/components/ui';

interface AppShellProps {
  children: ReactNode;
}

interface NavigationItem {
  href: string;
  label: string;
}

const playerNavigation: readonly NavigationItem[] = [
  {
    href: '/event',
    label: 'Overview'
  },
  {
    href: '/challenges',
    label: 'Challenges'
  }
];

function pathIsCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { isAuthenticated, logout } = useSession();
  const { isDark, setPreference } = useTheme();
  const mobileOptions = playerNavigation.map((item) => ({
    href: item.href,
    id: item.href,
    label: item.label
  }));
  const rendersContent = pathname === '/event' || pathname === '/challenges';
  const isChallengeWorkspace = pathname === '/challenges';

  return (
    <div
      className={
        isChallengeWorkspace
          ? 'kitsune-fixed-workspace fixed inset-0 flex flex-col overflow-hidden overscroll-none bg-surface text-text'
          : 'min-h-screen bg-surface text-text'
      }
    >
      <Link
        className="fixed left-2 top-2 z-overlay -translate-y-16 bg-surface-raised px-3 py-2 no-underline shadow-md transition-transform focus-visible:translate-y-0"
        href="#main-content"
        tone="current"
      >
        Skip to content
      </Link>
      <header className="sticky top-0 z-40 shrink-0 border-b border-border-subtle bg-surface-raised">
        <div className="flex min-h-16 w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
          <div className="md:hidden">
            <MenuTrigger>
              <Button aria-label="Open navigation" size="icon" tone="quiet">
                <MenuIcon aria-hidden className="size-5" />
              </Button>
              <Menu aria-label="Navigation" options={mobileOptions} />
            </MenuTrigger>
          </div>
          <Link
            className="font-display text-lg font-semibold tracking-tight text-accent-text no-underline"
            href="/event"
            tone="current"
          >
            <span className="kitsune-optical-center">Kitsune</span>
          </Link>
          <nav aria-label="Player" className="hidden items-center gap-1 md:flex">
            {playerNavigation.map((item) => (
              <NavigationLink
                className="px-3"
                href={item.href}
                isCurrent={pathIsCurrent(pathname, item.href)}
                key={item.href}
              >
                {item.label}
              </NavigationLink>
            ))}
          </nav>
          <div className="min-w-0 flex-1" />
          <Button
            aria-label={isDark ? 'Use light theme' : 'Use dark theme'}
            onPress={() => {
              setPreference(isDark ? 'light' : 'dark');
            }}
            size="icon"
            tone="quiet"
          >
            {isDark ? (
              <Sun aria-hidden className="size-4" />
            ) : (
              <Moon aria-hidden className="size-4" />
            )}
          </Button>
          {isAuthenticated ? (
            <Button
              aria-label="Sign out"
              onPress={() => {
                void logout().then((signedOut) => {
                  if (signedOut) {
                    router.replace('/login');
                    router.refresh();
                    return;
                  }

                  showToast({
                    title: 'Sign out failed',
                    tone: 'danger'
                  });
                });
              }}
              size="icon"
              tone="quiet"
            >
              <LogOut aria-hidden className="size-4" />
            </Button>
          ) : null}
        </div>
      </header>
      <main
        id="main-content"
        className={
          isChallengeWorkspace
            ? 'min-h-0 w-full flex-1 overflow-hidden p-3'
            : 'w-full px-4 py-6 sm:px-6 lg:px-8'
        }
        tabIndex={-1}
      >
        {rendersContent ? children : null}
      </main>
      <ToastRegion />
    </div>
  );
}
