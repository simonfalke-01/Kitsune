<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { KeyRound, Send } from '@lucide/svelte';
  import { api, errorMessage } from '$lib/api/client';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';

  let organization = $state('');
  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let sent = $state(false);
  let error = $state<string | null>(null);
  let token = $derived(page.url.searchParams.get('token'));

  async function start(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = null;
    const result = await api.POST('/api/v1/auth/recovery', { body: { organization, email } });
    busy = false;
    if (result.response.ok) {
      sent = true;
    } else {
      error = errorMessage(result.error, 'Recovery could not be started.');
    }
  }

  async function complete(event: SubmitEvent) {
    event.preventDefault();
    if (!token) {
      return;
    }
    busy = true;
    error = null;
    const result = await api.POST('/api/v1/auth/recovery/complete', { body: { token, password } });
    busy = false;
    if (result.response.ok) {
      await goto('/login');
    } else {
      error = errorMessage(result.error, 'This recovery link is invalid or expired.');
    }
  }
</script>

<svelte:head><title>Account recovery — Kitsune</title></svelte:head>
<section class="page page-narrow recover">
  <div>
    <p class="eyebrow">Account recovery</p>
    <h1 class="title">Find the trail again.</h1>
    <p class="lede">
      Recovery links expire after 30 minutes and revoke every previous session when used.
    </p>
  </div>
  <Card elevated>
    {#if token}
      <form onsubmit={complete}>
        <label class="field">
          <span>New password</span>
          <input
            bind:value={password}
            type="password"
            minlength="12"
            maxlength="128"
            autocomplete="new-password"
            required
          />
        </label>

        {#if error}
          <p class="error-text" role="alert">{error}</p>
        {/if}

        <Button type="submit" loading={busy}>
          <KeyRound size={16} />
          Replace password
        </Button>
      </form>
    {:else if sent}
      <div class="sent">
        <Send size={22} />
        <h2>Check the configured channel.</h2>
        <p>
          If the account exists and email delivery is enabled, its recovery link is on the way. This
          answer stays the same for every address.
        </p>
      </div>
    {:else}
      <form onsubmit={start}>
        <label class="field">
          <span>Organization key</span>
          <input bind:value={organization} required />
        </label>

        <label class="field">
          <span>Email</span>
          <input bind:value={email} type="email" autocomplete="email" required />
        </label>

        {#if error}
          <p class="error-text" role="alert">{error}</p>
        {/if}

        <Button type="submit" loading={busy}>
          <Send size={16} />
          Send recovery link
        </Button>
      </form>
    {/if}
  </Card>
</section>

<style>
  .recover {
    display: grid;
    gap: 1.5rem;
    padding-top: clamp(2rem, 8vw, 6rem);
  }
  form {
    display: grid;
    gap: 1rem;
  }
  .sent {
    display: grid;
    justify-items: start;
  }
  .sent h2 {
    margin: 0.8rem 0 0;
    font-size: 1.1rem;
  }
  .sent p {
    margin: 0.5rem 0 0;
    color: var(--ink-secondary);
    line-height: 1.55;
  }
</style>
