<script lang="ts">
  import Badge from '$lib/components/Badge.svelte';
  import BrandMark from '$lib/components/BrandMark.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Toggle from '$lib/components/Toggle.svelte';

  let switched = $state(true);
</script>

<section class="page">
  <p class="eyebrow">Kitsune design system</p>
  <h1 class="title">Quiet confidence, clear intent.</h1>
  <p class="lede">
    Tokens, primitives, and interaction rules shared by every mode and extension surface.
  </p>
  <div class="catalog">
    <Card>
      <h2>Identity</h2>
      <div class="sample">
        <BrandMark />
      </div>
    </Card>
    <Card>
      <h2>Actions</h2>
      <div class="sample wrap">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="quiet">Quiet</Button>
        <Button variant="danger">Danger</Button>
      </div>
    </Card>
    <Card>
      <h2>Status</h2>
      <div class="sample wrap">
        <Badge>Neutral</Badge>
        <Badge tone="success">Healthy</Badge>
        <Badge tone="warning">Waiting</Badge>
        <Badge tone="accent">Foxfire</Badge>
      </div>
    </Card>
    <Card>
      <h2>Controls</h2>
      <div class="sample">
        <Toggle
          bind:checked={switched}
          label="Example capability"
          description="Headless and keyboard-accessible through Bits UI."
        />
      </div>
    </Card>
    <Card>
      <h2>Color tokens</h2>
      <div class="swatches">
        <span class="accent">Accent</span>
        <span class="foxfire">Foxfire</span>
        <span class="surface">Surface</span>
        <span class="muted-token">Muted</span>
      </div>
    </Card>
  </div>
</section>

<style>
  .catalog {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-top: 2rem;
  }
  h2 {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .sample {
    margin-top: 1.2rem;
  }
  .wrap {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.6rem;
    margin-top: 1.2rem;
  }
  .swatches span {
    display: grid;
    min-height: 5rem;
    align-items: end;
    padding: 0.6rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    color: var(--on-accent);
    font-size: 0.68rem;
    font-weight: 700;
  }
  .accent {
    background: var(--accent);
  }
  .foxfire {
    background: var(--foxfire);
  }
  .surface {
    background: var(--surface-muted);
    color: var(--ink) !important;
  }
  .muted-token {
    background: var(--ink-secondary);
    color: var(--canvas);
  }
  @media (max-width: 700px) {
    .catalog {
      grid-template-columns: 1fr;
    }
    .swatches {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
