<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { onMount, type Snippet } from 'svelte';
  import { Activity, Blocks, CalendarDays, FileCheck2, Settings2, Sparkles } from '@lucide/svelte';
  import { session } from '$lib/stores/session.svelte';

  let { children }: { children: Snippet } = $props();

  const links = [
    { href: '/admin', label: 'Live operations', icon: Activity },
    { href: '/admin/events', label: 'Events', icon: CalendarDays },
    { href: '/admin/challenges', label: 'Challenges', icon: Blocks },
    { href: '/admin/reviews', label: 'Reviews', icon: FileCheck2 },
    { href: '/admin/automation', label: 'Automation', icon: Sparkles },
    { href: '/admin/settings', label: 'Settings', icon: Settings2 }
  ];

  onMount(async () => {
    if (!session.loading && !session.can('event_manage')) await goto('/');
  });
</script>

<div class="admin-shell">
  <aside aria-label="Organizer navigation">
    <p>Organizer</p>
    {#each links as item (item.href)}
      <a
        href={item.href}
        aria-current={item.href === '/admin'
          ? page.url.pathname === item.href
            ? 'page'
            : undefined
          : page.url.pathname.startsWith(item.href)
            ? 'page'
            : undefined}
      >
        <item.icon size={16} />{item.label}
      </a>
    {/each}
  </aside>
  <div class="admin-content">{@render children()}</div>
</div>

<style>
  .admin-shell {
    display: grid;
    width: min(1280px, calc(100% - 2rem));
    min-height: calc(100vh - 4rem);
    grid-template-columns: 210px minmax(0, 1fr);
    gap: 2.5rem;
    margin-inline: auto;
  }

  aside {
    position: sticky;
    top: 5.2rem;
    display: grid;
    height: fit-content;
    gap: 0.25rem;
    padding-top: 2rem;
  }

  aside p {
    margin: 0 0 0.5rem;
    color: var(--ink-faint);
    font-size: 0.67rem;
    font-weight: 750;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  aside a {
    display: flex;
    min-height: 2.55rem;
    align-items: center;
    gap: 0.55rem;
    padding: 0.6rem 0.7rem;
    border-radius: var(--radius-sm);
    color: var(--ink-secondary);
    font-size: 0.83rem;
    font-weight: 620;
  }

  aside a:hover,
  aside a[aria-current='page'] {
    background: var(--surface-muted);
    color: var(--ink);
  }

  .admin-content {
    min-width: 0;
  }

  @media (max-width: 760px) {
    .admin-shell {
      width: min(100% - 1.2rem, 1280px);
      grid-template-columns: 1fr;
      gap: 0;
    }

    aside {
      position: static;
      grid-template-columns: repeat(6, 1fr);
      overflow-x: auto;
      padding-top: 0.8rem;
    }

    aside p {
      display: none;
    }

    aside a {
      justify-content: center;
      white-space: nowrap;
    }
  }
</style>
