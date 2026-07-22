<script lang="ts">
  import { Plus, Upload } from '@lucide/svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

  let showComposer = $state(false);
  let title = $state('');
  let category = $state('Web');
  let challengeType = $state('static-flag');
  let points = $state(500);
</script>

<section class="page admin-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Challenge authoring</p>
      <h1 class="title">Build the next trick.</h1>
      <p class="lede">Author in the browser or bring a validated <code>challenge.yml</code>.</p>
    </div>
    <div class="actions">
      <Button variant="secondary">
        <Upload size={16} />
        Import YAML
      </Button>
      <Button onclick={() => (showComposer = !showComposer)}>
        <Plus size={16} />
        New challenge
      </Button>
    </div>
  </div>

  {#if showComposer}
    <Card elevated>
      <form onsubmit={(event) => event.preventDefault()}>
        <div class="form-head">
          <h2>Untitled challenge</h2>
          <span>Draft</span>
        </div>
        <div class="form-grid">
          <label class="field">
            <span>Title</span>
            <input bind:value={title} required placeholder="The disappearing endpoint" />
          </label>
          <label class="field">
            <span>Category</span>
            <input bind:value={category} required />
          </label>
          <label class="field">
            <span>Type</span>
            <select bind:value={challengeType}>
              <option value="static-flag">Static flag</option>
              <option value="regex">Regex / multiple answer</option>
              <option value="multiple-choice">Multiple choice</option>
              <option value="dynamic">Per-team instance</option>
              <option value="remote">Remote service</option>
              <option value="manual">Manual verification</option>
            </select>
          </label>
          <label class="field">
            <span>Starting points</span>
            <input type="number" min="0" bind:value={points} />
          </label>
          <label class="field wide">
            <span>Description</span>
            <textarea
              rows="7"
              placeholder="Give players a clear trailhead without giving away the path."></textarea>
          </label>
          <label class="field wide">
            <span>Accepted answer</span>
            <input type="password" autocomplete="new-password" placeholder={'kit{...}'} />
          </label>
        </div>
        <div class="form-actions">
          <Button variant="quiet" onclick={() => (showComposer = false)}>Cancel</Button>
          <Button type="submit">Save draft</Button>
        </div>
      </form>
    </Card>
  {:else}
    <EmptyState
      title="No challenges authored"
      detail="Open the composer or import your ctfcli-compatible challenge collection."
    >
      {#snippet action()}
        <Button onclick={() => (showComposer = true)}>
          <Plus size={16} />
          Create challenge
        </Button>
      {/snippet}
    </EmptyState>
  {/if}
</section>

<style>
  .admin-page {
    width: 100%;
  }
  .actions,
  .form-actions {
    display: flex;
    gap: 0.6rem;
  }
  .form-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.2rem;
  }
  .form-head h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .form-head span {
    color: var(--warning);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
  }
  .form-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
  }
  .wide {
    grid-column: 1 / -1;
  }
  textarea {
    resize: vertical;
  }
  .form-actions {
    justify-content: end;
    margin-top: 1.2rem;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.88em;
  }
  @media (max-width: 700px) {
    .form-grid {
      grid-template-columns: 1fr;
    }
    .wide {
      grid-column: auto;
    }
    .actions {
      width: 100%;
      flex-wrap: wrap;
    }
  }
</style>
