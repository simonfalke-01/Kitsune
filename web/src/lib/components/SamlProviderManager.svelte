<script lang="ts">
  import {
    Check,
    Copy,
    FileKey,
    KeyRound,
    Link,
    Pencil,
    Plus,
    ShieldCheck,
    X
  } from '@lucide/svelte';
  import {
    api,
    errorMessage,
    type CreateSamlProviderInput,
    type SamlProvider,
    type UpdateSamlProviderInput
  } from '$lib/api/client';
  import { session } from '$lib/stores/session.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import Toggle from './Toggle.svelte';

  type MetadataSource = 'paste' | 'url' | 'retain';

  type Draft = {
    id?: string;
    key: string;
    display_name: string;
    metadata_source: MetadataSource;
    metadata_xml: string;
    metadata_url: string;
    metadata_signing_certificate: string;
    email_attribute: string;
    display_name_attribute: string;
    enabled: boolean;
    auto_provision: boolean;
    allow_email_link: boolean;
  };

  let providers = $state<SamlProvider[]>([]);
  let loading = $state(true);
  let available = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
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
      metadata_source: 'paste',
      metadata_xml: '',
      metadata_url: '',
      metadata_signing_certificate: '',
      email_attribute: '',
      display_name_attribute: '',
      enabled: true,
      auto_provision: true,
      allow_email_link: false
    };
  }

  async function load() {
    loading = true;
    error = null;
    const result = await api.GET('/api/v1/auth/saml/providers');
    if (result.data) {
      available = true;
      providers = result.data;
    } else if (result.response.status === 404) {
      available = false;
    } else {
      error = errorMessage(result.error, 'SAML providers could not be loaded.');
    }
    loading = false;
  }

  function beginCreate() {
    draft = emptyDraft();
    editing = true;
    error = null;
    notice = null;
  }

  function beginEdit(provider: SamlProvider) {
    draft = {
      id: provider.id,
      key: provider.key,
      display_name: provider.display_name,
      metadata_source: 'retain',
      metadata_xml: '',
      metadata_url: provider.metadata_url ?? '',
      metadata_signing_certificate: '',
      email_attribute: provider.email_attribute ?? '',
      display_name_attribute: provider.display_name_attribute ?? '',
      enabled: provider.enabled,
      auto_provision: provider.auto_provision,
      allow_email_link: provider.allow_email_link
    };
    editing = true;
    error = null;
    notice = null;
  }

  function cancelEdit() {
    editing = false;
    draft = emptyDraft();
  }

  function metadataFields() {
    if (draft.metadata_source === 'paste') {
      return {
        metadata_xml: draft.metadata_xml,
        metadata_url: undefined
      };
    }
    if (draft.metadata_source === 'url') {
      return {
        metadata_xml: undefined,
        metadata_url: draft.metadata_url
      };
    }
    return {
      metadata_xml: undefined,
      metadata_url: undefined
    };
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
    notice = null;
    const metadata = metadataFields();
    if (draft.id) {
      const body: UpdateSamlProviderInput = {
        display_name: draft.display_name,
        ...metadata,
        metadata_signing_certificate:
          draft.metadata_source === 'retain'
            ? undefined
            : draft.metadata_signing_certificate || undefined,
        email_attribute: draft.email_attribute || undefined,
        display_name_attribute: draft.display_name_attribute || undefined,
        enabled: draft.enabled,
        auto_provision: draft.auto_provision,
        allow_email_link: draft.allow_email_link
      };
      const result = await api.PUT('/api/v1/auth/saml/providers/{provider_id}', {
        params: { path: { provider_id: draft.id } },
        headers: { 'x-csrf-token': csrf },
        body
      });
      if (!result.data) {
        error = errorMessage(result.error, 'The SAML provider could not be updated.');
        saving = false;
        return;
      }
    } else {
      const body: CreateSamlProviderInput = {
        key: draft.key,
        display_name: draft.display_name,
        ...metadata,
        metadata_signing_certificate: draft.metadata_signing_certificate || undefined,
        email_attribute: draft.email_attribute || undefined,
        display_name_attribute: draft.display_name_attribute || undefined,
        enabled: draft.enabled,
        auto_provision: draft.auto_provision,
        allow_email_link: draft.allow_email_link
      };
      const result = await api.POST('/api/v1/auth/saml/providers', {
        headers: { 'x-csrf-token': csrf },
        body
      });
      if (!result.data) {
        error = errorMessage(result.error, 'The SAML provider could not be created.');
        saving = false;
        return;
      }
    }
    await load();
    saving = false;
    cancelEdit();
  }

  async function copyEndpoint(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notice = `${label} copied.`;
    } catch {
      notice = `Copy ${label.toLowerCase()} manually from the field below.`;
    }
  }
