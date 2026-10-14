'use client';

import { LogOut, Menu as MenuIcon, Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { useEvent } from '@/app/event-context';
import { useSession } from '@/app/session-context';
import { useTheme } from '@/app/theme-context';
import {
  IconButton,
  Link,
  Menu,
  MenuTrigger,
  NavigationLink,
  SkipLink,
  showToast,
  ToastRegion,
  Tooltip,
  TooltipTrigger
} from '@/components/ui';
import { cx, focusTargetRing } from '@/components/ui/styles';
import { publicDemoEventName } from '@/lib/events';

interface AppShellProps {
  children: ReactNode;
}

interface AppHeaderProps {
  appearance?: 'global' | 'workspace';
  brandLabel?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

interface NavigationItem {
  href: string;
  label: string;
}

const playerNavigation: readonly NavigationItem[] = [
  {
    href: '/overview',
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

export function AppHeader({
  appearance = 'global',
  brandLabel = 'Kitsune',
  children,
  footer
}: AppHeaderProps) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { isAuthenticated, logout } = useSession();
  const { isDark, setPreference } = useTheme();
  const mobileOptions = playerNavigation.map((item) => ({
    href: item.href,
    id: item.href,
    label: item.label
  }));
  const selectedNavigationHref = playerNavigation.find((item) =>
    pathIsCurrent(pathname, item.href)
  )?.href;

  return (
    <header
      className={
        appearance === 'workspace'
          ? 'kitsune-merged-header shrink-0 overflow-hidden rounded-md bg-surface-raised'
          : 'kitsune-global-header sticky top-3 z-40 mx-3 mt-3 shrink-0 overflow-hidden rounded-md bg-surface-raised'
      }
    >
      <div className="flex min-h-16 w-full items-center gap-3 px-4">
        <div className="md:hidden">
          <MenuTrigger>
            <IconButton label="Open navigation">
              <MenuIcon aria-hidden className="size-5" />
            </IconButton>
            <Menu
              aria-label="Navigation"
              options={mobileOptions}
              selectedKeys={selectedNavigationHref ? [selectedNavigationHref] : []}
              selectionMode="single"
            />
          </MenuTrigger>
        </div>
        <Link
          className="min-w-0 truncate font-display text-lg font-semibold tracking-tight text-text no-underline"
          href="/overview"
          tone="current"
        >
          {appearance === 'workspace' ? (
            <h1 className="kitsune-optical-center m-0 truncate text-lg">{brandLabel}</h1>
          ) : (
            <span className="kitsune-optical-center">{brandLabel}</span>
          )}
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
        {children ? <div className="min-w-0 flex-1">{children}</div> : <div className="flex-1" />}
        <TooltipTrigger>
          <IconButton
            label={isDark ? 'Use light theme' : 'Use dark theme'}
            onPress={() => {
              setPreference(isDark ? 'light' : 'dark');
            }}
          >
            {isDark ? (
              <Sun aria-hidden className="size-4" />
            ) : (
              <Moon aria-hidden className="size-4" />
            )}
          </IconButton>
          <Tooltip>{isDark ? 'Use light theme' : 'Use dark theme'}</Tooltip>
        </TooltipTrigger>
        {isAuthenticated ? (
          <TooltipTrigger>
            <IconButton
              label="Sign out"
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
            >
              <LogOut aria-hidden className="size-4" />
            </IconButton>
            <Tooltip>Sign out</Tooltip>
          </TooltipTrigger>
        ) : null}
      </div>
      {footer}
    </header>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname() ?? '/';
  const { selectedEvent } = useEvent();
  const { isAuthenticated, session } = useSession();
  const isDemo = !isAuthenticated || !session;
  const isChallengeWorkspace = pathname === '/challenges';
  const eventName = isDemo ? publicDemoEventName : (selectedEvent?.name ?? 'Kitsune');

  return (
    <div
      className={
        isChallengeWorkspace
          ? 'kitsune-fixed-workspace fixed inset-0 flex flex-col overflow-hidden overscroll-none bg-surface text-text'
          : 'flex min-h-screen flex-col bg-surface text-text'
      }
    >
      <SkipLink href="#main-content" placement="global">
        Skip to content
      </SkipLink>
      <AppHeader brandLabel={eventName} />
      <main
        id="main-content"
        className={cx(
          'outline-none',
          focusTargetRing,
          isChallengeWorkspace
            ? 'min-h-0 w-full flex-1 overflow-hidden p-3'
            : 'm-3 flex min-h-0 flex-1 flex-col rounded-md bg-surface-raised p-4 sm:p-6 lg:p-8'
        )}
        tabIndex={-1}
      >
        {children}
      </main>
      <ToastRegion />
    </div>
  );
}
