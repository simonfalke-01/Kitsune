<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { Moon, Sun, LogOut, ShieldCheck } from '@lucide/svelte';
  import BrandMark from './BrandMark.svelte';
  import Button from './Button.svelte';
  import { preferences } from '$lib/i18n/index.svelte';
  import { events } from '$lib/stores/events.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { team } from '$lib/stores/team.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';

  const links = [
    { href: '/challenges', label: 'Challenges' },
    { href: '/scoreboard', label: 'Scoreboard' },
    { href: '/team', label: 'Team' }
  ];

  async function signOut() {
    realtime.stop();
    await session.logout();
    events.clear();
    team.clear();
    await goto('/login');
  }
</script>

<header class="header">
  <a class="brand-link" href="/" aria-label="Kitsune home">
    <BrandMark />
  </a>
  {#if session.authenticated}
    <nav aria-label="Primary navigation">
      {#each links as link (link.href)}
        <a
          href={link.href}
          aria-current={page.url.pathname.startsWith(link.href) ? 'page' : undefined}
        >
          {link.label}
        </a>
      {/each}
      {#if session.can('event_manage')}
        <a href="/admin" aria-current={page.url.pathname.startsWith('/admin') ? 'page' : undefined}>
          <ShieldCheck size={14} />
          Admin
        </a>
      {/if}
    </nav>
  {/if}
  <div class="actions">
    <button
      class="icon-button"
      type="button"
      aria-label={preferences.theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
      onclick={() => preferences.setTheme(preferences.theme === 'dark' ? 'light' : 'dark')}
    >
      {#if preferences.theme === 'dark'}
        <Sun size={17} />
      {:else}
        <Moon size={17} />
      {/if}
    </button>
    {#if session.authenticated}
      <a class="identity" href="/account/security">{session.current?.user.display_name}</a>
      <Button variant="quiet" ariaLabel="Sign out" onclick={signOut}>
        <LogOut size={16} />
      </Button>
    {:else}
      <a class="sign-in" href="/login">Sign in</a>
    {/if}
  </div>
</header>

<style>
  .header {
    position: sticky;
    z-index: 30;
    top: 0;
    display: grid;
    min-height: 4rem;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 2rem;
    padding: 0.65rem max(1rem, calc((100vw - 1180px) / 2));
    border-bottom: 1px solid var(--line);
    background: color-mix(in srgb, var(--canvas) 88%, transparent);
    backdrop-filter: blur(18px) saturate(140%);
  }

  .brand-link {
    display: inline-flex;
  }

  nav {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  nav a,
  .sign-in {
    display: inline-flex;
    min-height: 2.3rem;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.65rem;
    border-radius: var(--radius-sm);
    color: var(--ink-secondary);
    font-size: 0.82rem;
    font-weight: 610;
  }

  nav a:hover,
  nav a[aria-current='page'],
  .sign-in:hover {
    background: var(--surface-muted);
    color: var(--ink);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .icon-button {
    display: grid;
    width: 2.35rem;
    height: 2.35rem;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-secondary);
    cursor: pointer;
  }

  .icon-button:hover {
    background: var(--surface-muted);
    color: var(--ink);
  }

  .identity {
    max-width: 10rem;
    overflow: hidden;
    color: var(--ink-secondary);
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 760px) {
    .header {
      grid-template-columns: auto 1fr;
      gap: 0.5rem;
    }

    nav {
      position: fixed;
      z-index: 30;
      right: 0.6rem;
      bottom: 0.6rem;
      left: 0.6rem;
      justify-content: space-around;
      padding: 0.35rem;
      border: 1px solid var(--line);
      border-radius: 0.9rem;
      background: var(--surface-raised);
      box-shadow: var(--shadow-lg);
    }

    nav a {
      justify-content: center;
      font-size: 0.74rem;
    }

    .actions {
      justify-self: end;
    }

    .identity {
      display: none;
    }
  }
</style>
