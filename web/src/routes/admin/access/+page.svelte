<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    BadgeCheck,
    KeyRound,
    LockKeyhole,
    Plus,
    ShieldCheck,
    ShieldUser,
    UserRoundCog,
    Users
  } from '@lucide/svelte';
  import type { ManagedRole, ManagedUser } from '$lib/api/client';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import { adminTeams } from '$lib/stores/admin-teams.svelte';
  import { events } from '$lib/stores/events.svelte';
  import { identityAdmin } from '$lib/stores/identity-admin.svelte';
  import { session } from '$lib/stores/session.svelte';

  type AccessTab = 'accounts' | 'roles';

  let tab = $state<AccessTab>('accounts');
  let notice = $state<string | null>(null);
  let localError = $state<string | null>(null);

  let creatingUser = $state(false);
  let newDisplayName = $state('');
  let newEmail = $state('');
  let newPassword = $state('');
  let newVerified = $state(false);
  let newCustomFields = $state('{}');

  let selectedUserId = $state('');
  let userDisplayName = $state('');
  let userVerified = $state(false);
  let userDisabled = $state(false);
  let userCustomFields = $state('{}');

  let selectedRoleId = $state('');
  let roleKey = $state('');
  let roleName = $state('');
  let rolePermissions = $state<string[]>([]);

  let grantUserId = $state('');
  let grantRoleId = $state('');
  let grantEventId = $state('');
  let grantTeamId = $state('');

  let selectedUser = $derived(
    identityAdmin.users.find((user) => user.id === selectedUserId) ?? identityAdmin.users[0] ?? null
  );
  let selectedRole = $derived(
    identityAdmin.roles.find((role) => role.id === selectedRoleId) ?? null
  );
  let assignableRoles = $derived(
    identityAdmin.roles.filter(
      (role) => session.can('platform_manage') || !role.permissions.includes('platform_manage')
    )
  );
  let selectedGrantRole = $derived(
    identityAdmin.roles.find((role) => role.id === grantRoleId) ?? null
  );
  let selectedRoleAssignments = $derived(
    selectedRole ? identityAdmin.grants.filter((grant) => grant.role_id === selectedRole.id) : []
  );

  onMount(async () => {
    await session.bootstrap();
    if (!session.can('identity_manage')) {
      await goto('/admin');
      return;
    }
    await Promise.all([
      identityAdmin.load(),
      events.events.length === 0 ? events.load() : Promise.resolve(),
      session.can('team_manage') ? adminTeams.load() : Promise.resolve()
    ]);
    selectUser(identityAdmin.users[0] ?? null);
    grantUserId = identityAdmin.users[0]?.id ?? '';
    grantRoleId = assignableRoles[0]?.id ?? '';
  });

  function showTab(next: AccessTab): void {
    tab = next;
    notice = null;
    localError = null;
    identityAdmin.error = null;
  }

  function selectUser(user: ManagedUser | null): void {
    selectedUserId = user?.id ?? '';
    userDisplayName = user?.display_name ?? '';
    userVerified = user?.email_verified ?? false;
    userDisabled = user?.disabled ?? false;
    userCustomFields = prettyJson(user?.custom_fields ?? {});
    clearMessages();
  }

  function selectRole(role: ManagedRole | null): void {
    selectedRoleId = role?.id ?? '';
    roleKey = role?.key ?? '';
    roleName = role?.name ?? '';
    rolePermissions = role?.permissions.toSorted() ?? [];
    clearMessages();
  }

  function newRole(): void {
    selectRole(null);
  }

  function togglePermission(permission: string, checked: boolean): void {
    rolePermissions = checked
      ? Array.from(new Set(rolePermissions.concat(permission))).toSorted()
      : rolePermissions.filter((candidate) => candidate !== permission);
  }

  async function createUser(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const customFields = parseCustomFields(newCustomFields);
    if (!customFields) {
      return;
    }
    const created = await identityAdmin.createUser({
      display_name: newDisplayName,
      email: newEmail,
      password: newPassword,
      email_verified: newVerified,
      custom_fields: customFields
    });
    if (!created) {
      return;
    }
    const createdUser = identityAdmin.users[0] ?? null;
    creatingUser = false;
    newDisplayName = '';
    newEmail = '';
    newPassword = '';
    newVerified = false;
    newCustomFields = '{}';
    selectUser(createdUser);
    notice = 'Account created with the built-in player role.';
  }

  async function updateUser(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }
    const customFields = parseCustomFields(userCustomFields);
    if (!customFields) {
      return;
    }
    const updated = await identityAdmin.updateUser(selectedUser.id, {
      display_name: userDisplayName,
      email_verified: userVerified,
      disabled: userDisabled,
      custom_fields: customFields
    });
    if (updated) {
      selectUser(identityAdmin.users.find((user) => user.id === selectedUser.id) ?? null);
      notice = userDisabled
        ? 'Account disabled. Active sessions and API tokens were revoked.'
        : 'Account profile and lifecycle saved.';
    }
  }

  async function saveRole(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (selectedRole?.built_in) {
      return;
    }
    const wasEditing = selectedRole !== null;
    const editedRoleId = selectedRole?.id ?? null;
    const input = {
      key: roleKey,
      name: roleName,
      permissions: rolePermissions
    };
    const saved = editedRoleId
      ? await identityAdmin.updateRole(editedRoleId, input)
      : await identityAdmin.createRole(input);
    if (!saved) {
      return;
    }
    const savedRole = editedRoleId
      ? identityAdmin.roles.find((role) => role.id === editedRoleId)
      : identityAdmin.roles.find((role) => role.key === roleKey);
    selectRole(savedRole ?? null);
    notice = wasEditing ? 'Custom role updated.' : 'Custom role created.';
  }

  async function deleteRole(): Promise<void> {
    if (!selectedRole || selectedRole.built_in || selectedRoleAssignments.length > 0) {
      return;
    }
    const deleted = await identityAdmin.deleteRole(selectedRole.id);
    if (deleted) {
      selectRole(null);
      notice = 'Custom role deleted.';
    }
  }

  async function createGrant(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!grantUserId || !grantRoleId) {
      return;
    }
    const platformWide = selectedGrantRole?.permissions.includes('platform_manage') ?? false;
    const created = await identityAdmin.createGrant({
      user_id: grantUserId,
      role_id: grantRoleId,
      event_id: platformWide ? null : grantEventId || null,
      team_id: platformWide ? null : grantTeamId || null
    });
    if (created) {
      notice = 'Role assigned at the selected scope.';
    }
  }

  async function revokeGrant(grantId: string): Promise<void> {
    if (await identityAdmin.revokeGrant(grantId)) {
      notice = 'Role assignment revoked.';
    }
  }

  function parseCustomFields(source: string): Record<string, unknown> | null {
    try {
      const value: unknown = JSON.parse(source);
      if (!value || Array.isArray(value) || typeof value !== 'object') {
        throw new Error('Profile fields must be a JSON object.');
      }
      localError = null;
      return value as Record<string, unknown>;
    } catch (error) {
      localError = error instanceof Error ? error.message : 'Profile fields are not valid JSON.';
      return null;
    }
  }

  function clearMessages(): void {
    notice = null;
    localError = null;
    identityAdmin.error = null;
  }

  function prettyJson(value: unknown): string {
    return JSON.stringify(value ?? {}, null, 2);
  }

  function permissionLabel(value: string): string {
    return value
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function userName(userId: string): string {
    return identityAdmin.users.find((user) => user.id === userId)?.display_name ?? 'Unknown user';
  }

  function scopeLabel(
    eventId: string | null | undefined,
    teamId: string | null | undefined
  ): string {
    const eventName = events.events.find((event) => event.id === eventId)?.name;
    const teamName = adminTeams.teams.find((team) => team.id === teamId)?.name;
    if (eventName && teamName) {
      return `${eventName} · ${teamName}`;
    }
    return eventName ?? teamName ?? 'Organization-wide';
  }
</script>

<section class="page access-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Identity and authority</p>
      <h1 class="title">Access, without ambiguity.</h1>
      <p class="lede">
        Manage accounts and compose exact permissions without losing sight of who can do what,
        where, and why.
      </p>
    </div>
    <Badge tone="accent">
      <ShieldCheck size={12} />
      Least privilege
    </Badge>
  </div>

  <div class="summary-grid" aria-label="Access summary">
    <Card>
      <span class="summary-icon"><Users size={17} /></span>
      <strong>{identityAdmin.users.length}</strong>
      <span>Accounts</span>
    </Card>
    <Card>
      <span class="summary-icon"><ShieldUser size={17} /></span>
      <strong>{identityAdmin.roles.length}</strong>
      <span>Reusable roles</span>
    </Card>
    <Card>
      <span class="summary-icon"><KeyRound size={17} /></span>
      <strong>{identityAdmin.grants.length}</strong>
      <span>Active grants</span>
    </Card>
  </div>

  <div class="tabs" role="tablist" aria-label="Access administration">
    <button
      type="button"
      role="tab"
      aria-selected={tab === 'accounts'}
      class:active={tab === 'accounts'}
      onclick={() => showTab('accounts')}
    >
      Accounts
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={tab === 'roles'}
      class:active={tab === 'roles'}
      onclick={() => showTab('roles')}
    >
      Roles & grants
    </button>
  </div>

  {#if identityAdmin.error || localError}
    <div class="message error" role="alert">{localError ?? identityAdmin.error}</div>
  {:else if notice}
    <div class="message success" role="status">{notice}</div>
  {/if}

  {#if identityAdmin.loading}
    <Card><p class="loading">Reading the access graph…</p></Card>
  {:else if tab === 'accounts'}
    <div class="section-head">
      <div>
        <p class="eyebrow">People</p>
        <h2>Organization accounts</h2>
      </div>
      <Button variant="secondary" onclick={() => (creatingUser = !creatingUser)}>
        <Plus size={14} />
        {creatingUser ? 'Close form' : 'New account'}
      </Button>
    </div>

    {#if creatingUser}
      <Card>
        <form class="create-user" onsubmit={createUser}>
          <div class="form-intro">
            <UserRoundCog size={18} />
            <div>
              <h3>Create a local account</h3>
              <p>The password is hashed with Argon2id before the account transaction commits.</p>
            </div>
          </div>
          <label class="field">
            <span>Display name</span>
            <input bind:value={newDisplayName} maxlength="80" required />
          </label>
          <label class="field">
            <span>Email</span>
            <input type="email" bind:value={newEmail} maxlength="320" required />
          </label>
          <label class="field">
            <span>Temporary password</span>
            <input type="password" bind:value={newPassword} minlength="12" required />
          </label>
          <label class="check-row">
            <input type="checkbox" bind:checked={newVerified} />
            <span>Mark email as operator-verified</span>
          </label>
          <label class="field full-field">
            <span>Profile fields · JSON object</span>
            <textarea bind:value={newCustomFields} rows="4"></textarea>
          </label>
          <div class="form-actions">
            <Button type="submit" loading={identityAdmin.saving}>Create account</Button>
          </div>
        </form>
      </Card>
    {/if}

    {#if identityAdmin.users.length === 0}
      <Card><p class="loading">No accounts are visible to this organization.</p></Card>
    {:else}
      <div class="master-detail">
        <Card padded={false}>
          <div class="list-head">
            <strong>Directory</strong>
            <span>{identityAdmin.users.length} total</span>
          </div>
          <div class="selection-list">
            {#each identityAdmin.users as user (user.id)}
              <button
                type="button"
                class:active={user.id === selectedUser?.id}
                onclick={() => selectUser(user)}
              >
                <span class="avatar" aria-hidden="true">
                  {user.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span class="selection-copy">
                  <strong>{user.display_name}</strong>
                  <small>{user.email}</small>
                </span>
                <span class:disabled-dot={user.disabled} class="status-dot" aria-hidden="true"
                ></span>
              </button>
            {/each}
          </div>
        </Card>

        {#if selectedUser}
          <Card>
            <form class="account-editor" onsubmit={updateUser}>
              <div class="detail-head">
                <div>
                  <p class="eyebrow">Selected account</p>
                  <h2>{selectedUser.display_name}</h2>
                  <p>{selectedUser.email}</p>
                </div>
                <Badge tone={selectedUser.disabled ? 'warning' : 'success'}>
                  {selectedUser.disabled ? 'Disabled' : 'Active'}
                </Badge>
              </div>

              <div class="grant-chips" aria-label="Assigned roles">
                {#each identityAdmin.grantsForUser(selectedUser.id) as grant (grant.id)}
                  <span>{grant.role_name} · {scopeLabel(grant.event_id, grant.team_id)}</span>
                {:else}
                  <span>No explicit role grants</span>
                {/each}
              </div>

              <label class="field">
                <span>Display name</span>
                <input bind:value={userDisplayName} maxlength="80" required />
              </label>
              <label class="check-row">
                <input type="checkbox" bind:checked={userVerified} />
                <span>Email ownership verified</span>
              </label>
              <label class="field">
                <span>Profile fields · JSON object</span>
                <textarea bind:value={userCustomFields} rows="6"></textarea>
              </label>
              <label class="danger-check">
                <input
                  type="checkbox"
                  bind:checked={userDisabled}
                  disabled={selectedUser.id === session.current?.user.id}
                />
                <span>
                  <strong>Disable this account</strong>
                  <small>Revokes active sessions and API tokens when saved.</small>
                </span>
              </label>
              <Button type="submit" loading={identityAdmin.saving}>Save account</Button>
            </form>
          </Card>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="roles-layout">
      <div>
        <div class="section-head compact-head">
          <div>
            <p class="eyebrow">Permission bundles</p>
            <h2>Reusable roles</h2>
          </div>
          <Button variant="secondary" onclick={newRole}>
            <Plus size={14} />
            New role
          </Button>
        </div>
        <Card padded={false}>
          <div class="selection-list role-list">
            {#each identityAdmin.roles as role (role.id)}
              <button
                type="button"
                class:active={role.id === selectedRole?.id}
                onclick={() => selectRole(role)}
              >
                <span class="avatar role-avatar" aria-hidden="true"><ShieldUser size={15} /></span>
                <span class="selection-copy">
                  <strong>{role.name}</strong>
                  <small>{role.permissions.length} permissions · {role.key}</small>
                </span>
                {#if role.built_in}<Badge>Built in</Badge>{/if}
              </button>
            {/each}
          </div>
        </Card>
      </div>

      <Card>
        <form class="role-editor" onsubmit={saveRole}>
          <div class="detail-head">
            <div>
              <p class="eyebrow">{selectedRole ? 'Role contract' : 'New role'}</p>
              <h2>{selectedRole?.name ?? 'Compose exact authority'}</h2>
            </div>
            {#if selectedRole?.built_in}<Badge tone="accent">Kitsune managed</Badge>{/if}
          </div>
          <div class="two-fields">
            <label class="field">
              <span>Role name</span>
              <input
                bind:value={roleName}
                maxlength="80"
                disabled={selectedRole?.built_in}
                required
              />
            </label>
            <label class="field">
              <span>Stable key</span>
              <input
                bind:value={roleKey}
                maxlength="63"
                pattern="[a-z][a-z0-9_]*"
                disabled={selectedRole?.built_in}
                required
              />
            </label>
          </div>
          <fieldset disabled={selectedRole?.built_in}>
            <legend>Permissions</legend>
            <div class="permission-grid">
              {#each identityAdmin.permissions as permission (permission.key)}
                <label>
                  <input
                    type="checkbox"
                    checked={rolePermissions.includes(permission.key)}
                    onchange={(event) =>
                      togglePermission(permission.key, event.currentTarget.checked)}
                  />
                  <span>{permissionLabel(permission.key)}</span>
                </label>
              {/each}
            </div>
          </fieldset>
          {#if selectedRole?.permissions.includes('platform_manage')}
            <div class="protected-note">
              <LockKeyhole size={16} />
              Platform authority is built in, unscoped, and editable only by Kitsune upgrades.
            </div>
          {/if}
          {#if !selectedRole?.built_in}
            <div class="role-actions">
              <Button
                type="submit"
                loading={identityAdmin.saving}
                disabled={rolePermissions.length === 0}
              >
                {selectedRole ? 'Save role' : 'Create role'}
              </Button>
              {#if selectedRole}
                <Button
                  type="button"
                  variant="danger"
                  disabled={selectedRoleAssignments.length > 0}
                  onclick={deleteRole}
                >
                  Delete role
                </Button>
              {/if}
            </div>
            {#if selectedRoleAssignments.length > 0}
              <p class="guardrail">
                Revoke {selectedRoleAssignments.length} active assignments before deletion.
              </p>
            {/if}
          {/if}
        </form>
      </Card>
    </div>

    <div class="section-head grants-head">
      <div>
        <p class="eyebrow">Scoped authority</p>
        <h2>Role assignments</h2>
      </div>
    </div>
    <Card>
      <form class="grant-form" onsubmit={createGrant}>
        <label class="field">
          <span>Account</span>
          <select bind:value={grantUserId} required>
            {#each identityAdmin.users as user (user.id)}
              <option value={user.id}>{user.display_name}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Role</span>
          <select bind:value={grantRoleId} required>
            {#each assignableRoles as role (role.id)}
              <option value={role.id}>{role.name}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Event scope</span>
          <select
            bind:value={grantEventId}
            disabled={selectedGrantRole?.permissions.includes('platform_manage')}
          >
            <option value="">Every event</option>
            {#each events.events as event (event.id)}
              <option value={event.id}>{event.name}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Team scope</span>
          <select
            bind:value={grantTeamId}
            disabled={!session.can('team_manage') ||
              selectedGrantRole?.permissions.includes('platform_manage')}
          >
            <option value="">Every team</option>
            {#each adminTeams.teams as team (team.id)}
              <option value={team.id}>{team.name}</option>
            {/each}
          </select>
        </label>
        <Button
          type="submit"
          loading={identityAdmin.saving}
          disabled={!grantUserId || !grantRoleId}
        >
          Assign role
        </Button>
      </form>
    </Card>

    <div class="grant-list">
      {#each identityAdmin.grants as grant (grant.id)}
        {@const role = identityAdmin.roles.find((candidate) => candidate.id === grant.role_id)}
        <article>
          <span class="grant-icon"><BadgeCheck size={16} /></span>
          <div>
            <strong>{userName(grant.user_id)}</strong>
            <p>{grant.role_name} · {scopeLabel(grant.event_id, grant.team_id)}</p>
          </div>
          <Button
            variant="quiet"
            disabled={role?.permissions.includes('platform_manage') &&
              !session.can('platform_manage')}
            onclick={() => revokeGrant(grant.id)}
          >
            Revoke
          </Button>
        </article>
      {:else}
        <Card><p class="loading">No role assignments yet.</p></Card>
      {/each}
    </div>
  {/if}
</section>

<style>
  .access-page {
    width: 100%;
    max-width: 1100px;
  }

  .split-header,
  .section-head,
  .detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
  }

  .split-header {
    margin-bottom: 1.4rem;
  }

  .eyebrow {
    margin: 0 0 0.4rem;
    color: var(--accent);
    font-size: 0.69rem;
    font-weight: 760;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .title {
    margin: 0;
    font-size: clamp(2rem, 5vw, 3.4rem);
    letter-spacing: -0.055em;
    line-height: 0.98;
  }

  .lede {
    max-width: 690px;
    margin: 1rem 0 0;
    color: var(--ink-secondary);
    line-height: 1.65;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.7rem;
  }

  .summary-grid :global(.card) {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.15rem 0.7rem;
  }

  .summary-icon {
    display: grid;
    width: 2.2rem;
    height: 2.2rem;
    grid-row: span 2;
    place-items: center;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-muted));
    color: var(--accent);
  }

  .summary-grid strong {
    font-size: 1.15rem;
  }

  .summary-grid span:last-child {
    color: var(--ink-faint);
    font-size: 0.73rem;
  }

  .tabs {
    display: flex;
    gap: 0.3rem;
    margin: 1.5rem 0 1rem;
    padding: 0.25rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
  }

  .tabs button {
    min-height: 2.35rem;
    flex: 1;
    border: 0;
    border-radius: calc(var(--radius-sm) - 3px);
    background: transparent;
    color: var(--ink-secondary);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 680;
  }

  .tabs button.active {
    background: var(--surface-raised);
    box-shadow: var(--shadow-sm);
    color: var(--ink);
  }

  .message {
    margin-bottom: 1rem;
    padding: 0.8rem 0.9rem;
    border-radius: var(--radius-sm);
    font-size: 0.82rem;
  }

  .error {
    border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    color: var(--danger);
  }

  .success {
    border: 1px solid color-mix(in srgb, var(--success) 35%, transparent);
    background: color-mix(in srgb, var(--success) 8%, transparent);
    color: var(--success);
  }

  .section-head {
    align-items: end;
    margin: 1.6rem 0 0.8rem;
  }

  .section-head h2,
  .detail-head h2,
  .form-intro h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .create-user {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .form-intro {
    display: flex;
    grid-column: 1 / -1;
    gap: 0.7rem;
  }

  .form-intro p,
  .detail-head p,
  .guardrail {
    margin: 0.25rem 0 0;
    color: var(--ink-faint);
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .field {
    display: grid;
    gap: 0.4rem;
    color: var(--ink-secondary);
    font-size: 0.75rem;
    font-weight: 670;
  }

  .field input,
  .field select,
  .field textarea {
    width: 100%;
    min-height: 2.65rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink);
    font: inherit;
    font-weight: 500;
  }

  .field textarea {
    resize: vertical;
    font-family: var(--font-mono);
    font-size: 0.73rem;
  }

  .full-field,
  .form-actions {
    grid-column: 1 / -1;
  }

  .check-row,
  .danger-check {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }

  .master-detail,
  .roles-layout {
    display: grid;
    grid-template-columns: minmax(250px, 0.72fr) minmax(0, 1.28fr);
    gap: 0.8rem;
  }

  .list-head {
    display: flex;
    justify-content: space-between;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--line);
    font-size: 0.78rem;
  }

  .list-head span {
    color: var(--ink-faint);
  }

  .selection-list {
    display: grid;
    max-height: 590px;
    overflow-y: auto;
  }

  .selection-list > button {
    display: grid;
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.7rem;
    padding: 0.8rem 0.9rem;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: left;
  }

  .selection-list > button:last-child {
    border-bottom: 0;
  }

  .selection-list > button:hover,
  .selection-list > button.active {
    background: var(--surface-muted);
  }

  .avatar,
  .grant-icon {
    display: grid;
    width: 2.15rem;
    height: 2.15rem;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--accent) 12%, var(--surface-muted));
    color: var(--accent);
    font-size: 0.7rem;
    font-weight: 780;
  }

  .selection-copy {
    display: grid;
    min-width: 0;
    gap: 0.2rem;
  }

  .selection-copy strong,
  .selection-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selection-copy strong {
    font-size: 0.8rem;
  }

  .selection-copy small {
    color: var(--ink-faint);
    font-size: 0.68rem;
  }

  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--success);
  }

  .status-dot.disabled-dot {
    background: var(--danger);
  }

  .account-editor,
  .role-editor {
    display: grid;
    gap: 1rem;
  }

  .grant-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .grant-chips span {
    padding: 0.3rem 0.5rem;
    border-radius: 999px;
    background: var(--surface-muted);
    color: var(--ink-secondary);
    font-size: 0.66rem;
  }

  .danger-check {
    align-items: flex-start;
    padding: 0.8rem;
    border: 1px solid color-mix(in srgb, var(--danger) 25%, var(--line));
    border-radius: var(--radius-sm);
  }

  .danger-check span {
    display: grid;
    gap: 0.2rem;
  }

  .danger-check small {
    color: var(--ink-faint);
  }

  .compact-head {
    margin-top: 0;
  }

  .role-list {
    max-height: 510px;
  }

  .role-avatar {
    border-radius: var(--radius-sm);
  }

  .two-fields,
  .grant-form {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.8rem;
  }

  fieldset {
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 0.55rem;
    color: var(--ink-secondary);
    font-size: 0.75rem;
    font-weight: 670;
  }

  .permission-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem;
  }

  .permission-grid label {
    display: flex;
    min-height: 2.3rem;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--ink-secondary);
    font-size: 0.7rem;
  }

  .protected-note {
    display: flex;
    gap: 0.55rem;
    padding: 0.75rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-muted));
    color: var(--ink-secondary);
    font-size: 0.75rem;
  }

  .role-actions {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .grants-head {
    margin-top: 2rem;
  }

  .grant-form {
    grid-template-columns: repeat(4, 1fr) auto;
    align-items: end;
  }

  .grant-list {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.7rem;
  }

  .grant-list article {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }

  .grant-list strong {
    font-size: 0.8rem;
  }

  .grant-list p {
    margin: 0.2rem 0 0;
    color: var(--ink-faint);
    font-size: 0.7rem;
  }

  .loading {
    margin: 0;
    color: var(--ink-faint);
    font-size: 0.8rem;
    text-align: center;
  }

  @media (max-width: 900px) {
    .grant-form {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 720px) {
    .split-header,
    .section-head,
    .detail-head {
      align-items: flex-start;
    }

    .summary-grid {
      grid-template-columns: 1fr;
    }

    .create-user,
    .master-detail,
    .roles-layout,
    .two-fields,
    .grant-form,
    .permission-grid {
      grid-template-columns: 1fr;
    }

    .selection-list {
      max-height: 310px;
    }
  }
</style>
