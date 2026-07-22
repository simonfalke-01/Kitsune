<script lang="ts">
  import { Check, KeyRound, Pencil, Plus, Radio, ShieldCheck, X } from '@lucide/svelte';
  import {
    api,
    errorMessage,
    type CreateOidcProviderInput,
    type OidcProvider,
    type UpdateOidcProviderInput
  } from '$lib/api/client';
  import { session } from '$lib/stores/session.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import Toggle from './Toggle.svelte';

  type Draft = CreateOidcProviderInput & { id?: string };

  let providers = $state<OidcProvider[]>([]);
  let loading = $state(true);
  let available = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let editing = $state(false);
  let draft = $state<Draft>(emptyDraft());

  $effect(() => {
    if (session.current?.permissions.includes('identity_manage')) {
      void load();
    } else {
      loading = false;
    }
  });

  function emptyDraft(): Draft {
    return {
      key: '',
      display_name: '',
      issuer_url: '',
      client_id: '',
      client_secret: '',
      enabled: true,
      auto_provision: true,
      allow_email_link: false
    };
  }

  async function load() {
    loading = true;
    error = null;
    const result = await api.GET('/api/v1/auth/oidc/providers');
    if (result.data) {
      available = true;
      providers = result.data;
    } else if (result.response.status === 404) {
      available = false;
    } else {
      error = errorMessage(result.error, 'Identity providers could not be loaded.');
    }
    loading = false;
  }

  function beginCreate() {
    draft = emptyDraft();
    editing = true;
    error = null;
  }

  function beginEdit(provider: OidcProvider) {
    draft = {
      id: provider.id,
      key: provider.key,
      display_name: provider.display_name,
      issuer_url: provider.issuer_url,
      client_id: provider.client_id,
      client_secret: '',
      enabled: provider.enabled,
      auto_provision: provider.auto_provision,
      allow_email_link: provider.allow_email_link
    };
    editing = true;
    error = null;
  }

  function cancelEdit() {
    editing = false;
    draft = emptyDraft();
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      error = 'Your organizer session expired. Sign in again before saving.';
      return;
    }
    saving = true;
    error = null;
    if (draft.id) {
      const body: UpdateOidcProviderInput = {
        display_name: draft.display_name,
        issuer_url: draft.issuer_url,
        client_id: draft.client_id,
        client_secret: draft.client_secret || undefined,
        enabled: draft.enabled,
        auto_provision: draft.auto_provision,
        allow_email_link: draft.allow_email_link
      };
      const result = await api.PUT('/api/v1/auth/oidc/providers/{provider_id}', {
        params: { path: { provider_id: draft.id } },
        headers: { 'x-csrf-token': csrf },
        body
      });
      if (!result.data) {
        error = errorMessage(result.error, 'The identity provider could not be updated.');
        saving = false;
        return;
      }
    } else {
      const result = await api.POST('/api/v1/auth/oidc/providers', {
        headers: { 'x-csrf-token': csrf },
        body: {
          key: draft.key,
          display_name: draft.display_name,
          issuer_url: draft.issuer_url,
          client_id: draft.client_id,
          client_secret: draft.client_secret,
          enabled: draft.enabled,
          auto_provision: draft.auto_provision,
          allow_email_link: draft.allow_email_link
        }
      });
      if (!result.data) {
        error = errorMessage(result.error, 'The identity provider could not be created.');
        saving = false;
        return;
      }
    }
    await load();
    saving = false;
    cancelEdit();
  }
</script>

