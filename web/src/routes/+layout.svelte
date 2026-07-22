<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import { preferences } from '$lib/i18n/index.svelte';
  import { events } from '$lib/stores/events.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';

  let { children }: { children: Snippet } = $props();
  let appliedRealtimeEvent = $state<string | null>(null);

  onMount(async () => {
    preferences.load();
    await session.bootstrap();
    if (session.authenticated) realtime.start();
  });

  $effect(() => {
    if (session.authenticated) realtime.start();
  });

  $effect(() => {
    const envelope = realtime.latest;
    if (!session.authenticated || !envelope || envelope.id === appliedRealtimeEvent) return;
    appliedRealtimeEvent = envelope.id;
    if (envelope.event.type === 'event.changed') {
      void events.load();
    } else if (envelope.event.type === 'challenge.changed') {
      void events.loadChallenges();
    }
  });
</script>

<svelte:head>
  <title>Kitsune — Outfox the challenge</title>
  <meta
    name="description"
    content="A fast, robust platform for Jeopardy, King of the Hill, Attack/Defense, and workshops."
  />
</svelte:head>

<AppHeader />
<main>{@render children()}</main>