</script>

{#if available}
  <Card>
    <div class="section-head">
      <div>
        <h2>SAML 2.0</h2>
        <p>Signed assertions, correlated browser flows, and stable SP metadata.</p>
      </div>
      <Button variant="secondary" onclick={beginCreate}>
        <Plus size={14} />
        Add provider
      </Button>
    </div>

    {#if error}
      <p class="error-text" role="alert">{error}</p>
    {/if}
    {#if notice}
      <p class="notice" role="status">{notice}</p>
    {/if}

    {#if editing}
      <form onsubmit={save}>
        <div class="form-heading">
          <div>
            <strong>{draft.id ? 'Edit SAML provider' : 'Connect a SAML provider'}</strong>
            <span>
              Kitsune derives its entity ID and assertion endpoint from the public origin.
            </span>
          </div>
          <button
            type="button"
            class="icon-button"
            onclick={cancelEdit}
            aria-label="Close SAML provider form"
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
              placeholder="Company SAML"
            />
          </label>
          <label class="field">
            <span>Provider key</span>
            <input
              bind:value={draft.key}
              required
              maxlength="63"
              pattern="[a-z0-9][a-z0-9-]*"
              placeholder="company-saml"
              disabled={Boolean(draft.id)}
            />
          </label>
        </div>

        <fieldset class="source-choice">
          <legend>Identity-provider metadata</legend>
          {#if draft.id}
            <label>
              <input bind:group={draft.metadata_source} type="radio" value="retain" />
              <span>
                <strong>Keep current</strong>
                <small>Update policy without rotating trusted metadata.</small>
              </span>
            </label>
          {/if}
          <label>
            <input bind:group={draft.metadata_source} type="radio" value="paste" />
            <span>
              <strong>Paste XML</strong>
              <small>Best for immutable, operator-reviewed metadata.</small>
            </span>
          </label>
          <label>
            <input bind:group={draft.metadata_source} type="radio" value="url" />
            <span>
              <strong>Fetch URL</strong>
              <small>Fetched once through DNS-pinned SSRF protection.</small>
            </span>
          </label>
        </fieldset>

        {#if draft.metadata_source === 'paste'}
          <label class="field">
            <span>Metadata XML</span>
            <textarea
              bind:value={draft.metadata_xml}
              required
              rows="8"
              spellcheck="false"
              placeholder="&lt;EntityDescriptor …&gt;"></textarea>
          </label>
        {:else if draft.metadata_source === 'url'}
          <label class="field">
            <span>Metadata URL</span>
            <input
              bind:value={draft.metadata_url}
              type="url"
              required
              placeholder="https://identity.example.com/saml/metadata"
            />
          </label>
        {:else}
          <div class="retained-metadata">
            <ShieldCheck size={16} />
            <span>The current document and metadata trust policy will be preserved.</span>
          </div>
        {/if}

        {#if draft.metadata_source !== 'retain'}
          <label class="field">
            <span>Metadata signing certificate <small>Optional</small></span>
            <textarea
              bind:value={draft.metadata_signing_certificate}
              rows="5"
              spellcheck="false"
              placeholder="-----BEGIN CERTIFICATE-----"></textarea>
            <small>
              When supplied, metadata must carry a valid XML signature from this certificate.
            </small>
          </label>
        {/if}

        <details>
          <summary>Attribute mapping</summary>
          <div class="field-grid mapped-fields">
            <label class="field">
              <span>Email attribute <small>Optional</small></span>
              <input bind:value={draft.email_attribute} maxlength="512" placeholder="mail" />
            </label>
            <label class="field">
              <span>Display-name attribute <small>Optional</small></span>
              <input
                bind:value={draft.display_name_attribute}
                maxlength="512"
                placeholder="displayName"
              />
            </label>
          </div>
          <p>Common email and name attributes are recognized automatically when left empty.</p>
        </details>

        <div class="policy-list">
          <Toggle
            bind:checked={draft.enabled}
            label="Available for sign-in"
            description="Show this provider only while external authentication is enabled."
          />
          <Toggle
            bind:checked={draft.auto_provision}
            label="Create players on first sign-in"
            description="New verified assertions receive the canonical player role automatically."
          />
          <Toggle
            bind:checked={draft.allow_email_link}
            label="Link matching verified email"
            description="Off by default. Enable only when this IdP is authoritative for existing account email addresses."
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
      <p class="status" role="status">Loading SAML providers…</p>
    {:else if providers.length}
      <div class="provider-list">
        {#each providers as provider (provider.id)}
          <article>
            <div class="provider-icon" aria-hidden="true">
              <FileKey size={17} />
            </div>
            <div class="provider-copy">
              <div class="provider-name">
                <strong>{provider.display_name}</strong>
                <Badge tone={provider.enabled ? 'success' : 'neutral'}>
                  {provider.enabled ? 'Active' : 'Hidden'}
                </Badge>
                <Badge tone={provider.metadata_verified ? 'accent' : 'neutral'}>
                  {provider.metadata_verified ? 'Pinned metadata' : 'Operator trusted'}
                </Badge>
              </div>
              <span>{provider.idp_entity_id}</span>
              <div class="endpoint-row">
                <code>{provider.sp_entity_id}</code>
                <button
                  type="button"
                  onclick={() => copyEndpoint('Entity ID', provider.sp_entity_id)}
                  aria-label={`Copy entity ID for ${provider.display_name}`}
                >
                  <Copy size={12} />
                </button>
              </div>
              <div class="endpoint-row">
                <code>{provider.acs_uri}</code>
                <button
                  type="button"
                  onclick={() => copyEndpoint('ACS URL', provider.acs_uri)}
                  aria-label={`Copy assertion consumer URL for ${provider.display_name}`}
                >
                  <Copy size={12} />
                </button>
              </div>
              <div class="policies">
                <span>
                  <ShieldCheck size={12} />
                  Signed assertions required
                </span>
                <span>
                  <KeyRound size={12} />
                  {provider.auto_provision ? 'Auto-provision' : 'Invite only'}
                </span>
                {#if provider.metadata_url}
                  <span>
                    <Link size={12} />
                    URL sourced
                  </span>
                {/if}
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
        <FileKey size={18} />
        <div>
          <strong>No SAML providers</strong>
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
  .form-actions,
  .endpoint-row {
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
  .edit-button,
  .endpoint-row button {
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
  .field small,
  details p {
    color: var(--ink-faint);
    font-size: 0.68rem;
    line-height: 1.5;
  }
  textarea {
    min-height: 7rem;
    resize: vertical;
    font-family: var(--font-mono);
    font-size: 0.72rem;
  }
  .source-choice {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .source-choice legend {
    margin-bottom: 0.55rem;
    color: var(--ink-secondary);
    font-size: 0.74rem;
    font-weight: 700;
  }
  .source-choice label {
    display: flex;
    align-items: start;
    gap: 0.55rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
  }
  .source-choice input {
    margin-top: 0.15rem;
    accent-color: var(--accent);
  }
  .source-choice span {
    display: grid;
    gap: 0.2rem;
  }
  .source-choice strong {
    font-size: 0.75rem;
  }
  .source-choice small {
    color: var(--ink-faint);
    font-size: 0.66rem;
    line-height: 1.4;
  }
  .retained-metadata {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.8rem;
    border: 1px solid color-mix(in srgb, var(--success) 28%, var(--line));
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--success) 7%, var(--surface));
    color: var(--ink-secondary);
    font-size: 0.75rem;
  }
  details {
    border-block: 1px solid var(--line);
    padding-block: 0.8rem;
  }
  summary {
    color: var(--ink-secondary);
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
  }
  .mapped-fields {
    margin-top: 0.8rem;
  }
  details p {
    margin-bottom: 0;
  }
  .policy-list {
    display: grid;
    gap: 0.85rem;
    padding-bottom: 0.9rem;
    border-bottom: 1px solid var(--line);
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
    flex-wrap: wrap;
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
  .endpoint-row {
    min-width: 0;
    justify-content: start;
    gap: 0.35rem;
  }
  .endpoint-row code {
    color: var(--ink-faint);
    font-family: var(--font-mono);
  }
  .endpoint-row button {
    width: 1.65rem;
    height: 1.65rem;
    flex: 0 0 auto;
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
  .empty-provider span,
  .status,
  .notice {
    color: var(--ink-secondary);
    font-size: 0.72rem;
  }
  .notice {
    padding: 0.65rem;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
  }
  @media (max-width: 680px) {
    .section-head {
      display: grid;
    }
    .field-grid,
    .source-choice {
      grid-template-columns: 1fr;
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
