<script lang="ts">
  import { EyeOff, Radio, Snowflake, Trophy } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { events } from '$lib/stores/events.svelte';
  import { game } from '$lib/stores/game.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';
  import { session } from '$lib/stores/session.svelte';

  let loaded = $state(false);

  $effect(() => {
    if (session.authenticated && !loaded) {
      loaded = true;
      void load();
    }
  });

  async function load(): Promise<void> {
    await events.load();
    await game.loadScoreboard();
  }
</script>

<svelte:head><title>Scoreboard — Kitsune</title></svelte:head>

<div class="page">
  <div class="split-header">
    <div>
      <p class="eyebrow">{events.selectedEvent?.name ?? 'Standings'}</p>
      <h1 class="title">Scoreboard</h1>
      <p class="lede">Every point, in the order it was earned.</p>
    </div>
    <div class="controls">
      {#if game.scoreboard?.frozen}
        <Badge tone="warning"><Snowflake size={11} /> Frozen</Badge>
      {/if}
      <Badge tone={realtime.connected ? 'success' : 'warning'}>
        <Radio size={11} />
        {realtime.connected ? 'Live' : 'Offline'}
      </Badge>
    </div>
  </div>

  {#if game.loadingScoreboard}
    <p class="status" role="status">Recounting the tails…</p>
  {:else if game.scoreboard?.hidden}
    <EmptyState
      title="The scoreboard is veiled."
      detail="Organizers will reveal it when the time is right."
    >
      {#snippet action()}
        <div class="note">
          <EyeOff size={18} /> Scores are still being recorded.
        </div>
      {/snippet}
    </EmptyState>
  {:else if game.scoreboard?.rows.length}
    <div class="board" aria-label="Event standings">
      <div class="board-head" aria-hidden="true">
        <span>Rank</span>
        <span>Competitor</span>
        <span>Solves</span>
        <span>Score</span>
      </div>
      {#each game.scoreboard.rows as row (row.competitor_id)}
        <article class:podium={row.rank <= 3}>
          <strong class="rank">{row.rank}</strong>
          <div class="identity">
            <strong>{row.name}</strong>
            <small>{row.competitor_kind}</small>
          </div>
          <span>{row.solves}</span>
          <strong class="score">{row.score.toLocaleString()} pts</strong>
        </article>
      {/each}
    </div>
  {:else}
    <EmptyState
      title="No standings yet."
      detail="Scores appear here after the first accepted flag."
    >
      {#snippet action()}
        <div class="note">
          <Trophy size={18} /> Earliest to reach a tied score ranks first.
        </div>
      {/snippet}
    </EmptyState>
  {/if}
</div>

<style>
  .controls,
  .note {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .note,
  .status {
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }

  .board {
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }

  .board-head,
  .board article {
    display: grid;
    grid-template-columns: 4rem minmax(0, 1fr) 6rem 8rem;
    align-items: center;
    gap: 1rem;
    padding: 0 1.2rem;
  }

  .board-head {
    min-height: 2.8rem;
    border-bottom: 1px solid var(--line);
    color: var(--ink-faint);
    font-size: 0.68rem;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .board article {
    min-height: 4.6rem;
    border-bottom: 1px solid var(--line);
  }

  .board article:last-child {
    border-bottom: 0;
  }

  .board article.podium {
    background: color-mix(in srgb, var(--accent) 5%, transparent);
  }

  .rank {
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }

  .identity {
    display: grid;
    gap: 0.2rem;
  }

  .identity small {
    color: var(--ink-faint);
    font-size: 0.67rem;
    text-transform: capitalize;
  }

  .score {
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  @media (max-width: 620px) {
    .board-head {
      display: none;
    }

    .board article {
      grid-template-columns: 2rem minmax(0, 1fr) auto;
      gap: 0.7rem;
      padding: 0 0.85rem;
    }

    .board article > :nth-child(3) {
      display: none;
    }

    .score {
      font-size: 0.85rem;
    }
  }
</style>
