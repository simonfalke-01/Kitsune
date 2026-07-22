<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { api, errorMessage } from '$lib/api/client';
  import Card from '$lib/components/Card.svelte';

  let verificationStatus = $state<'working' | 'done' | 'failed'>('working');
  let detail = $state('Verifying your link…');

  onMount(async () => {
    const token = page.url.searchParams.get('token');
    if (!token) {
      verificationStatus = 'failed';
      detail = 'This verification link is incomplete.';
      return;
    }
    const result = await api.POST('/api/v1/auth/email/verify', { body: { token } });
    if (result.response.ok) {
      verificationStatus = 'done';
      detail = 'Email verified. The trail is yours.';
    } else {
      verificationStatus = 'failed';
      detail = errorMessage(result.error, 'This verification link is invalid or expired.');
    }
  });
</script>

<svelte:head><title>Verify email — Kitsune</title></svelte:head>
<section class="page page-narrow verify">
  <Card elevated>
    <p class="eyebrow">Email verification</p>
    <h1>
      {verificationStatus === 'working'
        ? 'Following the foxfire…'
        : verificationStatus === 'done'
          ? 'Identity confirmed.'
          : 'The link went cold.'}
    </h1>
    <p>{detail}</p>
    {#if verificationStatus !== 'working'}
      <a href={verificationStatus === 'done' ? '/challenges' : '/login'}>
        {verificationStatus === 'done' ? 'Open challenges' : 'Return to sign in'}
      </a>
    {/if}
  </Card>
</section>

<style>
  .verify {
    padding-top: clamp(3rem, 12vw, 9rem);
    text-align: center;
  }
  h1 {
    margin: 0;
    font-size: clamp(2rem, 5vw, 3.7rem);
    letter-spacing: -0.05em;
  }
  p:not(.eyebrow) {
    color: var(--ink-secondary);
  }
  a {
    display: inline-block;
    margin-top: 1rem;
    color: var(--accent);
    font-weight: 700;
  }
</style>
