<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { Copy, KeyRound, ShieldCheck, Trash2 } from '@lucide/svelte';
  import { api, errorMessage } from '$lib/api/client';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Badge from '$lib/components/Badge.svelte';
  import OAuthClientManager from '$lib/components/OAuthClientManager.svelte';
  import { session } from '$lib/stores/session.svelte';

  type SessionSummary = import('$lib/api/schema').components['schemas']['SessionSummaryResponse'];
  type Enrollment = import('$lib/api/schema').components['schemas']['TotpEnrollmentResponse'];
  type ApiToken = import('$lib/api/schema').components['schemas']['ApiTokenResponse'];
  type CreatedApiToken = import('$lib/api/schema').components['schemas']['CreatedApiTokenResponse'];
  type EventSummary = import('$lib/api/schema').components['schemas']['EventResponse'];

  let enrollment = $state<Enrollment | null>(null);
  let confirmationCode = $state('');
  let recoveryCodes = $state<string[]>([]);
  let sessions = $state<SessionSummary[]>([]);
  let apiTokens = $state<ApiToken[]>([]);
  let availableEvents = $state<EventSummary[]>([]);
  let tokenName = $state('');
  let tokenExpiryDays = $state(30);
  let selectedScopes = $state<string[]>([]);
  let selectedEventIds = $state<string[]>([]);
  let createdToken = $state<CreatedApiToken | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let availableScopes = $derived.by(() =>
    [...(session.current?.permissions ?? [])].sort((left, right) => left.localeCompare(right))
  );

  onMount(async () => {
    await session.bootstrap();
    if (!session.authenticated) {
      await goto('/login');
      return;
    }
    await Promise.all([loadSessions(), loadApiTokens(), loadEvents()]);
  });

  async function loadSessions() {
    const result = await api.GET('/api/v1/auth/sessions');
    if (result.data) {
      sessions = result.data;
    }
  }

  async function loadApiTokens() {
    const result = await api.GET('/api/v1/auth/tokens');
    if (result.data) {
      apiTokens = result.data;
    }
  }

  async function loadEvents() {
    if (!session.can('event_read')) {
      return;
    }
    const result = await api.GET('/api/v1/events');
    if (result.data) {
      availableEvents = result.data;
    }
  }

  async function startTotp() {
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return;
    }
    busy = true;
    error = null;
    const result = await api.POST('/api/v1/auth/mfa/totp/start', {
      headers: { 'x-csrf-token': csrf }
    });
    busy = false;
    if (result.data) {
      enrollment = result.data;
    } else {
      error = errorMessage(result.error, 'MFA setup could not start.');
    }
  }

  async function confirmTotp(event: SubmitEvent) {
    event.preventDefault();
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return;
    }
    busy = true;
    error = null;
    const result = await api.POST('/api/v1/auth/mfa/totp/confirm', {
      headers: { 'x-csrf-token': csrf },
      body: { code: confirmationCode }
    });
    busy = false;
    if (result.data) {
      recoveryCodes = result.data.codes;
      enrollment = null;
    } else {
      error = errorMessage(result.error, 'The authenticator code did not match.');
    }
  }

  async function revoke(id: string) {
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return;
    }
    const result = await api.DELETE('/api/v1/auth/sessions/{session_id}', {
      params: { path: { session_id: id } },
      headers: { 'x-csrf-token': csrf }
    });
    if (result.response.ok) {
      const wasCurrent = sessions.find((item) => item.id === id)?.current;
      if (wasCurrent) {
        session.current = null;
        await goto('/login');
      } else {
        await loadSessions();
      }
    }
  }

  async function createApiToken(event: SubmitEvent) {
    event.preventDefault();
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return;
    }
    busy = true;
    error = null;
    createdToken = null;
    const result = await api.POST('/api/v1/auth/tokens', {
      headers: { 'x-csrf-token': csrf },
      body: {
        name: tokenName,
        scopes: selectedScopes,
        event_ids: selectedEventIds,
        expires_in_days: tokenExpiryDays
      }
    });
    busy = false;
    if (result.data) {
      createdToken = result.data;
      tokenName = '';
      selectedScopes = [];
      selectedEventIds = [];
      tokenExpiryDays = 30;
      await loadApiTokens();
    } else {
      error = errorMessage(result.error, 'The API token could not be created.');
    }
  }

  async function revokeApiToken(id: string) {
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return;
    }
    error = null;
    const result = await api.DELETE('/api/v1/auth/tokens/{token_id}', {
      params: { path: { token_id: id } },
      headers: { 'x-csrf-token': csrf }
    });
    if (result.response.ok) {
      await loadApiTokens();
    } else {
      error = errorMessage(result.error, 'The API token could not be revoked.');
    }
  }

  async function copyCodes() {
    await navigator.clipboard.writeText(recoveryCodes.join('\n'));
  }

  async function copyApiToken() {
    if (createdToken) {
      await navigator.clipboard.writeText(createdToken.token);
    }
  }

  function describeSession(item: SessionSummary): string {
    const lastSeen = new Date(item.last_seen_at).toLocaleString();
    const expires = new Date(item.expires_at).toLocaleString();
    return `Last active ${lastSeen} · Expires ${expires}`;
  }

  function scopeLabel(scope: string): string {
    return scope.replaceAll('_', ' ');
  }

  function describeApiToken(item: ApiToken): string {
    const lastUsed = item.last_used_at
      ? `Last used ${new Date(item.last_used_at).toLocaleString()}`
      : 'Never used';
    return `${lastUsed} · Expires ${new Date(item.expires_at).toLocaleString()}`;
  }
