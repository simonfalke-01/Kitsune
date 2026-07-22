<script lang="ts">
  import { BarChart3, CheckCheck, FileCheck2, Send, Undo2 } from '@lucide/svelte';
  import { api, errorMessage } from '$lib/api/client';
  import type { SurveySummary, Writeup } from '$lib/api/client';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { events } from '$lib/stores/events.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { realtime } from '$lib/stores/realtime.svelte';

  let loaded = $state(false);
  let loading = $state(false);
  let reviewingId = $state<string | null>(null);
  let writeups = $state<Writeup[]>([]);
  let feedback = $state<Record<string, string>>({});
  let selectedSurveyChallengeId = $state<string | null>(null);
  let surveySummary = $state<SurveySummary | null>(null);
  let error = $state<string | null>(null);
  let appliedRealtimeEvent = $state<string | null>(null);
  let surveyChallenges = $derived(events.challenges.filter((challenge) => challenge.survey.length));

  $effect(() => {
    if (session.authenticated && !loaded) {
      loaded = true;
      void initialize();
    }
  });

  $effect(() => {
    const envelope = realtime.latest;
    if (!envelope || envelope.id === appliedRealtimeEvent) return;
    if (
      envelope.event.type !== 'challenge.writeup.changed' &&
      envelope.event.type !== 'challenge.survey.submitted'
    ) {
      return;
    }
    appliedRealtimeEvent = envelope.id;
    void loadWriteups();
    if (selectedSurveyChallengeId) void loadSurveySummary(selectedSurveyChallengeId);
  });

  async function initialize(): Promise<void> {
    await events.load();
    await loadWriteups();
    const firstSurvey = surveyChallenges[0];
    if (firstSurvey) {
      selectedSurveyChallengeId = firstSurvey.id;
      await loadSurveySummary(firstSurvey.id);
    }
  }

  async function loadWriteups(): Promise<void> {
    const eventId = events.selectedEventId;
    if (!eventId) return;
    loading = true;
    const { data, error: responseError } = await api.GET('/api/v1/events/{event_id}/writeups', {
      params: { path: { event_id: eventId }, query: {} }
    });
    loading = false;
    if (!data) {
      error = errorMessage(responseError, 'The writeup queue could not be loaded.');
      return;
    }
    writeups = data;
  }

  async function review(
    writeup: Writeup,
    state: 'changes_requested' | 'approved' | 'published'
  ): Promise<void> {
    const eventId = events.selectedEventId;
    const csrf = session.current?.csrf_token;
    if (!eventId || !csrf) return;
    reviewingId = writeup.id;
    error = null;
    const { data, error: responseError } = await api.PATCH(
      '/api/v1/events/{event_id}/writeups/{writeup_id}',
      {
        params: { path: { event_id: eventId, writeup_id: writeup.id } },
        headers: { 'x-csrf-token': csrf },
        body: {
          state,
          feedback: state === 'changes_requested' ? feedback[writeup.id] : null
        }
      }
    );
    reviewingId = null;
    if (!data) {
      error = errorMessage(responseError, 'The review decision could not be saved.');
      return;
    }
    writeups = writeups.map((current) => (current.id === data.id ? data : current));
    feedback[writeup.id] = '';
  }

  async function loadSurveySummary(challengeId: string): Promise<void> {
    const eventId = events.selectedEventId;
    if (!eventId) return;
    selectedSurveyChallengeId = challengeId;
    const { data, error: responseError } = await api.GET(
      '/api/v1/events/{event_id}/challenges/{challenge_id}/survey-summary',
      {
        params: { path: { event_id: eventId, challenge_id: challengeId } }
      }
    );
    if (!data) {
      error = errorMessage(responseError, 'Survey analytics could not be loaded.');
      return;
    }
    surveySummary = data;
  }

  function stateTone(state: string): 'neutral' | 'success' | 'warning' {
    if (state === 'published' || state === 'approved') return 'success';
    if (state === 'submitted' || state === 'changes_requested') return 'warning';
    return 'neutral';
  }
</script>

<svelte:head><title>Reviews — Kitsune</title></svelte:head>

