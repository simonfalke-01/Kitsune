<script lang="ts">
  import {
    ArrowRight,
    CalendarCheck,
    Radio,
    Shield,
    Sparkles,
    Users,
    Workflow
  } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';
  import { events } from '$lib/stores/events.svelte';
  import { team } from '$lib/stores/team.svelte';
  import { copy, toned } from '$lib/i18n/index.svelte';

  let workspaceLoaded = $state(false);

  $effect(() => {
    if (session.authenticated && !workspaceLoaded) {
      workspaceLoaded = true;
      void Promise.all([events.load(), team.load()]);
    }
  });

  async function register(): Promise<void> {
    await events.registerSelected({ division_id: null, bracket_id: null });
  }

  async function unregister(): Promise<void> {
    await events.unregisterSelected();
  }
</script>

{#if session.loading}
  <div class="loading" role="status" aria-live="polite">
    <span></span>
    <p>Opening the gate…</p>
  </div>
{:else if session.authenticated}
  <div class="page">
    <div class="split-header">
      <div>
        <p class="eyebrow">Command center</p>
        <h1 class="title">Good hunting, {session.current?.user.display_name}.</h1>
        <p class="lede">Your next event will appear here as soon as an organizer opens the gate.</p>
      </div>
      <Badge tone={realtime.connected ? 'success' : 'warning'}>
        <Radio size={11} />
        {realtime.connected ? 'Live' : 'Reconnecting'}
      </Badge>
    </div>
    <div class="quick grid grid-3" aria-label="Quick actions">
      <a href="/challenges">
        <Sparkles size={18} />
        <span>Challenge board</span>
        <ArrowRight size={15} />
      </a>
      <a href="/scoreboard">
        <Shield size={18} />
        <span>Live scoreboard</span>
        <ArrowRight size={15} />
      </a>
      {#if session.can('automation_manage')}
        <a href="/admin/automation">
          <Workflow size={18} />
          <span>Automations</span>
          <ArrowRight size={15} />
        </a>
      {:else}
        <a href="/team">
          <Shield size={18} />
          <span>Your team</span>
          <ArrowRight size={15} />
        </a>
      {/if}
    </div>
    <div class="event-panel">
      {#if events.loading}
        <p class="event-status" role="status">Finding open gates…</p>
      {:else if events.selectedEvent}
        <Card elevated>
          <div class="event-card-head">
            <div>
              <span>Selected event</span>
              <h2>{events.selectedEvent.name}</h2>
              <p>{events.selectedEvent.description}</p>
            </div>
            <Badge tone={events.selectedEvent.state === 'live' ? 'success' : 'neutral'}>
              {events.selectedEvent.state}
            </Badge>
          </div>
          {#if events.events.length > 1}
            <label class="event-select field">
              <span>Event</span>
              <select
                value={events.selectedEventId ?? ''}
                onchange={(event) => events.select(event.currentTarget.value)}
              >
                {#each events.events as event (event.id)}
                  <option value={event.id}>{event.name} · {event.state}</option>
                {/each}
              </select>
            </label>
          {/if}
          <div class="registration">
            <div>
              <CalendarCheck size={18} />
              <div>
                <strong>{events.registration ? 'Registered' : 'Registration open'}</strong>
                <small>
                  {events.registration
                    ? `Competing as ${events.registration.competitor_kind}`
                    : `${events.selectedEvent.participation} participation`}
                </small>
              </div>
            </div>
            {#if events.selectedEvent.participation === 'team' && !team.current}
              <a class="team-link" href="/team">
                <Users size={15} />
                Join or create a team
              </a>
            {:else if events.registration && ['draft', 'scheduled'].includes(events.selectedEvent.state)}
              <Button variant="secondary" loading={events.saving} onclick={unregister}>
                Withdraw
              </Button>
            {:else if !events.registration}
              <Button loading={events.saving} onclick={register}>Register</Button>
            {/if}
          </div>
          {#if events.error}
            <p class="error-text" role="alert">{events.error}</p>
          {/if}
        </Card>
      {:else}
        <EmptyState
          title={toned(copy('empty').event)}
          detail="Organizers can create an event from Admin."
        />
      {/if}
    </div>
  </div>
{:else}
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Capture the flag, reimagined</p>
      <h1 class="display">Cunning wins the night.</h1>
      <p class="lede">
        Jeopardy, King of the Hill, Attack/Defense, and whatever game you invent next—one calm, fast
        platform built to stay out of your way.
      </p>
      <div class="hero-actions">
        <a class="primary-link" href="/login">
          Enter Kitsune
          <ArrowRight size={16} />
        </a>
        <a class="secondary-link" href="/setup">Set up an event</a>
      </div>
    </div>
    <div class="principles">
      <Card>
        <span class="number">01</span>
        <h2>Fast by default.</h2>
        <p>Realtime boards and focused interactions without dashboard noise.</p>
      </Card>
      <Card>
        <span class="number">02</span>
        <h2>Every battery included.</h2>
        <p>Start lean in a minute. Reveal orchestration, automation, and A&D when needed.</p>
      </Card>
      <Card>
        <span class="number">03</span>
        <h2>Built to shapeshift.</h2>
        <p>Typed events, safe plugins, themes, APIs, and game modes from one coherent core.</p>
      </Card>
    </div>
  </section>
{/if}

<style>
  .loading {
    display: grid;
    min-height: calc(100vh - 4rem);
    place-items: center;
    align-content: center;
    color: var(--ink-secondary);
    font-size: 0.84rem;
  }

  .loading span {
    width: 1.8rem;
    height: 1.8rem;
    border: 2px solid var(--line-strong);
    border-top-color: var(--foxfire);
    border-radius: 999px;
    animation: spin 800ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .quick {
    margin-top: 1.8rem;
  }

  .quick a {
    display: grid;
    min-height: 5rem;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.8rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--ink-secondary);
    font-size: 0.88rem;
    font-weight: 650;
    transition:
      border-color var(--duration-fast),
      transform var(--duration-fast);
  }

  .quick a:hover {
    border-color: var(--line-strong);
    color: var(--ink);
    transform: translateY(-2px);
  }

  .event-panel {
    margin-top: 1rem;
  }

  .event-card-head,
  .registration,
  .registration > div,
  .team-link {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .event-card-head,
  .registration {
    justify-content: space-between;
  }

  .event-card-head h2,
  .event-card-head p {
    margin: 0;
  }

  .event-card-head > div,
  .registration > div > div {
    display: grid;
    gap: 0.25rem;
  }

  .event-card-head span,
  .event-card-head p,
  .registration small,
  .event-status {
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }

  .event-select {
    width: min(28rem, 100%);
    margin-top: 1rem;
  }

  .registration {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
  }

  .team-link {
    min-height: 2.65rem;
    justify-content: center;
    padding: 0.62rem 1rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink);
    font-size: 0.88rem;
    font-weight: 680;
  }

  .hero {
    width: min(1180px, calc(100% - 2rem));
    min-height: calc(100vh - 4rem);
    margin-inline: auto;
    padding: clamp(4rem, 10vh, 8rem) 0 4rem;
  }

  .hero-copy {
    max-width: 850px;
  }

  .hero-actions {
    display: flex;
    gap: 0.75rem;
    margin-top: 2rem;
  }

  .primary-link,
  .secondary-link {
    display: inline-flex;
    min-height: 2.8rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.7rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.88rem;
    font-weight: 680;
  }

  .primary-link {
    background: var(--accent);
    color: var(--on-accent);
  }
  .secondary-link {
    border: 1px solid var(--line-strong);
    background: var(--surface);
  }

  .principles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-top: clamp(4rem, 10vh, 7rem);
  }

  .principles .number {
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 0.7rem;
  }

  .principles h2 {
    margin: 2rem 0 0.45rem;
    font-size: 1rem;
    letter-spacing: -0.025em;
  }
  .principles p {
    margin: 0;
    color: var(--ink-secondary);
    font-size: 0.86rem;
    line-height: 1.55;
  }

  @media (max-width: 760px) {
    .hero {
      width: calc(100% - 1.2rem);
      padding-top: 3.5rem;
    }
    .hero-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .principles {
      grid-template-columns: 1fr;
    }
    .event-card-head,
    .registration {
      align-items: stretch;
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading span {
      animation-duration: 1.5s;
    }
  }
</style>