</script>

<svelte:head>
  <title>Account security — Kitsune</title>
</svelte:head>
<section class="page page-narrow security">
  <div>
    <p class="eyebrow">Account security</p>
    <h1 class="title">Guard your trail.</h1>
    <p class="lede">Add an authenticator and inspect every active session.</p>
  </div>
  {#if error}
    <p class="error-text" role="alert">{error}</p>
  {/if}

  <Card elevated>
    <div class="section-head">
      <div>
        <h2>Authenticator app</h2>
        <p>TOTP codes use a 30-second window and cannot be replayed.</p>
      </div>
      <Badge tone={recoveryCodes.length ? 'success' : 'neutral'}>
        {recoveryCodes.length ? 'Enabled' : 'Optional'}
      </Badge>
    </div>
    {#if recoveryCodes.length}
      <div class="codes">
        <div>
          <strong>Store these recovery codes now.</strong>
          <span>Each works once. They will not be shown again.</span>
        </div>
        <pre>{recoveryCodes.join('\n')}</pre>
        <Button variant="secondary" onclick={copyCodes}>
          <Copy size={15} />
          Copy codes
        </Button>
      </div>
    {:else if enrollment}
      <div class="enroll">
        <p>Scan this provisioning URI with your authenticator or enter the secret manually.</p>
        <code>{enrollment.secret}</code>
        <details>
          <summary>Show provisioning URI</summary>
          <code>{enrollment.provisioning_uri}</code>
        </details>
        <form class="totp-form" onsubmit={confirmTotp}>
          <label class="field">
            <span>Current six-digit code</span>
            <input
              bind:value={confirmationCode}
              inputmode="numeric"
              autocomplete="one-time-code"
              required
            />
          </label>
          <Button type="submit" loading={busy}>
            <ShieldCheck size={16} />
            Confirm and enable
          </Button>
        </form>
      </div>
    {:else}
      <Button onclick={startTotp} loading={busy}>
        <KeyRound size={16} />
        Set up authenticator
      </Button>
    {/if}
  </Card>

  <OAuthClientManager {availableEvents} {availableScopes} />

  <Card>
    <div class="section-head">
      <div>
        <h2>API tokens</h2>
        <p>Create expiring, revocable credentials for scripts and integrations.</p>
      </div>
      <Badge tone="accent">PASETO v4</Badge>
    </div>

    {#if createdToken}
      <div class="token-created" role="status">
        <div>
          <strong>Copy this token now.</strong>
          <span>Kitsune stores only its digest. This value cannot be shown again.</span>
        </div>
        <textarea readonly rows="3" aria-label="New API token" value={createdToken.token}
        ></textarea>
        <Button variant="secondary" onclick={copyApiToken}>
          <Copy size={15} />
          Copy token
        </Button>
      </div>
    {/if}

    <form class="token-form" onsubmit={createApiToken}>
      <div class="token-basics">
        <label class="field">
          <span>Token name</span>
          <input bind:value={tokenName} maxlength="80" placeholder="Scoreboard exporter" required />
        </label>
        <label class="field">
          <span>Expires after</span>
          <select bind:value={tokenExpiryDays}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>1 year</option>
          </select>
        </label>
      </div>

      <fieldset>
        <legend>Permissions</legend>
        <p>A token can never exceed your live role permissions.</p>
        <div class="choice-grid">
          {#each availableScopes as scope (scope)}
            <label class="choice">
              <input type="checkbox" value={scope} bind:group={selectedScopes} />
              <span>{scopeLabel(scope)}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#if availableEvents.length}
        <fieldset>
          <legend>Event boundary</legend>
          <p>Leave every event clear for organization-wide access.</p>
          <div class="choice-grid">
            {#each availableEvents as event (event.id)}
              <label class="choice">
                <input type="checkbox" value={event.id} bind:group={selectedEventIds} />
                <span>{event.name}</span>
              </label>
            {/each}
          </div>
        </fieldset>
      {/if}

      <div class="token-submit">
        <p>Complete token values appear once. Expiry is mandatory.</p>
        <Button type="submit" loading={busy} disabled={!tokenName.trim() || !selectedScopes.length}>
          <KeyRound size={16} />
          Create API token
        </Button>
      </div>
    </form>

    <div class="tokens" aria-label="API tokens">
      {#each apiTokens as item (item.id)}
        <article>
          <div class="token-details">
            <div class="token-title">
              <strong>{item.name}</strong>
              <Badge tone={item.revoked_at ? 'neutral' : 'success'}>
                {item.revoked_at ? 'Revoked' : 'Active'}
              </Badge>
            </div>
            <span>{describeApiToken(item)}</span>
            <div class="scope-list" aria-label="Token permissions">
              {#each item.scopes as scope (scope)}
                <span>{scopeLabel(scope)}</span>
              {/each}
              {#if item.event_ids.length}
                <span>{item.event_ids.length} event{item.event_ids.length === 1 ? '' : 's'}</span>
              {:else}
                <span>organization-wide</span>
              {/if}
            </div>
          </div>
          {#if !item.revoked_at}
            <Button
              variant="danger"
              ariaLabel={`Revoke ${item.name}`}
              onclick={() => revokeApiToken(item.id)}
            >
              <Trash2 size={16} />
              Revoke
            </Button>
          {/if}
        </article>
      {:else}
        <p class="muted">No API tokens yet.</p>
      {/each}
    </div>
  </Card>

  <Card>
    <div class="section-head">
      <div>
        <h2>Active sessions</h2>
        <p>Revoke any login you no longer recognize.</p>
      </div>
    </div>
    <div class="sessions">
      {#each sessions as item (item.id)}
        <article>
          <div>
            <strong>{item.current ? 'This session' : 'Kitsune session'}</strong>
            <span>{describeSession(item)}</span>
          </div>
          <Button variant="quiet" ariaLabel="Revoke session" onclick={() => revoke(item.id)}>
            <Trash2 size={16} />
          </Button>
        </article>
      {:else}
        <p class="muted">No active sessions.</p>
      {/each}
    </div>
  </Card>
</section>

<style>
  .security {
    display: grid;
    gap: 1rem;
  }
  .security > div:first-child {
    margin-bottom: 0.5rem;
  }
  .section-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  h2 {
    margin: 0;
    font-size: 1rem;
  }
  .section-head p,
  .enroll > p {
    margin: 0.35rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.78rem;
    line-height: 1.5;
  }
  .enroll,
  .codes {
    display: grid;
    gap: 1rem;
  }
  code,
  pre {
    overflow-wrap: anywhere;
    padding: 0.7rem;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    font-family: var(--font-mono);
    font-size: 0.76rem;
  }
  details code {
    display: block;
    margin-top: 0.6rem;
  }
  summary {
    cursor: pointer;
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }
  .totp-form {
    display: flex;
    align-items: end;
    gap: 0.7rem;
  }
  .totp-form .field {
    flex: 1;
  }
  .codes > div {
    display: grid;
    gap: 0.25rem;
  }
  .codes span {
    color: var(--ink-secondary);
    font-size: 0.76rem;
  }
  pre {
    margin: 0;
    line-height: 1.7;
  }
  .token-created {
    display: grid;
    gap: 0.8rem;
    margin-bottom: 1rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--success) 8%, var(--surface-raised));
  }
  .token-created > div {
    display: grid;
    gap: 0.25rem;
  }
  .token-created span,
  .token-submit p,
  fieldset > p {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 0.76rem;
    line-height: 1.5;
  }
  .token-created textarea {
    width: 100%;
    max-height: 8rem;
    overflow: auto;
    padding: 0.7rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 0.76rem;
    resize: none;
    user-select: all;
  }
  .token-created :global(.button) {
    justify-self: start;
  }
  .token-form {
    display: grid;
    gap: 1rem;
    padding-block: 0.5rem 1rem;
  }
  .token-basics {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(9rem, 1fr);
    gap: 0.8rem;
  }
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: 0.25rem;
    padding: 0;
    font-size: 0.82rem;
    font-weight: 680;
  }
  .choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    margin-top: 0.65rem;
  }
  .choice {
    display: flex;
    min-height: 2.5rem;
    align-items: center;
    gap: 0.55rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    cursor: pointer;
  }
  .choice:has(input:checked) {
    border-color: color-mix(in srgb, var(--accent) 42%, transparent);
    background: var(--accent-soft);
  }
  .choice input {
    width: 1rem;
    height: 1rem;
    margin: 0;
    accent-color: var(--accent);
  }
  .choice span {
    overflow: hidden;
    font-size: 0.76rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .token-submit {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .tokens {
    display: grid;
    border-top: 1px solid var(--line);
  }
  .tokens article {
    display: flex;
    min-height: 5.5rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.9rem;
    border-bottom: 1px solid var(--line);
  }
  .token-details {
    display: grid;
    min-width: 0;
    gap: 0.35rem;
  }
  .token-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.55rem;
  }
  .token-title strong {
    font-size: 0.84rem;
  }
  .token-details > span {
    color: var(--ink-secondary);
    font-size: 0.7rem;
  }
  .scope-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .scope-list span {
    padding: 0.18rem 0.38rem;
    border-radius: 999px;
    background: var(--surface-muted);
    color: var(--ink-secondary);
    font-family: var(--font-mono);
    font-size: 0.64rem;
  }
  .sessions {
    display: grid;
  }
  .sessions article {
    display: flex;
    min-height: 4.2rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-top: 1px solid var(--line);
  }
  .sessions article:first-child {
    border-top: 0;
  }
  .sessions article > div {
    display: grid;
    gap: 0.25rem;
  }
  .sessions strong {
    font-size: 0.82rem;
  }
  .sessions span {
    color: var(--ink-secondary);
    font-size: 0.7rem;
  }
  @media (max-width: 560px) {
    .totp-form,
    .token-submit,
    .tokens article {
      align-items: stretch;
      flex-direction: column;
    }
    .token-basics,
    .choice-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
