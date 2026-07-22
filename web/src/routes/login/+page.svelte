<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { FileKey, KeyRound, Radio, ScanFace } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import { copy, toned } from '$lib/i18n/index.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';
  import {
    api,
    errorMessage,
    type PublicOidcProvider,
    type PublicSamlProvider
  } from '$lib/api/client';
  import { authenticatePasskey } from '$lib/auth/passkeys';

  let organization = $state('');
  let email = $state('');
  let password = $state('');
  let mfaCode = $state('');
  let mfaRequired = $state(false);
  let oidcProviders = $state<PublicOidcProvider[]>([]);
  let samlProviders = $state<PublicSamlProvider[]>([]);
  let providerRequest = 0;
  let passkeyBusy = $state(false);
  let passkeyError = $state<string | null>(null);
  let oidcError = $derived(page.url.searchParams.has('oidc_error'));
  let samlError = $derived(page.url.searchParams.has('saml_error'));

  $effect(() => {
    const requestedOrganization = organization.trim();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(requestedOrganization)) {
      oidcProviders = [];
      samlProviders = [];
      return;
    }
    const request = ++providerRequest;
    const timer = window.setTimeout(() => {
      void loadProviders(requestedOrganization, request);
    }, 250);
    return () => window.clearTimeout(timer);
  });

  async function loadProviders(requestedOrganization: string, request: number) {
    const [oidcResult, samlResult] = await Promise.all([
      api.GET('/api/v1/auth/oidc/providers/public', {
        params: { query: { organization: requestedOrganization } }
      }),
      api.GET('/api/v1/auth/saml/providers/public', {
        params: { query: { organization: requestedOrganization } }
      })
    ]);
    if (request !== providerRequest) {
      return;
    }
    oidcProviders = oidcResult.data ?? [];
    samlProviders = samlResult.data ?? [];
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (
      await session.login({
        organization,
        email,
        password,
        mfa_code: mfaRequired ? mfaCode : undefined
      })
    ) {
      realtime.start();
      await goto('/');
    } else if (session.errorCode === 'mfa_required') {
      mfaRequired = true;
      session.error = null;
    }
  }

  async function signInWithPasskey() {
    if (!organization.trim() || !email.trim()) {
      passkeyError = 'Enter your organization and email first.';
      return;
    }
    passkeyBusy = true;
    passkeyError = null;
    session.error = null;
    try {
      const started = await api.POST('/api/v1/auth/passkeys/login/start', {
        body: {
          organization: organization.trim(),
          email: email.trim(),
          return_to: '/'
        }
      });
      if (!started.data) {
        passkeyError = errorMessage(started.error, 'No passkey is available for this account.');
        return;
      }
      const credential = await authenticatePasskey(started.data.options);
      const completed = await api.POST('/api/v1/auth/passkeys/login/finish', {
        body: { credential }
      });
      if (!completed.data) {
        passkeyError = errorMessage(completed.error, 'The passkey could not verify this sign-in.');
        return;
      }
      session.current = completed.data;
      realtime.start();
      await goto('/');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') {
        passkeyError = 'The passkey prompt was cancelled or timed out.';
      } else if (cause instanceof Error) {
        passkeyError = cause.message;
      } else {
        passkeyError = 'The passkey ceremony could not be completed.';
      }
    } finally {
      passkeyBusy = false;
    }
  }
</script>

<svelte:head>
  <title>Sign in — Kitsune</title>
</svelte:head>

