<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    tone = 'neutral'
  }: { children: Snippet; tone?: 'neutral' | 'success' | 'warning' | 'accent' } = $props();
</script>

<span class="badge {tone}">{@render children()}</span>

<style>
  .badge {
    display: inline-flex;
    min-height: 1.55rem;
    align-items: center;
    padding: 0.2rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--surface-muted);
    color: var(--ink-secondary);
    font-size: 0.67rem;
    font-weight: 720;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .success {
    border-color: color-mix(in srgb, var(--success) 28%, transparent);
    background: color-mix(in srgb, var(--success) 10%, transparent);
    color: var(--success);
  }

  .warning {
    border-color: color-mix(in srgb, var(--warning) 28%, transparent);
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    color: var(--warning);
  }

  .accent {
    border-color: color-mix(in srgb, var(--accent) 32%, transparent);
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
