'use client';

import { Bell, LogOut, Menu as MenuIcon, Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { useEvent } from '@/app/event-context';
import { useRealtime } from '@/app/realtime-context';
import { useSession } from '@/app/session-context';
import { useTheme } from '@/app/theme-context';
import {
  Button,
  Link,
  Menu,
  MenuTrigger,
  NavigationLink,
  Select,
  showToast,
  StatusIndicator,
  ToastRegion
} from '@/components/ui';

interface AppShellProps {
  children: ReactNode;
}

interface NavigationItem {
  href: string;
  label: string;
  permission?: string;
}

const playerNavigation: readonly NavigationItem[] = [
  {
    href: '/challenges',
    label: 'Challenges'
  },
  {
    href: '/scoreboard',
    label: 'Scoreboard'
  },
  {
    href: '/team',
    label: 'Team'
  }
];

const operationsNavigation: readonly NavigationItem[] = [
  {
    href: '/admin',
    label: 'Live operations',
    permission: 'event_manage'
  },
  {
    href: '/admin/events',
    label: 'Events',
    permission: 'event_manage'
  },
  {
    href: '/admin/challenges',
    label: 'Challenges',
    permission: 'challenge_manage'
  },
  {
    href: '/admin/automation',
    label: 'Automation',
    permission: 'automation_manage'
  },
  {
    href: '/admin/access',
    label: 'Access',
    permission: 'identity_manage'
  },
  {
    href: '/admin/audit',
    label: 'Audit trail',
    permission: 'audit_read'
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    permission: 'platform_manage'
  }
];

function pathIsCurrent(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { can, logout, session } = useSession();
  const { events, selectEvent, selectedEvent } = useEvent();
  const { isConnected } = useRealtime();
  const { isDark, setPreference } = useTheme();
  const visibleOperations = operationsNavigation.filter((item) => {
    return item.permission ? can(item.permission) : true;
  });
  const mobileOptions = [...playerNavigation, ...visibleOperations].map((item) => ({
    href: item.href,
    id: item.href,
    label: item.label
  }));

  return (
    <div className="min-h-screen bg-surface text-text">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-surface">
        <div className="mx-auto flex min-h-16 max-w-shell items-center gap-3 px-4 sm:px-6">
          <div className="lg:hidden">
            <MenuTrigger>
              <Button aria-label="Open navigation" size="icon" tone="quiet">
                <MenuIcon aria-hidden className="size-5" />
              </Button>
              <Menu aria-label="Navigation" options={mobileOptions} />
            </MenuTrigger>
          </div>
          <Link
            className="font-display text-lg font-semibold tracking-tight text-text no-underline"
            href="/challenges"
            tone="current"
          >
            Kitsune
          </Link>
          <div aria-hidden className="h-6 w-px bg-border-subtle" />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm text-text-muted">
              {selectedEvent?.name ?? 'No event selected'}
            </span>
          </div>
          <StatusIndicator
            label={isConnected ? 'Live' : 'Offline'}
            tone={isConnected ? 'success' : 'neutral'}
          />
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
          <Button aria-label="Notifications" size="icon" tone="quiet">
            <Bell aria-hidden className="size-4" />
          </Button>
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
        </div>
      </header>

      <div className="mx-auto max-w-shell lg:flex">
        <aside
          aria-label="Primary navigation"
          className="hidden w-sidebar shrink-0 border-r border-border-subtle p-4 lg:block"
        >
          <div className="sticky top-20 grid gap-6">
            {events.length > 0 ? (
              <Select
                label="Current event"
                onSelectionChange={(key) => {
                  void selectEvent(String(key));
                }}
                options={events.map((event) => ({
                  id: event.id,
                  label: event.name
                }))}
                selectedKey={selectedEvent?.id}
              />
            ) : null}
            <nav aria-label="Player" className="grid gap-1">
              <span className="px-3 pb-2 text-xs font-semibold text-text-muted">Play</span>
              {playerNavigation.map((item) => (
                <NavigationLink
                  href={item.href}
                  isCurrent={pathIsCurrent(pathname, item.href)}
                  key={item.href}
                >
                  {item.label}
                </NavigationLink>
              ))}
            </nav>
            {visibleOperations.length > 0 ? (
              <nav aria-label="Operations" className="grid gap-1">
                <span className="px-3 pb-2 text-xs font-semibold text-text-muted">Operate</span>
                {visibleOperations.map((item) => (
                  <NavigationLink
                    href={item.href}
                    isCurrent={pathIsCurrent(pathname, item.href)}
                    key={item.href}
                  >
                    {item.label}
                  </NavigationLink>
                ))}
              </nav>
            ) : null}
            <div className="border-t border-border-subtle px-3 pt-4">
              <p className="m-0 truncate text-sm font-medium text-text">
                {session?.user.display_name ?? session?.user.email}
              </p>
              <p className="m-0 truncate text-xs text-text-muted">{session?.user.email}</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
      <ToastRegion />
    </div>
  );
}
