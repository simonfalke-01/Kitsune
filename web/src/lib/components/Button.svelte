<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    variant = 'primary',
    type = 'button',
    disabled = false,
    loading = false,
    onclick,
    ariaLabel
  }: {
    children: Snippet;
    variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    onclick?: (event: MouseEvent) => void;
    ariaLabel?: string;
  } = $props();
</script>

<button
  class="button {variant}"
  {type}
  disabled={disabled || loading}
  aria-busy={loading}
  aria-label={ariaLabel}
  {onclick}
>
  {#if loading}<span class="spinner" aria-hidden="true"></span>{/if}
  <span class:visually-muted={loading}>{@render children()}</span>
</button>

<style>
  .button {
    position: relative;
    display: inline-flex;
    min-height: 2.65rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.62rem 1rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.88rem;
    font-weight: 680;
    letter-spacing: -0.01em;
    transition:
      transform var(--duration-fast),
      background var(--duration-fast),
      border-color var(--duration-fast),
      opacity var(--duration-fast);
  }

  .button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .button:active:not(:disabled) {
    transform: translateY(0);
  }

  .primary {
    background: var(--accent);
    color: white;
  }

  .primary:hover:not(:disabled) {
    background: var(--accent-strong);
  }

  .secondary {
    border-color: var(--line-strong);
    background: var(--surface-raised);
    color: var(--ink);
  }

  .secondary:hover:not(:disabled),
  .quiet:hover:not(:disabled) {
    background: var(--surface-muted);
  }

  .quiet {
    background: transparent;
    color: var(--ink-secondary);
  }

  .danger {
    border-color: color-mix(in srgb, var(--danger) 35%, transparent);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
  }

  .button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .spinner {
    position: absolute;
    width: 1rem;
    height: 1rem;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 999px;
    animation: spin 700ms linear infinite;
  }

  .visually-muted {
    opacity: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 1.5s;
    }
  }
</style>
