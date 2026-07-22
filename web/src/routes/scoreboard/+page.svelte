<script lang="ts">
  import { Radio, Trophy } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';
</script>

<svelte:head><title>Scoreboard — Kitsune</title></svelte:head>

<div class="page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Standings</p>
      <h1 class="title">Scoreboard</h1>
      <p class="lede">Every point, in the order it was earned.</p>
    </div>
    <Badge tone={realtime.connected ? 'success' : 'warning'}
      ><Radio size={11} /> {realtime.connected ? 'Live' : 'Offline'}</Badge
    >
  </div>
  <EmptyState title="No standings yet." detail="Scores appear here after the first accepted flag.">
    {#snippet action()}<div class="trophy">
        <Trophy size={18} /> Earliest to reach a tied score ranks first.
      </div>{/snippet}
  </EmptyState>
</div>

<style>
  .trophy {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }
</style>