<section class="page admin-page">
  <div class="split-header">
    <div>
      <p class="eyebrow">Player insight</p>
      <h1 class="title">Review the trail, not just the flag.</h1>
      <p class="lede">
        Guide writeups through a deliberate review and read survey signals in aggregate.
      </p>
    </div>
    {#if events.events.length}
      <label class="event-picker field">
        <span>Review event</span>
        <select
          value={events.selectedEventId ?? ''}
          onchange={async (event) => {
            events.select(event.currentTarget.value);
            await loadWriteups();
          }}
        >
          {#each events.events as event (event.id)}
            <option value={event.id}>{event.name}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  {#if error}
    <p class="error-text" role="alert">{error}</p>
  {/if}

  <section class="review-section" aria-labelledby="writeup-queue-title">
    <div class="section-heading">
      <div>
        <FileCheck2 size={18} />
        <h2 id="writeup-queue-title">Writeup queue</h2>
      </div>
      <Badge>{writeups.length} total</Badge>
    </div>
    {#if loading}
      <p class="status" role="status">Opening the review ledger…</p>
    {:else if writeups.length}
      <div class="writeup-grid">
        {#each writeups as writeup (writeup.id)}
          <Card>
            <article class="writeup-card">
              <header>
                <div>
                  <small>{writeup.challenge_name}</small>
                  <h3>{writeup.competitor_name}</h3>
                </div>
                <Badge tone={stateTone(writeup.state)}>{writeup.state.replaceAll('_', ' ')}</Badge>
              </header>
              <p class="writeup-body">{writeup.body}</p>
              {#if writeup.feedback}
                <p class="prior-feedback"><strong>Review note:</strong> {writeup.feedback}</p>
              {/if}
              {#if writeup.state === 'submitted' || writeup.state === 'approved'}
                <label class="field">
                  <span>Feedback for requested changes</span>
                  <textarea
                    rows="3"
                    value={feedback[writeup.id] ?? ''}
                    oninput={(event) => (feedback[writeup.id] = event.currentTarget.value)}
                    placeholder="Point to the missing reasoning or reproduction step."></textarea>
                </label>
                <div class="review-actions">
                  <Button
                    variant="secondary"
                    loading={reviewingId === writeup.id}
                    disabled={!feedback[writeup.id]?.trim()}
                    onclick={() => review(writeup, 'changes_requested')}
                  >
                    <Undo2 size={14} />
                    Request changes
                  </Button>
                  {#if writeup.state === 'submitted'}
                    <Button
                      loading={reviewingId === writeup.id}
                      onclick={() => review(writeup, 'approved')}
                    >
                      <CheckCheck size={14} />
                      Approve
                    </Button>
                  {:else}
                    <Button
                      loading={reviewingId === writeup.id}
                      onclick={() => review(writeup, 'published')}
                    >
                      <Send size={14} />
                      Publish
                    </Button>
                  {/if}
                </div>
              {/if}
            </article>
          </Card>
        {/each}
      </div>
    {:else}
      <EmptyState
        title="No writeups to review"
        detail="Submitted player writeups appear here with their full review history."
      />
    {/if}
  </section>

  <section class="review-section" aria-labelledby="survey-title">
    <div class="section-heading">
      <div>
        <BarChart3 size={18} />
        <h2 id="survey-title">Survey pulse</h2>
      </div>
      {#if surveyChallenges.length}
        <select
          aria-label="Survey challenge"
          value={selectedSurveyChallengeId ?? ''}
          onchange={(event) => loadSurveySummary(event.currentTarget.value)}
        >
          {#each surveyChallenges as challenge (challenge.id)}
            <option value={challenge.id}>{challenge.name}</option>
          {/each}
        </select>
      {/if}
    </div>
    {#if surveySummary}
      <div class="analytics-grid">
        {#each surveySummary.questions as question (question.key)}
          <Card>
            <article class="metric-card">
              <small>{question.prompt}</small>
              <strong>{question.average?.toFixed(1) ?? '—'}</strong>
              <span>
                {question.responses} responses · {question.minimum ?? '—'}–{question.maximum ?? '—'} observed
              </span>
            </article>
          </Card>
        {/each}
      </div>
    {:else}
      <EmptyState
        title="No survey signals yet"
        detail="Add bounded questions to a challenge and aggregate feedback will appear here."
      />
    {/if}
  </section>
</section>

<style>
  .admin-page,
  .review-section,
  .writeup-card {
    display: grid;
    width: 100%;
    gap: 1rem;
  }

  .event-picker {
    width: min(20rem, 100%);
  }

  .review-section {
    margin-top: 1rem;
  }

  .section-heading,
  .section-heading > div,
  .writeup-card header,
  .review-actions {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .section-heading,
  .writeup-card header {
    justify-content: space-between;
  }

  .section-heading h2,
  .writeup-card h3,
  .writeup-card p {
    margin: 0;
  }

  .section-heading h2 {
    font-size: 1rem;
  }

  .section-heading select {
    min-height: 2.4rem;
    padding: 0 0.7rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
  }

  .writeup-grid,
  .analytics-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .writeup-card header small,
  .metric-card small,
  .metric-card span,
  .status {
    color: var(--ink-secondary);
    font-size: 0.74rem;
  }

  .writeup-card h3 {
    margin-top: 0.2rem;
    font-size: 0.95rem;
  }

  .writeup-body {
    white-space: pre-wrap;
    color: var(--ink-secondary);
    font-size: 0.82rem;
    line-height: 1.6;
  }

  .prior-feedback {
    padding: 0.7rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warning) 10%, var(--surface));
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }

  textarea {
    resize: vertical;
  }

  .review-actions {
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .metric-card {
    display: grid;
    gap: 0.45rem;
  }

  .metric-card strong {
    color: var(--accent);
    font-size: 1.8rem;
  }

  @media (max-width: 760px) {
    .writeup-grid,
    .analytics-grid {
      grid-template-columns: 1fr;
    }

    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
