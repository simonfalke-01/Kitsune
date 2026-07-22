<script lang="ts">
  import { preferences } from '$lib/i18n/index.svelte';

  let { compact = false }: { compact?: boolean } = $props();
</script>

{#if preferences.branding}
  <span class="brand" aria-label="Kitsune">
    <span class="placeholder" aria-hidden="true">
      <i></i><i></i><b></b>
    </span>
    {#if !compact}<span class="wordmark">Kitsune</span>{/if}
  </span>
{/if}

<style>
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    color: var(--ink);
  }

  .wordmark {
    font-size: 1.03rem;
    font-weight: 720;
    letter-spacing: -0.035em;
  }

  .placeholder {
    position: relative;
    display: block;
    width: 1.8rem;
    height: 1.8rem;
    border: 1px solid var(--line-strong);
    border-radius: 0.55rem;
    background: var(--surface-muted);
  }

  .placeholder i {
    position: absolute;
    top: 0.33rem;
    width: 0.48rem;
    height: 0.52rem;
    border: 1px solid var(--ink-faint);
    border-bottom: 0;
    background: var(--surface-muted);
    transform: rotate(45deg);
  }

  .placeholder i:first-child {
    left: 0.31rem;
  }

  .placeholder i:nth-child(2) {
    right: 0.31rem;
    transform: rotate(-45deg);
  }

  .placeholder b {
    position: absolute;
    left: 50%;
    bottom: 0.32rem;
    width: 0.72rem;
    height: 0.62rem;
    border-radius: 45% 45% 55% 55%;
    background: var(--ink-faint);
    transform: translateX(-50%);
  }
</style>
