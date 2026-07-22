<script lang="ts">
  import { goto } from '$app/navigation';
  import { KeyRound, Radio, ScanFace } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import { copy, toned } from '$lib/i18n/index.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';

  let organization = $state('');
  let email = $state('');
  let password = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (await session.login({ organization, email, password })) {
      realtime.start();
      await goto('/');
    }
  }
</script>

<svelte:head><title>Sign in — Kitsune</title></svelte:head>

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
      {#if session.error}<p class="error-text" role="alert">{session.error}</p>{/if}
      <Button type="submit" loading={session.loading}><KeyRound size={16} /> Sign in</Button>
      <div class="alternatives" aria-label="Other sign-in methods">
        <button type="button" disabled title="Available when passkeys are configured"
          ><ScanFace size={15} /> Passkey</button
        >
        <button type="button" disabled title="Available when SSO is configured"
          ><Radio size={15} /> SSO</button
        >
      </div>
      <a class="recovery" href="/recover">Recover your account</a>
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
  .alternatives button {
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
