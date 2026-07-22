<script lang="ts">
  import { goto } from '$app/navigation';
  import { UserPlus } from '@lucide/svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';

  let organization = $state('');
  let displayName = $state('');
  let email = $state('');
  let password = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (
      await session.register({
        organization,
        display_name: displayName,
        email,
        password
      })
    ) {
      realtime.start();
      await goto('/challenges');
    }
  }
</script>

<svelte:head><title>Create account — Kitsune</title></svelte:head>

<section class="auth-page page page-narrow">
  <BrandMark />
  <div>
    <p class="eyebrow">Local account</p>
    <h1 class="title">Join the hunt.</h1>
    <p class="lede">Your organizer’s key places you in the right Kitsune organization.</p>
  </div>
  <Card elevated>
    <form onsubmit={submit}>
      <label class="field"
        ><span>Organization key</span><input
          bind:value={organization}
          required
          autocomplete="organization"
          placeholder="night-shrine"
        /></label
      >
      <label class="field"
        ><span>Display name</span><input
          bind:value={displayName}
          required
          autocomplete="nickname"
        /></label
      >
      <label class="field"
        ><span>Email</span><input
          bind:value={email}
          required
          type="email"
          autocomplete="email"
        /></label
      >
      <label class="field"
        ><span>Password</span><input
          bind:value={password}
          required
          minlength="12"
          maxlength="128"
          type="password"
          autocomplete="new-password"
        /></label
      >
      {#if session.error}<p class="error-text" role="alert">{session.error}</p>{/if}
      <Button type="submit" loading={session.loading}><UserPlus size={16} />Create account</Button>
    </form>
  </Card>
  <a class="back" href="/login">Already have an account? Sign in</a>
</section>

<style>
  .auth-page {
    display: grid;
    gap: 1.5rem;
    padding-top: clamp(2rem, 8vw, 6rem);
  }
  form {
    display: grid;
    gap: 1rem;
  }
  .back {
    justify-self: center;
    color: var(--ink-secondary);
    font-size: 0.8rem;
  }
</style>
