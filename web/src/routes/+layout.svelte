<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import { preferences } from '$lib/i18n/index.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';

  let { children }: { children: Snippet } = $props();

  onMount(async () => {
    preferences.load();
    await session.bootstrap();
    if (session.authenticated) realtime.start();
  });

  $effect(() => {
    if (session.authenticated) realtime.start();
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
