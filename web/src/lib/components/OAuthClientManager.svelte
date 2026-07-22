<script lang="ts">
  import { onMount } from 'svelte';
  import { Copy, KeyRound, Trash2 } from '@lucide/svelte';
  import { api, errorMessage } from '$lib/api/client';
  import { session } from '$lib/stores/session.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';

  type EventSummary = import('$lib/api/schema').components['schemas']['EventResponse'];
  type OAuthClient = import('$lib/api/schema').components['schemas']['OAuthClientResponse'];
  type CreatedOAuthClient =
    import('$lib/api/schema').components['schemas']['CreatedOAuthClientResponse'];

  let {
    availableEvents,
    availableScopes
  }: {
    availableEvents: EventSummary[];
    availableScopes: string[];
  } = $props();

  let clients = $state<OAuthClient[]>([]);
  let clientName = $state('');
  let selectedScopes = $state<string[]>([]);
  let selectedEventIds = $state<string[]>([]);
  let createdClient = $state<CreatedOAuthClient | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  onMount(async () => {
    await session.bootstrap();
    if (session.authenticated) {
      await loadClients();
    }
  });

  async function loadClients() {
    const result = await api.GET('/api/v1/auth/oauth-clients');
    if (result.data) {
      clients = result.data;
    } else {
      error = errorMessage(result.error, 'OAuth clients could not be loaded.');
    }
  }

  async function createClient(event: SubmitEvent) {
    event.preventDefault();
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return;
    }

    busy = true;
    error = null;
    createdClient = null;
    const result = await api.POST('/api/v1/auth/oauth-clients', {
      headers: { 'x-csrf-token': csrf },
      body: {
        name: clientName,
        scopes: selectedScopes,
        event_ids: selectedEventIds
      }
    });
    busy = false;

    if (result.data) {
      createdClient = result.data;
      clientName = '';
      selectedScopes = [];
      selectedEventIds = [];
      await loadClients();
      return;
    }
    error = errorMessage(result.error, 'The OAuth client could not be created.');
  }

  async function revokeClient(client: OAuthClient) {
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return;
    }

    error = null;
    const result = await api.DELETE('/api/v1/auth/oauth-clients/{client_id}', {
      params: { path: { client_id: client.id } },
      headers: { 'x-csrf-token': csrf }
    });
    if (result.response.ok) {
      await loadClients();
    } else {
      error = errorMessage(result.error, 'The OAuth client could not be revoked.');
    }
  }

  async function copyCredential(value: string) {
    await navigator.clipboard.writeText(value);
  }

  function scopeLabel(scope: string): string {
    return scope.replaceAll('_', ' ');
  }

  function describeClient(client: OAuthClient): string {
    const lastUsed = client.last_used_at
      ? `Last exchanged ${new Date(client.last_used_at).toLocaleString()}`
      : 'Never exchanged';
    return `${lastUsed} · Created ${new Date(client.created_at).toLocaleDateString()}`;
  }
</script>