{#if available}
  <Card>
    <div class="section-head">
      <div>
        <h2>OpenID Connect</h2>
        <p>Authorization Code + PKCE, with provider secrets encrypted at rest.</p>
      </div>
      <Button variant="secondary" onclick={beginCreate}>
        <Plus size={14} />
        Add provider
      </Button>
    </div>

    {#if error}
      <p class="error-text" role="alert">{error}</p>
    {/if}

    {#if editing}
      <form onsubmit={save}>
        <div class="form-heading">
          <div>
            <strong>{draft.id ? 'Edit identity provider' : 'Connect an identity provider'}</strong>
            <span>Use the exact issuer shown in your provider's discovery document.</span>
          </div>
          <button
            type="button"
            class="icon-button"
            onclick={cancelEdit}
            aria-label="Close provider form"
          >
            <X size={16} />
          </button>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>Login label</span>
            <input
              bind:value={draft.display_name}
              required
              maxlength="80"
              placeholder="Company SSO"
            />
          </label>
          <label class="field">
            <span>Provider key</span>
            <input
              bind:value={draft.key}
              required
              maxlength="63"
              pattern="[a-z0-9][a-z0-9-]*"
              placeholder="company-sso"
              disabled={Boolean(draft.id)}
            />
          </label>
          <label class="field wide">
            <span>Issuer URL</span>
            <input
              bind:value={draft.issuer_url}
              type="url"
              required
              placeholder="https://identity.example.com"
            />
          </label>
          <label class="field">
            <span>Client ID</span>
            <input bind:value={draft.client_id} required maxlength="512" autocomplete="off" />
          </label>
          <label class="field">
            <span>{draft.id ? 'Rotate client secret' : 'Client secret'}</span>
            <input
              bind:value={draft.client_secret}
              type="password"
              required={!draft.id}
              minlength="16"
              maxlength="2048"
              autocomplete="new-password"
              placeholder={draft.id ? 'Leave empty to keep the current secret' : ''}
            />
          </label>
        </div>
        <div class="policy-list">
          <Toggle
            bind:checked={draft.enabled}
            label="Available for sign-in"
            description="Show this provider only while external authentication is enabled."
          />
          <Toggle
            bind:checked={draft.auto_provision}
            label="Create players on first sign-in"
            description="New verified identities receive the canonical player role automatically."
          />
          <Toggle
            bind:checked={draft.allow_email_link}
            label="Link matching verified email"
            description="Off by default. Enable only when this provider is authoritative for existing account email addresses."
          />
        </div>
        <div class="form-actions">
          <Button variant="quiet" onclick={cancelEdit}>Cancel</Button>
          <Button type="submit" loading={saving}>
            <Check size={14} />
            {draft.id ? 'Save provider' : 'Add provider'}
          </Button>
        </div>
      </form>
    {/if}

    {#if loading}
      <p class="status" role="status">Loading identity providers…</p>
    {:else if providers.length}
      <div class="provider-list">
        {#each providers as provider (provider.id)}
          <article>
            <div class="provider-icon" aria-hidden="true">
              <Radio size={17} />
            </div>
            <div class="provider-copy">
              <div class="provider-name">
                <strong>{provider.display_name}</strong>
                <Badge tone={provider.enabled ? 'success' : 'neutral'}>
                  {provider.enabled ? 'Active' : 'Hidden'}
                </Badge>
              </div>
              <span>{provider.issuer_url}</span>
              <code>{provider.redirect_uri}</code>
              <div class="policies">
                <span>
                  <ShieldCheck size={12} />
                  {provider.auto_provision ? 'Auto-provision' : 'Invite only'}
                </span>
                <span>
                  <KeyRound size={12} />
                  {provider.allow_email_link ? 'Email linking on' : 'No implicit linking'}
                </span>
              </div>
            </div>
            <button
              type="button"
              class="edit-button"
              onclick={() => beginEdit(provider)}
              aria-label={`Edit ${provider.display_name}`}
            >
              <Pencil size={14} />
              Edit
            </button>
          </article>
        {/each}
      </div>
    {:else}
      <div class="empty-provider">
        <Radio size={18} />
        <div>
          <strong>No external identity providers</strong>
          <span>Local accounts remain available with no setup.</span>
        </div>
      </div>
    {/if}
  </Card>
{/if}

<style>
  .section-head,
  .form-heading,
  .provider-name,
  .form-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .section-head {
    align-items: start;
    margin-bottom: 1.1rem;
  }
  h2,
  .section-head p {
    margin: 0;
  }
  h2 {
    font-size: 1rem;
  }
  .section-head p,
  .form-heading span {
    margin-top: 0.35rem;
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }
  form {
    display: grid;
    gap: 1rem;
    margin-bottom: 1.1rem;
    padding: 1rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: var(--surface-muted);
  }
  .form-heading > div {
    display: grid;
  }
  .icon-button,
  .edit-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink-secondary);
  }
  .icon-button {
    width: 2rem;
    height: 2rem;
  }
  .field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .policy-list {
    display: grid;
    gap: 0.85rem;
    padding: 0.9rem 0;
    border-block: 1px solid var(--line);
  }
  .form-actions {
    justify-content: end;
  }
  .provider-list {
    display: grid;
    gap: 0.6rem;
  }
  article {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.8rem;
    padding: 0.9rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-muted);
  }
  .provider-icon {
    display: grid;
    width: 2.35rem;
    height: 2.35rem;
    place-items: center;
    border-radius: 0.7rem;
    background: var(--accent-soft);
    color: var(--accent);
  }
  .provider-copy {
    display: grid;
    min-width: 0;
    gap: 0.35rem;
  }
  .provider-name {
    justify-content: start;
  }
  .provider-copy > span,
  .provider-copy code {
    overflow: hidden;
    color: var(--ink-secondary);
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .provider-copy code {
    color: var(--ink-faint);
    font-family: var(--font-mono);
  }
  .policies {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-top: 0.25rem;
  }
  .policies span {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--ink-faint);
    font-size: 0.68rem;
  }
  .edit-button {
    min-height: 2rem;
    padding-inline: 0.7rem;
    font-size: 0.72rem;
  }
  .empty-provider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius-md);
    color: var(--ink-faint);
  }
  .empty-provider div {
    display: grid;
    gap: 0.15rem;
  }
  .empty-provider strong {
    color: var(--ink-secondary);
    font-size: 0.8rem;
  }
  .empty-provider span {
    font-size: 0.72rem;
  }
  .status {
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }
  @media (max-width: 680px) {
    .section-head {
      display: grid;
    }
    .field-grid {
      grid-template-columns: 1fr;
    }
    .wide {
      grid-column: auto;
    }
    article {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .edit-button {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
