<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Search } from '@lucide/svelte';

  let { title, detail, action }: { title: string; detail?: string; action?: Snippet } = $props();
</script>

<section class="empty" aria-labelledby="empty-title">
  <div class="icon" aria-hidden="true"><Search size={19} strokeWidth={1.7} /></div>
  <h2 id="empty-title">{title}</h2>
  {#if detail}<p>{detail}</p>{/if}
  {#if action}<div class="action">{@render action()}</div>{/if}
</section>

<style>
  .empty {
    display: grid;
    min-height: 22rem;
    place-items: center;
    align-content: center;
    padding: 2.5rem 1rem;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius-lg);
    text-align: center;
  }

  .icon {
    display: grid;
    width: 2.8rem;
    height: 2.8rem;
    margin-bottom: 1rem;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 0.8rem;
    background: var(--surface);
    color: var(--ink-secondary);
    box-shadow: var(--shadow-sm);
  }

  h2 {
    margin: 0;
    font-size: 1.08rem;
    letter-spacing: -0.025em;
  }

  p {
    max-width: 44ch;
    margin: 0.55rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.9rem;
    line-height: 1.55;
  }

  .action {
    margin-top: 1.1rem;
  }
</style>