<Card>
  <div class="section-head">
    <div>
      <h2>OAuth2 clients</h2>
      <p>Give services short-lived access without sharing a person’s token.</p>
    </div>
    <Badge tone="accent">15-minute access</Badge>
  </div>

  {#if error}
    <p class="error-text" role="alert">{error}</p>
  {/if}

  <div class="endpoint-note">
    <span>Token endpoint</span>
    <code>POST /oauth/token</code>
    <p>Authenticate with HTTP Basic and send grant_type=client_credentials as form data.</p>
  </div>

  {#if createdClient}
    <div class="credential-created" role="status">
      <div>
        <strong>Copy this client secret now.</strong>
        <span>Kitsune stores only its digest. The secret cannot be shown again.</span>
      </div>
      <label>
        <span>Client ID</span>
        <input readonly aria-label="New OAuth client ID" value={createdClient.client_id} />
      </label>
      <label>
        <span>Client secret</span>
        <textarea
          readonly
          rows="2"
          aria-label="New OAuth client secret"
          value={createdClient.client_secret}></textarea>
      </label>
      <div class="copy-actions">
        <Button variant="secondary" onclick={() => copyCredential(createdClient?.client_id ?? '')}>
          <Copy size={15} />
          Copy client ID
        </Button>
        <Button
          variant="secondary"
          onclick={() => copyCredential(createdClient?.client_secret ?? '')}
        >
          <Copy size={15} />
          Copy secret
        </Button>
      </div>
    </div>
  {/if}

  <form class="client-form" onsubmit={createClient}>
    <label class="field">
      <span>Client name</span>
      <input
        bind:value={clientName}
        maxlength="80"
        placeholder="Grafana scoreboard connector"
        required
      />
    </label>

    <fieldset>
      <legend>Maximum permissions</legend>
      <p>Each token exchange may request a narrower subset. Live role access still applies.</p>
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

    <div class="client-submit">
      <p>Client secrets appear once. Access tokens expire after 15 minutes.</p>
      <Button type="submit" loading={busy} disabled={!clientName.trim() || !selectedScopes.length}>
        <KeyRound size={16} />
        Create OAuth client
      </Button>
    </div>
  </form>

  <div class="clients" aria-label="OAuth clients">
    {#each clients as client (client.id)}
      <article>
        <div class="client-details">
          <div class="client-title">
            <strong>{client.name}</strong>
            <Badge tone={client.revoked_at ? 'neutral' : 'success'}>
              {client.revoked_at ? 'Revoked' : 'Active'}
            </Badge>
          </div>
          <code>{client.client_id}</code>
          <span>{describeClient(client)}</span>
          <div class="scope-list" aria-label={`${client.name} permissions`}>
            {#each client.scopes as scope (scope)}
              <span>{scopeLabel(scope)}</span>
            {/each}
            {#if client.event_ids.length}
              <span>{client.event_ids.length} event{client.event_ids.length === 1 ? '' : 's'}</span>
            {:else}
              <span>organization-wide</span>
            {/if}
          </div>
        </div>
        {#if !client.revoked_at}
          <Button
            variant="danger"
            ariaLabel={`Revoke ${client.name}`}
            onclick={() => revokeClient(client)}
          >
            <Trash2 size={16} />
            Revoke
          </Button>
        {/if}
      </article>
    {:else}
      <p class="muted">No OAuth clients yet.</p>
    {/each}
  </div>
</Card>

<style>
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
  fieldset > p,
  .client-submit p,
  .endpoint-note p {
    margin: 0.35rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.76rem;
    line-height: 1.5;
  }
  .endpoint-note {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.7rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    font-size: 0.74rem;
  }
  .endpoint-note > span {
    color: var(--ink-secondary);
  }
  .endpoint-note code {
    color: var(--ink);
    font-family: var(--font-mono);
  }
  .endpoint-note p {
    grid-column: 1 / -1;
  }
  .credential-created {
    display: grid;
    gap: 0.8rem;
    margin-bottom: 1rem;
    padding: 1rem;
    border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--success) 8%, var(--surface-raised));
  }
  .credential-created > div:first-child,
  .credential-created label {
    display: grid;
    gap: 0.25rem;
  }
  .credential-created span {
    color: var(--ink-secondary);
    font-size: 0.76rem;
  }
  .credential-created input,
  .credential-created textarea {
    width: 100%;
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
  .copy-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .client-form {
    display: grid;
    gap: 1rem;
    padding-block: 0.5rem 1rem;
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
  .client-submit {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .clients {
    display: grid;
    border-top: 1px solid var(--line);
  }
  .clients article {
    display: flex;
    min-height: 6rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.9rem;
    border-bottom: 1px solid var(--line);
  }
  .client-details {
    display: grid;
    min-width: 0;
    gap: 0.35rem;
  }
  .client-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.55rem;
  }
  .client-title strong {
    font-size: 0.84rem;
  }
  .client-details > code,
  .client-details > span {
    overflow: hidden;
    color: var(--ink-secondary);
    font-size: 0.7rem;
    text-overflow: ellipsis;
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
  @media (max-width: 560px) {
    .section-head,
    .client-submit,
    .clients article {
      align-items: stretch;
      flex-direction: column;
    }
    .choice-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
