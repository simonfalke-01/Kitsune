<script lang="ts">
  import { onMount } from 'svelte';
  import { Fingerprint, Plus, Trash2 } from '@lucide/svelte';
  import { api, errorMessage, type PasskeySummary } from '$lib/api/client';
  import { createPasskey } from '$lib/auth/passkeys';
  import { session } from '$lib/stores/session.svelte';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';

  let passkeys = $state<PasskeySummary[]>([]);
  let credentialName = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let activeCount = $derived(passkeys.filter((passkey) => !passkey.revoked_at).length);
  let sessionReady = $derived(!session.loading && session.authenticated);

  onMount(async () => {
    await session.bootstrap();
    if (session.authenticated) {
      await loadPasskeys();
    }
  });

  async function loadPasskeys() {
    const result = await api.GET('/api/v1/auth/passkeys');
    if (result.data) {
      passkeys = result.data;
    }
  }

  async function registerPasskey(event: SubmitEvent) {
    event.preventDefault();
    const csrf = session.current?.csrf_token;
    if (!csrf || !credentialName.trim()) {
      if (!session.loading) {
        error = 'Your session is no longer active. Sign in again before adding a passkey.';
      }
      return;
    }
    busy = true;
    error = null;
    notice = null;
    try {
      const started = await api.POST('/api/v1/auth/passkeys/register/start', {
        headers: { 'x-csrf-token': csrf },
        body: { name: credentialName.trim() }
      });
      if (!started.data) {
        error = errorMessage(started.error, 'Passkey enrollment could not start.');
        return;
      }
      const credential = await createPasskey(started.data.options);
      const completed = await api.POST('/api/v1/auth/passkeys/register/finish', {
        headers: { 'x-csrf-token': csrf },
        body: { credential }
      });
      if (!completed.data) {
        error = errorMessage(completed.error, 'The passkey could not be verified.');
        return;
      }
      credentialName = '';
      notice = completed.data.name + ' is ready for passwordless sign-in.';
      await loadPasskeys();
    } catch (cause) {
      error = passkeyError(cause);
    } finally {
      busy = false;
    }
  }

  async function revokePasskey(passkey: PasskeySummary) {
    const csrf = session.current?.csrf_token;
    if (!csrf) {
      return;
    }
    busy = true;
    error = null;
    notice = null;
    const result = await api.DELETE('/api/v1/auth/passkeys/{credential_id}', {
      params: { path: { credential_id: passkey.id } },
      headers: { 'x-csrf-token': csrf }
    });
    busy = false;
    if (result.response.ok) {
      notice = passkey.name + ' was revoked.';
      await loadPasskeys();
    } else {
      error = errorMessage(result.error, 'The passkey could not be revoked.');
    }
  }

  function describeLastUse(passkey: PasskeySummary): string {
    if (passkey.last_used_at) {
      return 'Last used ' + new Date(passkey.last_used_at).toLocaleString();
    }
    return 'Added ' + new Date(passkey.created_at).toLocaleString();
  }

  function passkeyError(cause: unknown): string {
    if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
      return 'The passkey prompt was cancelled or timed out.';
    }
    if (cause instanceof Error) {
      return cause.message;
    }
    return 'The passkey ceremony could not be completed.';
  }
</script>

<Card elevated>
  <div class="section-head">
    <div>
      <h2>Passkeys</h2>
      <p>Phishing-resistant sign-in with device unlock, biometrics, or a security key.</p>
    </div>
    <Badge tone={activeCount ? 'success' : 'accent'}>
      <Fingerprint size={12} />
      {#if activeCount}
        {activeCount} active
      {:else}
        Recommended
      {/if}
    </Badge>
  </div>

  {#if error}
    <p class="error-text" role="alert">{error}</p>
  {/if}
  {#if notice}
    <p class="notice" role="status">{notice}</p>
  {/if}

  <form class="registration" onsubmit={registerPasskey}>
    <label class="field">
      <span>Passkey name</span>
      <input
        bind:value={credentialName}
        maxlength="80"
        placeholder="MacBook Touch ID"
        autocomplete="off"
        required
      />
    </label>
    <Button type="submit" loading={busy} disabled={!credentialName.trim() || !sessionReady}>
      <Plus size={16} />
      Add passkey
    </Button>
  </form>

  <div class="credentials" aria-label="Passkeys">
    {#each passkeys as passkey (passkey.id)}
      <article>
        <div class="credential-copy">
          <div class="credential-title">
            <strong>{passkey.name}</strong>
            <Badge tone={passkey.revoked_at ? 'neutral' : 'success'}>
              {passkey.revoked_at ? 'Revoked' : 'Active'}
            </Badge>
          </div>
          <span>{describeLastUse(passkey)}</span>
        </div>
        {#if !passkey.revoked_at}
          <Button
            variant="danger"
            ariaLabel={'Revoke ' + passkey.name}
            loading={busy}
            onclick={() => revokePasskey(passkey)}
          >
            <Trash2 size={16} />
            Revoke
          </Button>
        {/if}
      </article>
    {:else}
      <p class="empty">No passkeys yet. Add one without replacing your local sign-in.</p>
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

  .section-head p {
    margin: 0.35rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.76rem;
    line-height: 1.5;
  }

  .notice {
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--success) 28%, transparent);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--success) 8%, var(--surface));
    color: var(--ink-secondary);
    font-size: 0.8rem;
  }

  .registration {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 0.75rem;
  }

  .credentials {
    display: grid;
    margin-top: 1rem;
    border-top: 1px solid var(--line);
  }

  article {
    display: flex;
    min-height: 5rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-block: 0.85rem;
    border-bottom: 1px solid var(--line);
  }

  .credential-copy {
    display: grid;
    min-width: 0;
    gap: 0.35rem;
  }

  .credential-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.55rem;
  }

  .credential-title strong {
    font-size: 0.86rem;
  }

  .credential-copy > span,
  .empty {
    color: var(--ink-secondary);
    font-size: 0.75rem;
  }

  .empty {
    margin: 1rem 0 0;
  }

  @media (max-width: 560px) {
    .registration {
      grid-template-columns: 1fr;
    }

    .registration :global(.button) {
      width: 100%;
    }

    article {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
