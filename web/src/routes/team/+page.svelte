<script lang="ts">
  import { Copy, Crown, Users } from '@lucide/svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
</script>

<svelte:head><title>Team — Kitsune</title></svelte:head>

<div class="page">
  <p class="eyebrow">Identity</p>
  <h1 class="title">Your team</h1>
  <p class="lede">Captain controls, invitations, and roster changes live here.</p>
  <div class="team-space">
    <EmptyState
      title="You have not joined a team."
      detail="Create one or enter an invite code when the event opens team registration."
    >
      {#snippet action()}
        <span class="hint">
          <Users size={16} />
          Team membership is event-aware.
        </span>
      {/snippet}
    </EmptyState>
  </div>
  <div class="reference grid grid-3" aria-label="Team capabilities">
    <Card>
      <Crown size={17} />
      <h2>Captain controls</h2>
      <p>Invite, approve, remove, and transfer leadership.</p>
    </Card>
    <Card>
      <Copy size={17} />
      <h2>Private invite codes</h2>
      <p>Rotatable codes are stored as one-way digests.</p>
    </Card>
    <Card>
      <Users size={17} />
      <h2>Clear limits</h2>
      <p>Size policies are visible before anyone joins.</p>
    </Card>
  </div>
</div>

<style>
  .team-space {
    margin-top: 2rem;
  }
  .hint {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }
  .reference {
    margin-top: 1rem;
  }
  .reference :global(h2) {
    margin: 1.4rem 0 0.35rem;
    font-size: 0.92rem;
  }
  .reference :global(p) {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
  }
</style>
