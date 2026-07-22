<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { Copy, KeyRound, ShieldCheck, Trash2 } from '@lucide/svelte';
  import { api, errorMessage } from '$lib/api/client';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Badge from '$lib/components/Badge.svelte';
  import { session } from '$lib/stores/session.svelte';

  type SessionSummary = import('$lib/api/schema').components['schemas']['SessionSummaryResponse'];
  type Enrollment = import('$lib/api/schema').components['schemas']['TotpEnrollmentResponse'];

  let enrollment = $state<Enrollment | null>(null);
  let confirmationCode = $state('');
  let recoveryCodes = $state<string[]>([]);
  let sessions = $state<SessionSummary[]>([]);
  let busy = $state(false);
  let error = $state<string | null>(null);

  onMount(async () => {
    if (!session.authenticated) {
      await goto('/login');
      return;
    }
    await loadSessions();
  });

  async function loadSessions() {
    const result = await api.GET('/api/v1/auth/sessions');
    if (result.data) sessions = result.data;
  }

  async function startTotp() {
    const csrf = session.current?.csrf_token;
    if (!csrf) return;
    busy = true;
    error = null;
    const result = await api.POST('/api/v1/auth/mfa/totp/start', {
      headers: { 'x-csrf-token': csrf }
    });
    busy = false;
    if (result.data) enrollment = result.data;
    else error = errorMessage(result.error, 'MFA setup could not start.');
  }

  async function confirmTotp(event: SubmitEvent) {
    event.preventDefault();
    const csrf = session.current?.csrf_token;
    if (!csrf) return;
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
    } else error = errorMessage(result.error, 'The authenticator code did not match.');
  }

  async function revoke(id: string) {
    const csrf = session.current?.csrf_token;
    if (!csrf) return;
    const result = await api.DELETE('/api/v1/auth/sessions/{session_id}', {
      params: { path: { session_id: id } },
      headers: { 'x-csrf-token': csrf }
    });
    if (result.response.ok) {
      const wasCurrent = sessions.find((item) => item.id === id)?.current;
      if (wasCurrent) {
        session.current = null;
        await goto('/login');
      } else await loadSessions();
    }
  }

  async function copyCodes() {
    await navigator.clipboard.writeText(recoveryCodes.join('\n'));
  }
</script>

<svelte:head><title>Account security — Kitsune</title></svelte:head>
<section class="page page-narrow security">
  <div>
    <p class="eyebrow">Account security</p>
    <h1 class="title">Guard your trail.</h1>
    <p class="lede">Add an authenticator and inspect every active session.</p>
  </div>

  <Card elevated>
    <div class="section-head">
      <div>
        <h2>Authenticator app</h2>
        <p>TOTP codes use a 30-second window and cannot be replayed.</p>
      </div>
      <Badge tone={recoveryCodes.length ? 'success' : 'neutral'}
        >{recoveryCodes.length ? 'Enabled' : 'Optional'}</Badge
      >
    </div>
    {#if recoveryCodes.length}
      <div class="codes">
        <div>
          <strong>Store these recovery codes now.</strong><span
            >Each works once. They will not be shown again.</span
          >
        </div>
        <pre>{recoveryCodes.join('\n')}</pre>
        <Button variant="secondary" onclick={copyCodes}><Copy size={15} />Copy codes</Button>
      </div>
    {:else if enrollment}
      <div class="enroll">
        <p>Scan this provisioning URI with your authenticator or enter the secret manually.</p>
        <code>{enrollment.secret}</code>
        <details>
          <summary>Show provisioning URI</summary><code>{enrollment.provisioning_uri}</code>
        </details>
        <form onsubmit={confirmTotp}>
          <label class="field"
            ><span>Current six-digit code</span><input
              bind:value={confirmationCode}
              inputmode="numeric"
              autocomplete="one-time-code"
              required
            /></label
          ><Button type="submit" loading={busy}><ShieldCheck size={16} />Confirm and enable</Button>
        </form>
      </div>
    {:else}
      <Button onclick={startTotp} loading={busy}><KeyRound size={16} />Set up authenticator</Button>
    {/if}
    {#if error}<p class="error-text" role="alert">{error}</p>{/if}
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
            <strong>{item.current ? 'This session' : 'Kitsune session'}</strong><span
              >Last active {new Date(item.last_seen_at).toLocaleString()} · Expires {new Date(
                item.expires_at
              ).toLocaleString()}</span
            >
          </div>
          <Button variant="quiet" ariaLabel="Revoke session" onclick={() => revoke(item.id)}
            ><Trash2 size={16} /></Button
          >
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
  form {
    display: flex;
    align-items: end;
    gap: 0.7rem;
  }
  form .field {
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
    form {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