<div class="auth-shell">
  <section class="auth-intro">
    <BrandMark />
    <div>
      <p class="eyebrow">Welcome back</p>
      <h1>{toned(copy('auth').welcome)}</h1>
      <p>{toned(copy('auth').intro)}</p>
    </div>
    <p class="footnote">Kitsune keeps external identity optional. Local accounts always work.</p>
  </section>
  <Card elevated>
    <form onsubmit={submit}>
      <header>
        <h2>Sign in</h2>
        <p>Use the organization key your organizer shared.</p>
      </header>
      <label class="field">
        <span>Organization</span>
        <input
          bind:value={organization}
          autocomplete="organization"
          required
          placeholder="night-shrine"
        />
      </label>
      <label class="field">
        <span>Email</span>
        <input
          bind:value={email}
          type="email"
          autocomplete="username"
          required
          placeholder="you@example.com"
        />
      </label>
      <label class="field">
        <span>Password</span>
        <input bind:value={password} type="password" autocomplete="current-password" required />
      </label>
      {#if mfaRequired}
        <div class="mfa-callout">
          <strong>One more proof.</strong>
          <span>Enter your six-digit authenticator code or a recovery code.</span>
        </div>
        <label class="field">
          <span>MFA code</span>
          <input bind:value={mfaCode} autocomplete="one-time-code" inputmode="numeric" required />
        </label>
      {/if}
      {#if session.error}
        <p class="error-text" role="alert">{session.error}</p>
      {/if}
      {#if oidcError}
        <p class="error-text" role="alert">
          The identity provider could not verify this sign-in. Try again or use a local account.
        </p>
      {/if}
      {#if samlError}
        <p class="error-text" role="alert">
          The SAML assertion could not be verified. Try again or use a local account.
        </p>
      {/if}
      {#if passkeyError}
        <p class="error-text" role="alert">{passkeyError}</p>
      {/if}
      <Button type="submit" loading={session.loading}>
        <KeyRound size={16} />
        Sign in
      </Button>
      <div class="alternatives" aria-label="Other sign-in methods">
        <button
          type="button"
          disabled={passkeyBusy || !organization.trim() || !email.trim()}
          aria-busy={passkeyBusy}
          onclick={signInWithPasskey}
        >
          <ScanFace size={15} />
          {passkeyBusy ? 'Waiting for passkey…' : 'Use passkey'}
        </button>
        {#each oidcProviders as provider (`oidc-${provider.key}`)}
          <a href={`${provider.start_path}?return_to=%2F`}>
            <Radio size={15} />
            {provider.display_name}
          </a>
        {/each}
        {#each samlProviders as provider (`saml-${provider.key}`)}
          <a href={`${provider.start_path}?return_to=%2F`}>
            <FileKey size={15} />
            {provider.display_name}
          </a>
        {/each}
      </div>
      <a class="recovery" href="/recover">Recover your account</a>
      <a class="recovery" href="/register">Create a local account</a>
    </form>
  </Card>
</div>

<style>
  .auth-shell {
    display: grid;
    width: min(980px, calc(100% - 2rem));
    min-height: calc(100vh - 4rem);
    grid-template-columns: 1.2fr 0.8fr;
    align-items: center;
    gap: clamp(2rem, 8vw, 7rem);
    margin-inline: auto;
    padding-block: 3rem;
  }

  .auth-intro {
    display: flex;
    min-height: 32rem;
    flex-direction: column;
    justify-content: space-between;
  }
  .auth-intro h1 {
    max-width: 10ch;
    margin: 0;
    font-size: clamp(2.7rem, 6vw, 5rem);
    letter-spacing: -0.06em;
    line-height: 0.98;
  }
  .auth-intro > div > p:last-child {
    max-width: 42ch;
    color: var(--ink-secondary);
    line-height: 1.6;
  }
  .footnote {
    max-width: 42ch;
    margin: 0;
    color: var(--ink-faint);
    font-size: 0.78rem;
    line-height: 1.5;
  }
  form {
    display: grid;
    gap: 1rem;
    padding: 0.35rem;
  }
  header {
    margin-bottom: 0.4rem;
  }
  header h2 {
    margin: 0;
    font-size: 1.4rem;
    letter-spacing: -0.035em;
  }
  header p {
    margin: 0.35rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.84rem;
  }
  .alternatives {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--line);
  }
  .mfa-callout {
    display: grid;
    gap: 0.25rem;
    padding: 0.8rem;
    border: 1px solid color-mix(in srgb, var(--foxfire) 28%, transparent);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--foxfire) 8%, transparent);
  }
  .mfa-callout strong {
    font-size: 0.84rem;
  }
  .mfa-callout span {
    color: var(--ink-secondary);
    font-size: 0.75rem;
  }
  .alternatives button,
  .alternatives a {
    display: inline-flex;
    min-height: 2.5rem;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    color: var(--ink-faint);
    font-size: 0.78rem;
  }
  .alternatives a {
    background: var(--surface);
    color: var(--ink-secondary);
    font-weight: 650;
  }
  .alternatives button:not(:disabled) {
    background: var(--surface);
    color: var(--ink-secondary);
    font-weight: 650;
    cursor: pointer;
  }
  .alternatives button:not(:disabled):hover {
    border-color: var(--line-strong);
    color: var(--ink);
  }
  .alternatives a:hover {
    border-color: var(--line-strong);
    color: var(--ink);
  }
  .recovery {
    justify-self: center;
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }
  .recovery:hover {
    color: var(--ink);
  }

  @media (max-width: 760px) {
    .auth-shell {
      width: min(100% - 1.2rem, 440px);
      grid-template-columns: 1fr;
      gap: 2rem;
    }
    .auth-intro {
      min-height: auto;
      gap: 2.5rem;
    }
    .footnote {
      display: none;
    }
  }
</style>
