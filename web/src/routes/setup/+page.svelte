<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { ArrowRight, CheckCircle2 } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import { api } from '$lib/api/client';
  import { copy, toned } from '$lib/i18n/index.svelte';
  import { session } from '$lib/stores/session.svelte';

  let required = $state<boolean | null>(null);
  let organizationName = $state('');
  let organizationSlug = $state('');
  let displayName = $state('');
  let email = $state('');
  let password = $state('');

  onMount(async () => {
    const { data } = await api.GET('/api/v1/setup');
    required = data?.required ?? null;
  });

  function updateSlug() {
    organizationSlug = organizationName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 63);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const success = await session.setup({
      organization_name: organizationName,
      organization_slug: organizationSlug,
      display_name: displayName,
      email,
      password
    });
    if (success) {
      await goto('/admin');
    }
  }
</script>

<svelte:head><title>Set up Kitsune</title></svelte:head>

<div class="page page-narrow setup">
  <BrandMark />
  {#if required === null}
    <p class="setup-loading" role="status">Checking the shrine…</p>
  {:else if required === false}
    <Card elevated>
      <div class="complete">
        <CheckCircle2 size={24} />
        <h1>Setup is complete.</h1>
        <p>This Kitsune already has an owner. Sign in to continue.</p>
        <a href="/login">
          Go to sign in
          <ArrowRight size={15} />
        </a>
      </div>
    </Card>
  {:else}
    <header>
      <p class="eyebrow">First light</p>
      <h1 class="title">{toned(copy('auth').setupTitle)}</h1>
      <p class="lede">One owner account is all Kitsune needs. Everything else stays optional.</p>
    </header>
    <Card elevated>
      <form onsubmit={submit}>
        <div class="pair">
          <label class="field">
            <span>Organization name</span>
            <input
              bind:value={organizationName}
              oninput={updateSlug}
              required
              autocomplete="organization"
            />
          </label>
          <label class="field">
            <span>Organization key</span>
            <input bind:value={organizationSlug} required pattern={'[a-z0-9][a-z0-9-]{0,62}'} />
          </label>
        </div>
        <label class="field">
          <span>Your name</span>
          <input bind:value={displayName} required autocomplete="name" />
        </label>
        <label class="field">
          <span>Email</span>
          <input bind:value={email} type="email" required autocomplete="username" />
        </label>
        <label class="field">
          <span>Password</span>
          <input
            bind:value={password}
            type="password"
            required
            minlength="12"
            maxlength="128"
            autocomplete="new-password"
          />
          <small class="field-hint">At least 12 characters. A passphrase works beautifully.</small>
        </label>
        {#if session.error}
          <p class="error-text" role="alert">{session.error}</p>
        {/if}
        <Button type="submit" loading={session.loading}>
          Create Kitsune
          <ArrowRight size={15} />
        </Button>
      </form>
    </Card>
  {/if}
</div>

<style>
  .setup {
    display: grid;
    gap: 2rem;
  }
  .setup-loading {
    color: var(--ink-secondary);
  }
  header {
    margin-top: 2rem;
  }
  form {
    display: grid;
    gap: 1rem;
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8rem;
  }
  .complete {
    display: grid;
    justify-items: start;
    padding: 1rem;
  }
  .complete h1 {
    margin: 1rem 0 0;
    font-size: 1.5rem;
  }
  .complete p {
    color: var(--ink-secondary);
  }
  .complete a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 1rem;
    color: var(--accent);
    font-weight: 650;
  }
  @media (max-width: 600px) {
    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>
