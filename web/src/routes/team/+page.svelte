<script lang="ts">
  import {
    Check,
    Copy,
    Crown,
    LogIn,
    LogOut,
    Plus,
    RotateCw,
    UserMinus,
    Users
  } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { team } from '$lib/stores/team.svelte';

  let loaded = $state(false);
  let mode = $state<'create' | 'join' | null>(null);
  let name = $state('');
  let inviteCode = $state('');
  let copied = $state(false);
  let pendingRemoval = $state<string | null>(null);
  let confirmLeave = $state(false);

  $effect(() => {
    if (session.authenticated && !loaded) {
      loaded = true;
      void team.load();
    }
  });

  async function create(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (await team.create({ name })) {
      mode = null;
    }
  }

  async function join(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (await team.join({ invite_code: inviteCode })) {
      mode = null;
    }
  }

  async function copyInvite(): Promise<void> {
    if (!team.inviteCode) {
      return;
    }
    await navigator.clipboard.writeText(team.inviteCode);
    copied = true;
  }

  async function removeMember(userId: string): Promise<void> {
    if (pendingRemoval !== userId) {
      pendingRemoval = userId;
      return;
    }
    if (await team.removeMember(userId)) {
      pendingRemoval = null;
    }
  }

  async function leaveTeam(): Promise<void> {
    if (!confirmLeave) {
      confirmLeave = true;
      return;
    }
    if (await team.leave()) {
      confirmLeave = false;
    }
  }
</script>

<svelte:head><title>Team — Kitsune</title></svelte:head>

<div class="page team-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Identity</p>
      <h1 class="title">Your team</h1>
      <p class="lede">Gather the right people. Keep the invite code inside the den.</p>
    </div>
    {#if !team.current}
      <div class="actions">
        <Button variant="secondary" onclick={() => (mode = 'join')}>
          <LogIn size={16} />
          Join team
        </Button>
        <Button onclick={() => (mode = 'create')}>
          <Plus size={16} />
          Create team
        </Button>
      </div>
    {/if}
  </div>

  {#if team.loading}
    <p class="status" role="status">Finding your team…</p>
  {:else if team.current}
    <div class="team-grid">
      <Card elevated>
        <div class="team-head">
          <div>
            <Users size={19} />
            <h2>{team.current.name}</h2>
          </div>
          <Badge>{team.current.members.length} members</Badge>
        </div>
        <div class="members">
          {#each team.current.members as member (member.user_id)}
            <article>
              <div>
                <strong>{member.display_name}</strong>
                <small>Joined {new Date(member.joined_at).toLocaleDateString()}</small>
              </div>
              {#if member.captain}
                <Badge tone="accent"><Crown size={11} /> Captain</Badge>
              {:else if team.isCaptain}
                <div class="member-actions">
                  <Button
                    variant="quiet"
                    loading={team.saving}
                    onclick={() => team.transferCaptain(member.user_id)}
                  >
                    Make captain
                  </Button>
                  <Button
                    variant={pendingRemoval === member.user_id ? 'danger' : 'quiet'}
                    loading={team.saving}
                    onclick={() => removeMember(member.user_id)}
                  >
                    <UserMinus size={14} />
                    {pendingRemoval === member.user_id ? 'Confirm remove' : 'Remove'}
                  </Button>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      </Card>
      {#if team.isCaptain}
        <Card>
          <div class="invite">
            <div>
              <span>Team invite · each code is shown once</span>
              {#if team.inviteCode}
                <code>{team.inviteCode}</code>
                <small>Share this over a trusted channel. Kitsune stores only its digest.</small>
              {:else}
                <strong>Ready for a fresh code</strong>
                <small>Rotating invalidates the previous code immediately.</small>
              {/if}
            </div>
            <div class="invite-actions">
              {#if team.inviteCode}
                <Button variant="secondary" onclick={copyInvite}>
                  {#if copied}
                    <Check size={15} />
                    Copied
                  {:else}
                    <Copy size={15} />
                    Copy
                  {/if}
                </Button>
              {/if}
              <Button variant="secondary" loading={team.saving} onclick={() => team.rotateInvite()}>
                <RotateCw size={15} />
                Rotate code
              </Button>
            </div>
          </div>
        </Card>
      {:else}
        <Card>
          <div class="leave-panel">
            <div>
              <span>Membership</span>
              <strong>Leave {team.current.name}</strong>
              <small>Your existing team score remains with the team.</small>
            </div>
            <Button
              variant={confirmLeave ? 'danger' : 'secondary'}
              loading={team.saving}
              onclick={leaveTeam}
            >
              <LogOut size={15} />
              {confirmLeave ? 'Confirm leave' : 'Leave team'}
            </Button>
          </div>
        </Card>
      {/if}
      {#if team.error}
        <p class="error-text" role="alert">{team.error}</p>
      {/if}
    </div>
  {:else if mode}
    <Card elevated>
      {#if mode === 'create'}
        <form onsubmit={create}>
          <h2>Create a team</h2>
          <label class="field">
            <span>Team name</span>
            <input bind:value={name} required maxlength="80" placeholder="Nine Tails" />
          </label>
          <div class="form-actions">
            <Button variant="quiet" onclick={() => (mode = null)}>Cancel</Button>
            <Button type="submit" loading={team.saving}>Create team</Button>
          </div>
        </form>
      {:else}
        <form onsubmit={join}>
          <h2>Join a team</h2>
          <label class="field">
            <span>Invite code</span>
            <input bind:value={inviteCode} required minlength="20" autocomplete="off" />
          </label>
          <div class="form-actions">
            <Button variant="quiet" onclick={() => (mode = null)}>Cancel</Button>
            <Button type="submit" loading={team.saving}>Join team</Button>
          </div>
        </form>
      {/if}
      {#if team.error}
        <p class="error-text" role="alert">{team.error}</p>
      {/if}
    </Card>
  {:else}
    <EmptyState
      title="No team yet"
      detail="Create one and receive a one-time invite code, or join with a code from a captain."
    />
  {/if}
</div>

<style>
  .team-page,
  .team-grid,
  form {
    display: grid;
    gap: 1rem;
  }

  .actions,
  .form-actions,
  .team-head,
  .team-head > div,
  .members article,
  .invite {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .member-actions,
  .invite-actions,
  .leave-panel {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .leave-panel {
    justify-content: space-between;
  }

  .leave-panel > div {
    display: grid;
    gap: 0.25rem;
  }

  .team-head,
  .members article,
  .invite {
    justify-content: space-between;
  }

  .team-head h2,
  form h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .members {
    display: grid;
    margin-top: 1rem;
    border-top: 1px solid var(--line);
  }

  .members article {
    min-height: 4rem;
    border-bottom: 1px solid var(--line);
  }

  .members article:last-child {
    border-bottom: 0;
  }

  .members article > div,
  .invite > div {
    display: grid;
    gap: 0.25rem;
  }

  .members small,
  .invite span,
  .invite small,
  .leave-panel span,
  .leave-panel small,
  .status {
    color: var(--ink-secondary);
    font-size: 0.75rem;
  }

  .invite code {
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.9rem;
    overflow-wrap: anywhere;
  }

  .form-actions {
    justify-content: end;
  }

  @media (max-width: 620px) {
    .actions,
    .invite,
    .leave-panel,
    .member-actions,
    .invite-actions {
      width: 100%;
      align-items: stretch;
      flex-direction: column;
    }

    .actions > :global(*),
    .invite > :global(*),
    .leave-panel > :global(*),
    .member-actions > :global(*),
    .invite-actions > :global(*) {
      width: 100%;
    }
  }
</style>
