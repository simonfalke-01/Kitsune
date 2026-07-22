<script lang="ts">
  import { Filter, Search, Sparkles } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { ChallengeSummary } from '$lib/api/client';
  import { copy, toned } from '$lib/i18n/index.svelte';
  import { challengeCategories, events } from '$lib/stores/events.svelte';
  import { session } from '$lib/stores/session.svelte';

  let query = $state('');
  let loaded = $state(false);
  let selectedCategory = $state<string | null>(null);
  let filtered = $derived(
    events.challenges.filter((challenge) => {
      const text =
        `${challenge.name} ${challenge.category} ${challenge.tags.join(' ')}`.toLowerCase();
      const matchesQuery = text.includes(query.trim().toLowerCase());
      return matchesQuery && (!selectedCategory || challenge.category === selectedCategory);
    })
  );
  let categories = $derived(challengeCategories(filtered));
  let availableCategories = $derived([...new Set(events.challenges.map((item) => item.category))]);

  $effect(() => {
    if (session.authenticated && !loaded) {
      loaded = true;
      void events.load();
    }
  });

  function score(challenge: ChallengeSummary): string {
    switch (challenge.scoring.kind) {
      case 'static':
        return `${challenge.scoring.points} pts`;
      case 'dynamic':
        return `${challenge.scoring.initial} pts`;
      case 'plugin':
        return challenge.scoring.strategy;
    }
  }

  function typeLabel(challenge: ChallengeSummary): string {
    return challenge.kind.type.replaceAll('_', ' ');
  }
</script>

<svelte:head><title>Challenges — Kitsune</title></svelte:head>

<div class="page">
  <div class="split-header">
    <div>
      <p class="eyebrow">{events.selectedEvent?.name ?? 'Jeopardy'}</p>
      <h1 class="title">Challenges</h1>
      <p class="lede">Choose carefully. Every trail tells you something.</p>
    </div>
    <div class="tools">
      <label>
        <span class="sr-only">Search challenges</span>
        <Search size={15} />
        <input bind:value={query} placeholder="Search" />
      </label>
      <select bind:value={selectedCategory} aria-label="Filter by category">
        <option value={null}>All categories</option>
        {#each availableCategories as category (category)}
          <option value={category}>{category}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if events.loading}
    <p class="status" role="status">Following the foxfire…</p>
  {:else if categories.size}
    <div class="board">
      {#each [...categories] as [category, challenges] (category)}
        <section class="category">
          <div class="category-head">
            <h2>{category}</h2>
            <Badge>{challenges.length} {challenges.length === 1 ? 'challenge' : 'challenges'}</Badge
            >
          </div>
          <div class="challenge-grid">
            {#each challenges as challenge (challenge.id)}
              <Card>
                <article class="challenge-card">
                  <div class="challenge-top">
                    <Sparkles size={17} />
                    <strong>{score(challenge)}</strong>
                  </div>
                  <div>
                    <h3>{challenge.name}</h3>
                    <p>{challenge.description}</p>
                  </div>
                  <footer>
                    <span>{typeLabel(challenge)}</span>
                    {#if challenge.max_attempts}<span>{challenge.max_attempts} attempts</span>{/if}
                  </footer>
                </article>
              </Card>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    <EmptyState
      title={toned(copy('empty').challenges)}
      detail={query || selectedCategory
        ? 'Nothing matches the current filters.'
        : 'The board updates live when an organizer publishes a challenge.'}
    >
      {#snippet action()}
        {#if query || selectedCategory}
          <button
            class="clear-filter"
            type="button"
            onclick={() => {
              query = '';
              selectedCategory = null;
            }}
          >
            <Filter size={15} />
            Clear filters
          </button>
        {/if}
      {/snippet}
    </EmptyState>
  {/if}
</div>

<style>
  .tools,
  .tools label,
  .tools select,
  .challenge-top,
  .category-head,
  footer,
  .clear-filter {
    display: flex;
    align-items: center;
  }

  .tools {
    gap: 0.5rem;
  }

  .tools label,
  .tools select {
    min-height: 2.55rem;
    gap: 0.45rem;
    padding: 0 0.7rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink-secondary);
  }

  .tools input {
    width: 10rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
  }

  .tools select {
    cursor: pointer;
    font-size: 0.8rem;
  }

  .board,
  .category {
    display: grid;
    gap: 1rem;
  }

  .board {
    gap: 2rem;
    margin-top: 2rem;
  }

  .category-head {
    justify-content: space-between;
  }

  .category-head h2 {
    margin: 0;
    font-size: 1rem;
  }

  .challenge-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .challenge-card {
    display: grid;
    min-height: 13rem;
    align-content: space-between;
    gap: 1.2rem;
  }

  .challenge-top,
  footer {
    justify-content: space-between;
    gap: 0.6rem;
  }

  .challenge-top {
    color: var(--accent);
  }

  .challenge-top strong {
    color: var(--ink);
    font-size: 0.82rem;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .challenge-card p {
    display: -webkit-box;
    overflow: hidden;
    margin: 0.55rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.82rem;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  footer,
  .status {
    color: var(--ink-faint);
    font-size: 0.7rem;
    text-transform: capitalize;
  }

  .clear-filter {
    gap: 0.4rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 700;
  }

  @media (max-width: 850px) {
    .challenge-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .tools {
      width: 100%;
    }

    .tools label,
    .tools input,
    .tools select {
      min-width: 0;
      flex: 1;
    }

    .challenge-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
