<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowRightLeft, GitMerge, ShieldCheck, UsersRound } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import { adminTeams } from '$lib/stores/admin-teams.svelte';

  let selectedTeamId = $state('');
  let memberId = $state('');
  let transferTargetId = $state('');
  let replacementCaptainId = $state('');
  let mergeTargetId = $state('');
  let mergeAcknowledged = $state(false);
  let notice = $state<string | null>(null);

  let selectedTeam = $derived(
    adminTeams.teams.find((team) => team.id === selectedTeamId) ?? adminTeams.teams[0] ?? null
  );
  let selectedMember = $derived(
    selectedTeam?.members.find((member) => member.user_id === memberId) ?? null
  );
  let otherTeams = $derived(adminTeams.teams.filter((team) => team.id !== selectedTeam?.id));
  let replacementCandidates = $derived(
    selectedTeam?.members.filter((member) => member.user_id !== selectedMember?.user_id) ?? []
  );

  onMount(async () => {
    await adminTeams.load();
    selectedTeamId = adminTeams.teams[0]?.id ?? '';
    resetOperations();
  });

  function selectTeam(teamId: string): void {
    selectedTeamId = teamId;
    notice = null;
    adminTeams.error = null;
    resetOperations();
  }

  function resetOperations(): void {
    memberId = '';
    transferTargetId = '';
    replacementCaptainId = '';
    mergeTargetId = '';
    mergeAcknowledged = false;
  }

  async function transferMember(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!selectedTeam || !memberId || !transferTargetId) {
      return;
    }
    const transferred = await adminTeams.transferMember(selectedTeam.id, memberId, {
      target_team_id: transferTargetId,
      replacement_captain_id: selectedMember?.captain ? replacementCaptainId || null : null
    });
    if (transferred) {
      notice = 'Membership transferred. Both rosters are now current.';
      resetOperations();
    }
  }

  async function mergeTeams(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!selectedTeam || !mergeTargetId || !mergeAcknowledged) {
      return;
    }
    const sourceName = selectedTeam.name;
    const targetName = otherTeams.find((team) => team.id === mergeTargetId)?.name ?? 'target team';
    const merged = await adminTeams.merge(selectedTeam.id, {
      target_team_id: mergeTargetId
    });
    if (merged) {
      selectedTeamId = mergeTargetId;
      notice = `${sourceName} was merged into ${targetName}. Historical ownership is preserved.`;
      resetOperations();
    }
  }
</script>

