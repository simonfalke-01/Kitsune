<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/components/Button.svelte';
</script>

<section class="error-page">
  <div class="gate" aria-hidden="true"><span></span><i></i><i></i></div>
  <p class="eyebrow">{page.status}</p>
  <h1>{page.status === 404 ? 'This path slips beyond the torii.' : 'The trail went cold.'}</h1>
  <p>
    {page.status === 404
      ? 'Nothing lives at this address.'
      : 'Kitsune recorded the failure. Try the gate again.'}
  </p>
  <a href="/"><Button>Return home</Button></a>
</section>

<style>
  .error-page {
    display: grid;
    min-height: calc(100vh - 4rem);
    place-items: center;
    align-content: center;
    padding: 2rem;
    text-align: center;
  }
  .gate {
    position: relative;
    width: 5rem;
    height: 4.5rem;
    margin-bottom: 1.4rem;
    border-top: 0.4rem solid var(--accent);
  }
  .gate::before,
  .gate::after {
    position: absolute;
    top: -0.75rem;
    width: 0.5rem;
    height: 5rem;
    border-radius: 0.15rem;
    background: var(--accent);
    content: '';
  }
  .gate::before {
    left: 0.7rem;
  }
  .gate::after {
    right: 0.7rem;
  }
  .gate span {
    position: absolute;
    top: 0.45rem;
    right: -0.45rem;
    left: -0.45rem;
    height: 0.3rem;
    background: var(--accent);
  }
  h1 {
    max-width: 18ch;
    margin: 0;
    font-size: clamp(2rem, 6vw, 4rem);
    letter-spacing: -0.055em;
    line-height: 1;
  }
  p:not(.eyebrow) {
    margin: 1rem 0 1.5rem;
    color: var(--ink-secondary);
  }
</style>
