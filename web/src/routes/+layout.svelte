<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import { preferences } from '$lib/i18n/index.svelte';
  import { events } from '$lib/stores/events.svelte';
  import { game } from '$lib/stores/game.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';

  let { children }: { children: Snippet } = $props();
  let appliedRealtimeEvent = $state<string | null>(null);

  onMount(async () => {
    preferences.load();
    await session.bootstrap();
    if (session.authenticated) {
      realtime.start();
    }
  });

  $effect(() => {
    if (session.authenticated) {
      realtime.start();
    }
  });

  $effect(() => {
    const envelope = realtime.latest;
    if (!session.authenticated || !envelope || envelope.id === appliedRealtimeEvent) {
      return;
    }
    appliedRealtimeEvent = envelope.id;
    if (envelope.event.type === 'event.changed') {
      void events.load();
    } else if (envelope.event.type === 'challenge.changed') {
      void events.loadChallenges();
    } else if (envelope.event.type === 'submission.received') {
      void events.loadChallenges();
    } else if (envelope.event.type === 'score.changed') {
      game.scheduleScoreboardRefresh();
    } else if (envelope.event.type === 'scoreboard.control_changed') {
      void Promise.all([events.load(), game.loadScoreboardData()]);
    } else if (envelope.event.type === 'challenge.hint.unlocked') {
      void game.refreshLoadedHints();
    } else if (envelope.event.type === 'challenge.writeup.changed') {
      void game.refreshLoadedWriteups();
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