<section class="page admin-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Identity operations</p>
      <h1 class="title">Teams, without loose ends.</h1>
      <p class="lede">
        Transfer members or consolidate duplicate rosters while Kitsune preserves the competition
        record and audit trail.
      </p>
    </div>
    <Badge tone="accent">
      <ShieldCheck size={12} />
      Integrity guarded
    </Badge>
  </div>

  {#if adminTeams.error}
    <div class="message error" role="alert">{adminTeams.error}</div>
  {:else if notice}
    <div class="message success" role="status">{notice}</div>
  {/if}

  {#if adminTeams.loading}
    <Card>
      <p class="empty">Loading team operations…</p>
    </Card>
  {:else if adminTeams.teams.length === 0}
    <Card>
      <div class="empty-state">
        <UsersRound size={22} />
        <h2>No teams yet</h2>
        <p>Player-created teams will appear here with their complete roster.</p>
      </div>
    </Card>
  {:else}
    <div class="operations-layout">
      <Card padded={false}>
        <div class="team-list-head">
          <div>
            <p>All teams</p>
            <span>{adminTeams.teams.length} total</span>
          </div>
        </div>
        <div class="team-list">
          {#each adminTeams.teams as team (team.id)}
            <button
              type="button"
              class:active={team.id === selectedTeam?.id}
              onclick={() => selectTeam(team.id)}
            >
              <span class="team-avatar" aria-hidden="true"
                >{team.name.slice(0, 2).toUpperCase()}</span
              >
              <span class="team-label">
                <strong>{team.name}</strong>
                <small
                  >{team.members.length} {team.members.length === 1 ? 'member' : 'members'}</small
                >
              </span>
            </button>
          {/each}
        </div>
      </Card>

      {#if selectedTeam}
        <div class="team-detail">
          <Card>
            <div class="detail-head">
              <div>
                <p class="eyebrow">Selected roster</p>
                <h2>{selectedTeam.name}</h2>
              </div>
              <Badge>{selectedTeam.members.length} members</Badge>
            </div>
            <div class="roster">
              {#each selectedTeam.members as member (member.user_id)}
                <div class="member-row">
                  <span class="member-avatar" aria-hidden="true">
                    {member.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{member.display_name}</strong>
                    <small>Joined {new Date(member.joined_at).toLocaleDateString()}</small>
                  </span>
                  {#if member.captain}<Badge tone="accent">Captain</Badge>{/if}
                </div>
              {/each}
            </div>
          </Card>

          <div class="action-grid">
            <Card>
              <div class="action-title">
                <ArrowRightLeft size={18} />
                <div>
                  <h2>Transfer a member</h2>
                  <p>Move one identity while both teams remain intact.</p>
                </div>
              </div>
              <form onsubmit={transferMember}>
                <label class="field">
                  <span>Member</span>
                  <select bind:value={memberId} required>
                    <option value="" disabled>Select a member</option>
                    {#each selectedTeam.members as member (member.user_id)}
                      <option value={member.user_id}>
                        {member.display_name}{member.captain ? ' — captain' : ''}
                      </option>
                    {/each}
                  </select>
                </label>
                <label class="field">
                  <span>Destination</span>
                  <select bind:value={transferTargetId} required>
                    <option value="" disabled>Select a team</option>
                    {#each otherTeams as team (team.id)}
                      <option value={team.id}>{team.name}</option>
                    {/each}
                  </select>
                </label>
                {#if selectedMember?.captain}
                  <label class="field">
                    <span>New source captain</span>
                    <select bind:value={replacementCaptainId} required>
                      <option value="" disabled>Select a successor</option>
                      {#each replacementCandidates as member (member.user_id)}
                        <option value={member.user_id}>{member.display_name}</option>
                      {/each}
                    </select>
                    <small>Captaincy must remain with the source team.</small>
                  </label>
                {/if}
                <Button
                  type="submit"
                  variant="secondary"
                  loading={adminTeams.saving}
                  disabled={!memberId || !transferTargetId || otherTeams.length === 0}
                >
                  Transfer member
                </Button>
              </form>
            </Card>

            <Card>
              <div class="action-title danger-title">
                <GitMerge size={18} />
                <div>
                  <h2>Merge this team</h2>
                  <p>Move the complete roster and historical ownership into one survivor.</p>
                </div>
              </div>
              <form onsubmit={mergeTeams}>
                <label class="field">
                  <span>Surviving team</span>
                  <select bind:value={mergeTargetId} required>
                    <option value="" disabled>Select a team</option>
                    {#each otherTeams as team (team.id)}
                      <option value={team.id}>{team.name}</option>
                    {/each}
                  </select>
                </label>
                <label class="acknowledgement">
                  <input type="checkbox" bind:checked={mergeAcknowledged} />
                  <span>
                    I understand <strong>{selectedTeam.name}</strong> will be removed after its data is
                    reassigned.
                  </span>
                </label>
                <p class="guardrail">
                  Live competitors and active instances are blocked automatically. Duplicate solves
                  retain the earliest solve; current target placements win conflicting selections.
                </p>
                <Button
                  type="submit"
                  variant="danger"
                  loading={adminTeams.saving}
                  disabled={!mergeTargetId || !mergeAcknowledged || otherTeams.length === 0}
                >
                  Merge team
                </Button>
              </form>
            </Card>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .admin-page {
    width: 100%;
  }

  .message {
    margin-bottom: 1rem;
    padding: 0.8rem 0.95rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: 0.82rem;
  }

  .message.error {
    border-color: color-mix(in srgb, var(--danger) 35%, var(--line));
    background: color-mix(in srgb, var(--danger) 8%, var(--surface));
    color: var(--danger);
  }

  .message.success {
    border-color: color-mix(in srgb, var(--success) 35%, var(--line));
    background: color-mix(in srgb, var(--success) 8%, var(--surface));
    color: var(--success);
  }

  .operations-layout {
    display: grid;
    grid-template-columns: minmax(220px, 0.32fr) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }

  .team-list-head {
    padding: 1rem;
    border-bottom: 1px solid var(--line);
  }

  .team-list-head div,
  .detail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .team-list-head p {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .team-list-head span,
  .team-label small,
  .member-row small,
  .field small {
    color: var(--ink-faint);
    font-size: 0.7rem;
  }

  .team-list {
    display: grid;
    padding: 0.45rem;
  }

  .team-list button {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 0.7rem;
    padding: 0.65rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    text-align: left;
  }

  .team-list button:hover,
  .team-list button.active {
    background: var(--surface-muted);
  }

  .team-avatar,
  .member-avatar {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--ink);
    font-weight: 750;
  }

  .team-avatar {
    width: 2.1rem;
    height: 2.1rem;
    font-size: 0.69rem;
  }

  .team-label,
  .member-row > span:nth-child(2) {
    display: grid;
    min-width: 0;
    gap: 0.18rem;
  }

  .team-label strong,
  .member-row strong {
    overflow: hidden;
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .team-detail,
  .roster,
  form {
    display: grid;
    gap: 0.8rem;
  }

  .detail-head {
    margin-bottom: 1rem;
  }

  .detail-head h2,
  .action-title h2,
  .empty-state h2 {
    margin: 0;
    font-size: 1rem;
  }

  .member-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.7rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--line);
  }

  .member-avatar {
    width: 1.9rem;
    height: 1.9rem;
    font-size: 0.72rem;
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .action-title {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    margin-bottom: 1rem;
    color: var(--accent);
  }

  .action-title p,
  .guardrail,
  .empty-state p {
    margin: 0.25rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.74rem;
    line-height: 1.5;
  }

  .danger-title {
    color: var(--danger);
  }

  .field {
    display: grid;
    gap: 0.38rem;
    color: var(--ink-secondary);
    font-size: 0.73rem;
    font-weight: 650;
  }

  .field select {
    width: 100%;
    min-height: 2.55rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink);
  }

  .acknowledgement {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: start;
    gap: 0.55rem;
    color: var(--ink-secondary);
    font-size: 0.74rem;
    line-height: 1.5;
  }

  .acknowledgement input {
    width: 1rem;
    height: 1rem;
    margin-top: 0.1rem;
    accent-color: var(--danger);
  }

  .guardrail {
    padding: 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
  }

  .empty,
  .empty-state {
    color: var(--ink-secondary);
    text-align: center;
  }

  .empty-state {
    display: grid;
    justify-items: center;
    gap: 0.45rem;
    padding: 2rem;
  }

  @media (max-width: 980px) {
    .action-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 720px) {
    .operations-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
