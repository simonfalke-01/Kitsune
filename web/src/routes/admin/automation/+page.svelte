<script lang="ts">
  import { Filter, Play, Plus, Radio, Send } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Card from '$lib/components/Card.svelte';

  let enabled = $state(false);
  let testing = $state(false);

  async function dryRun() {
    testing = true;
    await new Promise((resolve) => setTimeout(resolve, 400));
    testing = false;
  }
</script>

<section class="page admin-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Automation</p>
      <h1 class="title">Let events carry the work.</h1>
      <p class="lede">
        Typed triggers, guarded conditions, and bounded actions—versioned as one flow.
      </p>
    </div>
    <div class="actions">
      <Button variant="secondary" loading={testing} onclick={dryRun}>
        <Play size={16} />
        Dry run
      </Button>
      <Button onclick={() => (enabled = !enabled)}>
        {enabled ? 'Disable flow' : 'Enable flow'}
      </Button>
    </div>
  </div>

  <Card padded={false} elevated>
    <div class="flowbar">
      <div>
        <strong>Celebrate first blood</strong>
        <span>Version 1 · draft</span>
      </div>
      <Badge tone={enabled ? 'success' : 'warning'}>{enabled ? 'Active' : 'Draft'}</Badge>
    </div>
    <div class="canvas" aria-label="Automation flow editor">
      <article class="node trigger">
        <div class="node-icon"><Radio size={17} /></div>
        <div>
          <small>Trigger</small>
          <strong>First blood earned</strong>
          <span>Any Jeopardy challenge</span>
        </div>
      </article>
      <div class="edge" aria-hidden="true"></div>
      <article class="node condition">
        <div class="node-icon"><Filter size={17} /></div>
        <div>
          <small>Condition</small>
          <strong>Division is student</strong>
          <span>Typed event filter</span>
        </div>
      </article>
      <div class="edge" aria-hidden="true"></div>
      <article class="node action">
        <div class="node-icon"><Send size={17} /></div>
        <div>
          <small>Action</small>
          <strong>Post to Discord</strong>
          <span>Integration disabled</span>
        </div>
      </article>
      <button class="add-node" type="button">
        <Plus size={17} />
        <span>Add action</span>
      </button>
    </div>
  </Card>
</section>

<style>
  .admin-page {
    width: 100%;
  }
  .actions {
    display: flex;
    gap: 0.6rem;
  }
  .flowbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem;
    border-bottom: 1px solid var(--line);
  }
  .flowbar div {
    display: grid;
    gap: 0.2rem;
  }
  .flowbar strong {
    font-size: 0.88rem;
  }
  .flowbar span {
    color: var(--ink-faint);
    font-size: 0.7rem;
  }
  .canvas {
    display: flex;
    min-height: 29rem;
    align-items: center;
    overflow-x: auto;
    padding: 4rem 2rem;
    background-image: radial-gradient(var(--line-strong) 0.7px, transparent 0.7px);
    background-size: 18px 18px;
  }
  .node {
    display: flex;
    width: 230px;
    flex: none;
    gap: 0.75rem;
    padding: 0.9rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-sm);
  }
  .node-icon {
    display: grid;
    width: 2rem;
    height: 2rem;
    flex: none;
    place-items: center;
    border-radius: 0.55rem;
    background: var(--surface-muted);
    color: var(--ink-secondary);
  }
  .trigger .node-icon {
    background: color-mix(in srgb, var(--foxfire) 14%, transparent);
    color: var(--foxfire);
  }
  .action .node-icon {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .node > div:last-child {
    display: grid;
    gap: 0.2rem;
  }
  .node small {
    color: var(--ink-faint);
    font-size: 0.62rem;
    font-weight: 720;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .node strong {
    font-size: 0.82rem;
  }
  .node span {
    color: var(--ink-secondary);
    font-size: 0.68rem;
  }
  .edge {
    width: 56px;
    flex: none;
    border-top: 1px solid var(--line-strong);
  }
  .add-node {
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border: 1px dashed var(--line-strong);
    border-radius: 50%;
    background: var(--surface);
    color: var(--ink-secondary);
    cursor: pointer;
  }
  .add-node span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
  @media (max-width: 700px) {
    .actions {
      width: 100%;
    }
  }
</style>
