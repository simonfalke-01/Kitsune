<script lang="ts">
  import { Switch } from 'bits-ui';

  let {
    checked = $bindable(false),
    label,
    description,
    disabled = false,
    onchange
  }: {
    checked?: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  } = $props();

  function update(value: boolean) {
    checked = value;
    onchange?.(value);
  }
</script>

<label class:disabled>
  <span class="copy">
    <strong>{label}</strong>
    {#if description}<small>{description}</small>{/if}
  </span>
  <Switch.Root {checked} onCheckedChange={update} {disabled} class="switch" aria-label={label}>
    <Switch.Thumb class="thumb" />
  </Switch.Root>
</label>

<style>
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    cursor: pointer;
  }

  .copy {
    display: grid;
    gap: 0.25rem;
  }

  strong {
    font-size: 0.9rem;
  }

  small {
    max-width: 62ch;
    color: var(--ink-secondary);
    font-size: 0.78rem;
    line-height: 1.45;
  }

  :global(.switch) {
    position: relative;
    width: 2.6rem;
    height: 1.48rem;
    flex: none;
    padding: 0.16rem;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--surface-muted);
    cursor: pointer;
    transition:
      background var(--duration-fast),
      border-color var(--duration-fast);
  }

  :global(.switch[data-state='checked']) {
    border-color: var(--accent);
    background: var(--accent);
  }

  :global(.thumb) {
    display: block;
    width: 1.02rem;
    height: 1.02rem;
    border-radius: 999px;
    background: white;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
    transition: transform var(--duration-fast);
  }

  :global(.thumb[data-state='checked']) {
    transform: translateX(1.1rem);
  }

  .disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }
</style>
