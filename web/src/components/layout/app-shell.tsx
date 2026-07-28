'use client';

import { LogOut, Menu as MenuIcon, Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

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

  return (
    <header
      className={
        appearance === 'workspace'
          ? 'kitsune-merged-header shrink-0 overflow-hidden rounded-md bg-surface-raised'
          : 'kitsune-global-header sticky top-0 z-40 shrink-0 border-b border-border-subtle bg-surface-raised'
      }
    >
      <div
        className={
          appearance === 'workspace'
            ? 'flex min-h-16 w-full items-center gap-3 px-4'
            : 'flex min-h-16 w-full items-center gap-3 px-4 sm:px-6 lg:px-8'
        }
      >
        <div className="md:hidden">
          <MenuTrigger>
            <IconButton label="Open navigation">
              <MenuIcon aria-hidden className="size-5" />
            </IconButton>
            <Menu aria-label="Navigation" options={mobileOptions} />
          </MenuTrigger>
        </div>
        <Link
          className={
            appearance === 'workspace'
              ? 'min-w-0 truncate font-display text-lg font-semibold tracking-tight text-text no-underline'
              : 'font-display text-lg font-semibold tracking-tight text-accent-text no-underline'
          }
          href="/event"
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
      <SkipLink href="#main-content" placement="global">
        Skip to content
      </SkipLink>
      <AppHeader />
      <main
        id="main-content"
        className={cx(
          'outline-none',
          focusTargetRing,
          isChallengeWorkspace
            ? 'min-h-0 w-full flex-1 overflow-hidden p-3'
            : 'w-full px-4 py-6 sm:px-6 lg:px-8'
        )}
        tabIndex={-1}
      >
        {rendersContent ? children : null}
      </main>
      <ToastRegion />
    </div>
  );
}
