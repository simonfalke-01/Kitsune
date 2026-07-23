<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { Clock3, Filter, ScrollText, ShieldCheck, UserRound } from '@lucide/svelte';
  import { humanizeAuditAction, metadataEntries, shortIdentifier } from '$lib/audit-format';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import { audit } from '$lib/stores/audit.svelte';
  import { events } from '$lib/stores/events.svelte';
  import { session } from '$lib/stores/session.svelte';

  let eventId = $state('');
  let action = $state('');
  let resourceType = $state('');
  let occurredAfter = $state('');
  let occurredBefore = $state('');

  onMount(async () => {
    await session.bootstrap();
    if (!session.can('audit_read')) {
      await goto('/admin');
      return;
    }
    await Promise.all([
      audit.load(),
      events.events.length === 0 ? events.load() : Promise.resolve()
    ]);
  });

  async function applyFilters(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await audit.load({
      event_id: eventId || undefined,
      action: action.trim() || undefined,
      resource_type: resourceType.trim() || undefined,
      occurred_after: toInstant(occurredAfter),
      occurred_before: toInstant(occurredBefore)
    });
  }

  async function clearFilters(): Promise<void> {
    eventId = '';
    action = '';
    resourceType = '';
    occurredAfter = '';
    occurredBefore = '';
    await audit.load();
  }

  function toInstant(value: string): string | undefined {
    return value ? new Date(value).toISOString() : undefined;
  }

  function formatInstant(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium'
    }).format(new Date(value));
  }
</script>

