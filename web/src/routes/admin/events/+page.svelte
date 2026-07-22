<script lang="ts">
  import { CalendarPlus, Check, Radio } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { events } from '$lib/stores/events.svelte';

  let loaded = $state(false);
  let composing = $state(false);
  let name = $state('');
  let slug = $state('');
  let description = $state('');
  let participation = $state<'individual' | 'team' | 'hybrid'>('team');
  let teamSizeLimit = $state<number | undefined>(5);
  let modes = $state({ jeopardy: true, koth: false, attack_defense: false, workshop: false });

  $effect(() => {
    if (session.authenticated && !loaded) {
      loaded = true;
      void events.load();
    }
  });

  function updateSlug(): void {
    slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 63);
  }

  async function createEvent(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const enabledModes = Object.entries(modes)
      .filter(([, enabled]) => enabled)
      .map(([mode]) => mode as 'jeopardy' | 'koth' | 'attack_defense' | 'workshop');
    const created = await events.createEvent({
      name,
      slug,
      description,
      state: 'draft',
      participation,
      modes: enabledModes,
      team_size_limit: participation === 'individual' ? null : teamSizeLimit
    });
    if (!created) return;
    composing = false;
    name = '';
    slug = '';
    description = '';
  }
</script>

<svelte:head><title>Events — Kitsune</title></svelte:head>

<section class="page admin-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Event control</p>
      <h1 class="title">Open a new gate.</h1>
      <p class="lede">Start with the essentials. Timing and advanced controls can wait.</p>
    </div>
    <Button onclick={() => (composing = !composing)}>
      <CalendarPlus size={16} />
      New event
    </Button>
  </div>

  {#if composing}
    <Card elevated>
      <form onsubmit={createEvent}>
        <div class="pair">
          <label class="field">
            <span>Event name</span>
            <input bind:value={name} oninput={updateSlug} required placeholder="Outfox Open 2026" />
          </label>
          <label class="field">
            <span>Event key</span>
            <input bind:value={slug} required pattern={'[a-z0-9][a-z0-9-]{0,62}'} />
          </label>
        </div>
        <label class="field">
          <span>Description</span>
          <textarea bind:value={description} rows="4"></textarea>
        </label>
        <div class="pair">
          <label class="field">
            <span>Participation</span>
            <select bind:value={participation}>
              <option value="team">Teams</option>
              <option value="individual">Individuals</option>
              <option value="hybrid">Teams and individuals</option>
            </select>
          </label>
          {#if participation !== 'individual'}
            <label class="field">
              <span>Maximum team size</span>
              <input bind:value={teamSizeLimit} type="number" min="1" max="1000" />
            </label>
          {/if}
        </div>
        <fieldset>
          <legend>Game modes</legend>
          <label><input type="checkbox" bind:checked={modes.jeopardy} /> Jeopardy</label>
          <label><input type="checkbox" bind:checked={modes.koth} /> King of the Hill</label>
          <label><input type="checkbox" bind:checked={modes.attack_defense} /> Attack/Defense</label
          >
          <label><input type="checkbox" bind:checked={modes.workshop} /> Workshop</label>
        </fieldset>
        {#if events.error}
          <p class="error-text" role="alert">{events.error}</p>
        {/if}
        <div class="form-actions">
          <Button variant="quiet" onclick={() => (composing = false)}>Cancel</Button>
          <Button type="submit" loading={events.saving}>Create draft</Button>
        </div>
      </form>
    </Card>
  {/if}

  {#if events.loading}
    <p class="status" role="status">Loading events…</p>
  {:else if events.events.length}
    <div class="event-grid">
      {#each events.events as item (item.id)}
        <button
          class:selected={events.selectedEventId === item.id}
          type="button"
          onclick={() => events.select(item.id)}
        >
          <div class="event-head">
            <Badge tone={item.state === 'live' ? 'success' : 'neutral'}>
              {#if item.state === 'live'}<Radio size={11} />{/if}
              {item.state}
            </Badge>
            {#if events.selectedEventId === item.id}<Check size={16} />{/if}
          </div>
          <strong>{item.name}</strong>
          <span>{item.modes.join(' · ')}</span>
          <small>{item.participation}</small>
        </button>
      {/each}
    </div>
  {:else if !composing}
    <EmptyState
      title="No events yet"
      detail="Create a draft without configuring anything external."
    />
  {/if}
</section>

<style>
  .admin-page,
  form {
    display: grid;
    gap: 1rem;
  }

  .pair,
  .event-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.2rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
  }

  legend {
    padding-inline: 0.4rem;
    color: var(--ink-secondary);
    font-size: 0.79rem;
    font-weight: 650;
  }

  fieldset label {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    color: var(--ink-secondary);
    font-size: 0.82rem;
  }

  .form-actions {
    display: flex;
    justify-content: end;
    gap: 0.6rem;
  }

  .event-grid > button {
    display: grid;
    gap: 0.65rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }

  .event-grid > button:hover,
  .event-grid > button.selected {
    border-color: var(--accent);
    box-shadow: var(--shadow-sm);
  }

  .event-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .event-grid strong {
    font-size: 1.05rem;
  }

  .event-grid span,
  .event-grid small,
  .status {
    color: var(--ink-secondary);
  }

  .event-grid small {
    text-transform: capitalize;
  }

  @media (max-width: 700px) {
    .pair,
    .event-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
