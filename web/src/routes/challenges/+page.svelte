<script lang="ts">
  import { Filter, Search } from '@lucide/svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { copy, toned } from '$lib/i18n/index.svelte';

  let query = $state('');
</script>

<svelte:head><title>Challenges — Kitsune</title></svelte:head>

<div class="page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Jeopardy</p>
      <h1 class="title">Challenges</h1>
      <p class="lede">Choose carefully. Every trail tells you something.</p>
    </div>
    <div class="tools">
      <label>
        <span class="sr-only">Search challenges</span>
        <Search size={15} />
        <input bind:value={query} placeholder="Search" />
      </label>
      <button type="button">
        <Filter size={15} />
        Filter
      </button>
    </div>
  </div>
  <EmptyState
    title={toned(copy('empty').challenges)}
    detail={query
      ? `Nothing matches “${query}”.`
      : 'The board updates live when an organizer publishes a challenge.'}
  />
</div>

<style>
  .tools {
    display: flex;
    gap: 0.5rem;
  }
  .tools label,
  .tools button {
    display: flex;
    min-height: 2.55rem;
    align-items: center;
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
  .tools button {
    cursor: pointer;
    font-size: 0.8rem;
  }
</style>