<section class="page audit-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Accountable by design</p>
      <h1 class="title">Every trail leaves a mark.</h1>
      <p class="lede">
        Search the immutable record of organizer, player, integration, and system activity. Entries
        are written with their command and cannot be edited or removed by the application.
      </p>
    </div>
    <Badge tone="success">
      <ShieldCheck size={12} />
      Append-only
    </Badge>
  </div>

  <Card>
    <form class="filters" onsubmit={applyFilters}>
      <div class="filter-title">
        <Filter size={17} />
        <div>
          <h2>Find an event</h2>
          <p>Exact filters keep investigations predictable.</p>
        </div>
      </div>
      <label class="field">
        <span>Competition</span>
        <select bind:value={eventId}>
          <option value="">Every event</option>
          {#each events.events as event (event.id)}
            <option value={event.id}>{event.name}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span>Action key</span>
        <input bind:value={action} list="audit-actions" placeholder="challenge.create" />
        <datalist id="audit-actions">
          <option value="event.create"></option>
          <option value="event.state.change"></option>
          <option value="challenge.create"></option>
          <option value="submission.review"></option>
          <option value="team.merge"></option>
          <option value="auth.api_token.changed"></option>
        </datalist>
      </label>
      <label class="field">
        <span>Resource type</span>
        <input bind:value={resourceType} placeholder="challenge" />
      </label>
      <label class="field">
        <span>From</span>
        <input type="datetime-local" bind:value={occurredAfter} />
      </label>
      <label class="field">
        <span>Through</span>
        <input type="datetime-local" bind:value={occurredBefore} />
      </label>
      <div class="filter-actions">
        <Button type="submit" variant="secondary" loading={audit.loading}>Apply filters</Button>
        <Button type="button" variant="quiet" onclick={clearFilters}>Clear</Button>
      </div>
    </form>
  </Card>

  {#if audit.error}
    <div class="message error" role="alert">{audit.error}</div>
  {/if}

  <div class="results-head">
    <div>
      <p class="eyebrow">Chronology</p>
      <h2>Recent activity</h2>
    </div>
    {#if !audit.loading}
      <span aria-live="polite"
        >{audit.entries.length} {audit.entries.length === 1 ? 'entry' : 'entries'} shown</span
      >
    {/if}
  </div>

  {#if audit.loading}
    <Card>
      <div class="loading-state" role="status">
        <span class="pulse" aria-hidden="true"></span>
        Reading the audit trail…
      </div>
    </Card>
  {:else if audit.entries.length === 0}
    <Card>
      <div class="empty-state">
        <ScrollText size={24} />
        <h2>No matching trail</h2>
        <p>Broaden the filters or wait for the next recorded action.</p>
      </div>
    </Card>
  {:else}
    <ol class="timeline" aria-label="Audit entries">
      {#each audit.entries as entry (entry.id)}
        {@const details = metadataEntries(entry.metadata as Record<string, unknown>)}
        <li>
          <span class="timeline-mark" aria-hidden="true"></span>
          <article>
            <div class="entry-head">
              <div>
                <div class="entry-labels">
                  <Badge tone="accent">{entry.resource_type}</Badge>
                  <code>{entry.action}</code>
                </div>
                <h3>{humanizeAuditAction(entry.action)}</h3>
              </div>
              <time datetime={entry.occurred_at}>{formatInstant(entry.occurred_at)}</time>
            </div>
            <div class="entry-facts">
              <span title={entry.actor_id ?? 'System action'}>
                <UserRound size={14} />
                {shortIdentifier(entry.actor_id)}
              </span>
              <span title={entry.resource_id}>
                <ScrollText size={14} />
                {shortIdentifier(entry.resource_id)}
              </span>
              <span title={entry.correlation_id}>
                <Clock3 size={14} />
                Trace {shortIdentifier(entry.correlation_id)}
              </span>
            </div>
            {#if details.length > 0}
              <details>
                <summary>Structured context</summary>
                <dl>
                  {#each details as [key, value] (key)}
                    <div>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  {/each}
                </dl>
              </details>
            {/if}
          </article>
        </li>
      {/each}
    </ol>
    {#if audit.nextCursor}
      <div class="load-more">
        <Button variant="secondary" loading={audit.loadingMore} onclick={() => audit.loadMore()}>
          Load older entries
        </Button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .audit-page {
    width: 100%;
    max-width: 1050px;
  }

  .split-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 1.5rem;
  }

  .eyebrow {
    margin: 0 0 0.45rem;
    color: var(--accent);
    font-size: 0.7rem;
    font-weight: 760;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .title {
    margin: 0;
    font-size: clamp(2rem, 5vw, 3.4rem);
    letter-spacing: -0.055em;
    line-height: 0.98;
  }

  .lede {
    max-width: 680px;
    margin: 1rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.96rem;
    line-height: 1.65;
  }

  .filters {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 1rem;
  }

  .filter-title {
    display: flex;
    grid-column: 1 / -1;
    align-items: flex-start;
    gap: 0.65rem;
    padding-bottom: 0.3rem;
  }

  .filter-title :global(svg) {
    margin-top: 0.2rem;
    color: var(--foxfire);
  }

  .filter-title h2,
  .results-head h2,
  .empty-state h2 {
    margin: 0;
    font-size: 1rem;
  }

  .filter-title p {
    margin: 0.2rem 0 0;
    color: var(--ink-faint);
    font-size: 0.78rem;
  }

  .field {
    display: grid;
    gap: 0.42rem;
    color: var(--ink-secondary);
    font-size: 0.76rem;
    font-weight: 680;
  }

  .field input,
  .field select {
    width: 100%;
    min-height: 2.65rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink);
    font-size: 0.84rem;
    font-weight: 500;
  }

  .filter-actions {
    display: flex;
    grid-column: 1 / -1;
    gap: 0.35rem;
  }

  .message {
    margin-top: 1rem;
    padding: 0.8rem 0.9rem;
    border-radius: var(--radius-sm);
    font-size: 0.84rem;
  }

  .error {
    border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
    background: color-mix(in srgb, var(--danger) 8%, transparent);
    color: var(--danger);
  }

  .results-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    margin: 2rem 0 0.9rem;
  }

  .results-head span {
    color: var(--ink-faint);
    font-size: 0.75rem;
  }

  .loading-state,
  .empty-state {
    display: grid;
    justify-items: center;
    gap: 0.65rem;
    padding: 2.8rem 1rem;
    color: var(--ink-secondary);
    text-align: center;
  }

  .empty-state :global(svg) {
    color: var(--foxfire);
  }

  .empty-state p {
    margin: 0;
    color: var(--ink-faint);
    font-size: 0.84rem;
  }

  .pulse {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: var(--foxfire);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--foxfire) 35%, transparent);
    animation: pulse 1.5s ease-out infinite;
  }

  .timeline {
    display: grid;
    gap: 0;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .timeline > li {
    position: relative;
    padding: 0 0 0.85rem 1.7rem;
  }

  .timeline > li::before {
    position: absolute;
    top: 0.75rem;
    bottom: -0.75rem;
    left: 0.37rem;
    width: 1px;
    background: var(--line-strong);
    content: '';
  }

  .timeline > li:last-child::before {
    display: none;
  }

  .timeline-mark {
    position: absolute;
    top: 0.68rem;
    left: 0;
    width: 0.8rem;
    height: 0.8rem;
    border: 2px solid var(--surface-raised);
    border-radius: 50%;
    background: var(--foxfire);
    box-shadow: 0 0 0 1px var(--line-strong);
  }

  article {
    padding: 1rem 1.05rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface);
    transition:
      border-color var(--duration-fast),
      transform var(--duration-fast);
  }

  article:hover {
    border-color: var(--line-strong);
    transform: translateY(-1px);
  }

  .entry-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .entry-labels {
    display: flex;
    align-items: center;
    gap: 0.55rem;
  }

  .entry-labels code {
    color: var(--ink-faint);
    font-family: var(--font-mono);
    font-size: 0.67rem;
  }

  .entry-head h3 {
    margin: 0.65rem 0 0;
    font-size: 0.98rem;
    letter-spacing: -0.02em;
  }

  time {
    color: var(--ink-faint);
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .entry-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 1rem;
    margin-top: 0.85rem;
    color: var(--ink-secondary);
    font-family: var(--font-mono);
    font-size: 0.68rem;
  }

  .entry-facts span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  details {
    padding-top: 0.75rem;
    margin-top: 0.8rem;
    border-top: 1px solid var(--line);
  }

  summary {
    width: fit-content;
    cursor: pointer;
    color: var(--ink-secondary);
    font-size: 0.75rem;
    font-weight: 650;
  }

  dl {
    display: grid;
    gap: 0.35rem;
    margin: 0.75rem 0 0;
  }

  dl div {
    display: grid;
    grid-template-columns: minmax(100px, 0.25fr) 1fr;
    gap: 0.75rem;
  }

  dt,
  dd {
    overflow-wrap: anywhere;
    font-family: var(--font-mono);
    font-size: 0.68rem;
  }

  dt {
    color: var(--ink-faint);
  }

  dd {
    margin: 0;
    color: var(--ink-secondary);
  }

  .load-more {
    display: flex;
    justify-content: center;
    padding-top: 0.6rem;
  }

  @keyframes pulse {
    70% {
      box-shadow: 0 0 0 10px transparent;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }

  @media (max-width: 760px) {
    .split-header,
    .entry-head {
      display: grid;
    }

    .filters {
      grid-template-columns: 1fr;
    }

    .filter-title,
    .filter-actions {
      grid-column: auto;
    }

    .entry-head time {
      grid-row: 1;
    }

    dl div {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }
  }
</style>
