<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    padded = true,
    elevated = false
  }: { children: Snippet; padded?: boolean; elevated?: boolean } = $props();
</script>

<div class="card" class:padded class:elevated>{@render children()}</div>

<style>
  .card {
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface);
  }

  .padded {
    padding: 1.2rem;
  }

  .elevated {
    box-shadow: var(--shadow-sm);
  }
</style>
