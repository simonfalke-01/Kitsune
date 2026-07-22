<script lang="ts">
  import { Plus, Upload, X } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { CreateChallengeInput } from '$lib/api/client';
  import { events } from '$lib/stores/events.svelte';
  import { session } from '$lib/stores/session.svelte';

  type ChallengeType =
    | 'static_flag'
    | 'multiple_choice'
    | 'dynamic_instance'
    | 'file_backed'
    | 'remote_service'
    | 'manual_verification';

  interface HintDraft {
    key: number;
    content: string;
    cost: number;
  }

  interface SurveyDraft {
    id: number;
    fieldKey: string;
    prompt: string;
    minimum: number;
    maximum: number;
    required: boolean;
  }

  let loaded = $state(false);
  let showComposer = $state(false);
  let title = $state('');
  let category = $state('Web');
  let challengeType = $state<ChallengeType>('static_flag');
  let answerMode = $state<'exact' | 'regex'>('exact');
  let answer = $state('');
  let description = $state('');
  let details = $state('');
  let points = $state(500);
  let lifecycle = $state<'draft' | 'testing' | 'published'>('draft');
  let hints = $state<HintDraft[]>([]);
  let surveys = $state<SurveyDraft[]>([]);
  let writeupsEnabled = $state(true);
  let nextHintKey = 1;
  let nextSurveyId = 1;

  $effect(() => {
    if (session.authenticated && !loaded) {
      loaded = true;
      void events.load();
    }
  });

  function challengeKind(): CreateChallengeInput['kind'] {
    switch (challengeType) {
      case 'multiple_choice':
        return {
          type: 'multiple_choice',
          choices: details
            .split('\n')
            .map((choice) => choice.trim())
            .filter(Boolean)
        };
      case 'dynamic_instance':
        return { type: 'dynamic_instance', template: details.trim() };
      case 'file_backed':
        return { type: 'file_backed' };
      case 'remote_service':
        return { type: 'remote_service', connection: details.trim() };
      case 'manual_verification':
        return { type: 'manual_verification' };
      default:
        return { type: 'static_flag' };
    }
  }

  function answerRules(): CreateChallengeInput['answers'] {
    if (challengeType === 'manual_verification') {
      return [{ kind: 'manual' }];
    }
    if (challengeType === 'dynamic_instance') {
      return [{ kind: 'dynamic' }];
    }
    if (challengeType === 'multiple_choice') {
      return [{ kind: 'choice', value: answer }];
    }
    if (answerMode === 'regex') {
      return [{ kind: 'regex', pattern: answer, case_insensitive: false }];
    }
    return [{ kind: 'exact', value: answer, case_insensitive: false }];
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const created = await events.createChallenge({
      name: title,
      category,
      description,
      kind: challengeKind(),
      state: lifecycle,
      scoring: { kind: 'dynamic', initial: points, minimum: Math.min(100, points), decay: 50 },
      visibility: { division_ids: [], prerequisites: [] },
      tags: [],
      max_attempts: null,
      writeups_enabled: writeupsEnabled,
      position: events.challenges.length,
      answers: answerRules(),
      hints: hints.map((hint, index) => ({
        id: index + 1,
        content: hint.content,
        cost: hint.cost
      })),
      survey: surveys.map((question) => ({
        key: question.fieldKey,
        prompt: question.prompt,
        range: [question.minimum, question.maximum],
        required: question.required
      }))
    });
    if (!created) {
      return;
    }
    showComposer = false;
    title = '';
    description = '';
    answer = '';
    details = '';
    hints = [];
    surveys = [];
    writeupsEnabled = true;
    lifecycle = 'draft';
  }

  function addHint(): void {
    hints = [...hints, { key: nextHintKey, content: '', cost: 0 }];
    nextHintKey += 1;
  }

  function removeHint(key: number): void {
    hints = hints.filter((hint) => hint.key !== key);
  }

  function addSurveyQuestion(): void {
    surveys = [
      ...surveys,
      {
        id: nextSurveyId,
        fieldKey: '',
        prompt: '',
        minimum: 1,
        maximum: 5,
        required: true
      }
    ];
    nextSurveyId += 1;
  }

  function removeSurveyQuestion(id: number): void {
    surveys = surveys.filter((question) => question.id !== id);
  }

  function detailsLabel(): string {
    switch (challengeType) {
      case 'multiple_choice':
        return 'Choices, one per line';
      case 'dynamic_instance':
        return 'Instance template key';
      case 'remote_service':
        return 'Connection string';
      default:
        return 'Type details';
    }
  }

  function requiresDetails(type: ChallengeType): boolean {
    return ['multiple_choice', 'dynamic_instance', 'remote_service'].includes(type);
  }
</script>

<svelte:head><title>Challenge authoring — Kitsune</title></svelte:head>

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
      <Button onclick={() => (showComposer = !showComposer)} disabled={!events.selectedEvent}>
        <Plus size={16} />
        New challenge
      </Button>
    </div>
  </div>

  {#if events.events.length}
    <label class="event-picker field">
      <span>Authoring event</span>
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

  {#if showComposer && events.selectedEvent}
    <Card elevated>
      <form onsubmit={save}>
        <div class="form-head">
          <h2>{title || 'Untitled challenge'}</h2>
          <Badge tone={lifecycle === 'published' ? 'success' : 'warning'}>{lifecycle}</Badge>
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
              <option value="static_flag">Static flag</option>
              <option value="multiple_choice">Multiple choice</option>
              <option value="dynamic_instance">Per-team instance</option>
              <option value="file_backed">File-backed</option>
              <option value="remote_service">Remote service</option>
              <option value="manual_verification">Manual verification</option>
            </select>
          </label>
          <label class="field">
            <span>Starting points</span>
            <input type="number" min="1" bind:value={points} />
          </label>
          <label class="field">
            <span>Lifecycle</span>
            <select bind:value={lifecycle}>
              <option value="draft">Draft</option>
              <option value="testing">Testing</option>
              <option value="published">Published</option>
            </select>
          </label>
          {#if challengeType === 'static_flag' || challengeType === 'file_backed' || challengeType === 'remote_service'}
            <label class="field">
              <span>Answer matching</span>
              <select bind:value={answerMode}>
                <option value="exact">Exact</option>
                <option value="regex">Regular expression</option>
              </select>
            </label>
          {/if}
          {#if requiresDetails(challengeType)}
            <label class="field wide">
              <span>{detailsLabel()}</span>
              <textarea bind:value={details} rows="3" required></textarea>
            </label>
          {/if}
          <label class="field wide">
            <span>Description</span>
            <textarea
              bind:value={description}
              rows="7"
              required
              placeholder="Give players a clear trailhead without giving away the path."></textarea>
          </label>
          {#if challengeType !== 'manual_verification' && challengeType !== 'dynamic_instance'}
            <label class="field wide">
              <span>
                {challengeType === 'multiple_choice' ? 'Correct choice' : 'Accepted answer'}
              </span>
              <input bind:value={answer} type="password" autocomplete="new-password" required />
            </label>
          {/if}
          <section class="hint-editor wide" aria-labelledby="hint-editor-title">
            <div class="hint-heading">
              <div>
                <h3 id="hint-editor-title">Hints</h3>
                <small>Content stays sealed until a competitor pays its one-time cost.</small>
              </div>
              <Button variant="secondary" onclick={addHint}>
                <Plus size={14} />
                Add hint
              </Button>
            </div>
            {#each hints as hint, index (hint.key)}
              <div class="hint-row">
                <label class="field">
                  <span>Hint {index + 1}</span>
                  <textarea bind:value={hint.content} rows="3" required></textarea>
                </label>
                <label class="field">
                  <span>Point cost</span>
                  <input bind:value={hint.cost} type="number" min="0" required />
                </label>
                <Button
                  variant="quiet"
                  ariaLabel={`Remove hint ${index + 1}`}
                  onclick={() => removeHint(hint.key)}
                >
                  <X size={15} />
                  Remove
                </Button>
              </div>
            {/each}
          </section>
          <section class="hint-editor wide" aria-labelledby="engagement-editor-title">
            <div class="hint-heading">
              <div>
                <h3 id="engagement-editor-title">After the solve</h3>
                <small
                  >Collect thoughtful writeups and bounded feedback without extra services.</small
                >
              </div>
              <Button variant="secondary" onclick={addSurveyQuestion}>
                <Plus size={14} />
                Add survey question
              </Button>
            </div>
            <label class="check-field">
              <input type="checkbox" bind:checked={writeupsEnabled} />
              <span>Accept player writeups for organizer review</span>
            </label>
            {#each surveys as question, index (question.id)}
              <div class="survey-row">
                <label class="field">
                  <span>Question key</span>
                  <input
                    bind:value={question.fieldKey}
                    required
                    pattern="[a-z][a-z0-9_]*"
                    placeholder="difficulty"
                  />
                </label>
                <label class="field survey-prompt">
                  <span>Prompt</span>
                  <input
                    bind:value={question.prompt}
                    required
                    placeholder="How difficult was this challenge?"
                  />
                </label>
                <label class="field range-field">
                  <span>Minimum</span>
                  <input bind:value={question.minimum} type="number" required />
                </label>
                <label class="field range-field">
                  <span>Maximum</span>
                  <input bind:value={question.maximum} type="number" required />
                </label>
                <label class="check-field">
                  <input type="checkbox" bind:checked={question.required} />
                  <span>Required</span>
                </label>
                <Button
                  variant="quiet"
                  ariaLabel={`Remove survey question ${index + 1}`}
                  onclick={() => removeSurveyQuestion(question.id)}
                >
                  <X size={15} />
                  Remove
                </Button>
              </div>
            {/each}
          </section>
        </div>
        {#if events.error}
          <p class="error-text" role="alert">{events.error}</p>
        {/if}
        <div class="form-actions">
          <Button variant="quiet" onclick={() => (showComposer = false)}>Cancel</Button>
          <Button type="submit" loading={events.saving}>Save challenge</Button>
        </div>
      </form>
    </Card>
  {:else if events.loading}
    <p class="status" role="status">Loading the authoring board…</p>
  {:else if !events.selectedEvent}
    <EmptyState
      title="Create an event first"
      detail="Every challenge belongs to an event and its game modes."
    >
      {#snippet action()}
        <a class="event-link" href="/admin/events">Open event setup</a>
      {/snippet}
    </EmptyState>
  {:else if events.challenges.length}
    <div class="challenge-list">
      {#each events.challenges as challenge (challenge.id)}
        <Card>
          <div class="challenge-row">
            <div>
              <span>{challenge.category}</span>
              <strong>{challenge.name}</strong>
            </div>
            <Badge tone={challenge.state === 'published' ? 'success' : 'neutral'}>
              {challenge.state}
            </Badge>
          </div>
        </Card>
      {/each}
    </div>
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
  .admin-page,
  .challenge-list {
    display: grid;
    width: 100%;
    gap: 1rem;
  }

  .actions,
  .form-actions,
  .challenge-row,
  .challenge-row > div {
    display: flex;
    gap: 0.6rem;
  }

  .event-picker {
    width: min(24rem, 100%);
  }

  .form-head,
  .challenge-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .form-head {
    margin-bottom: 1.2rem;
  }

  .form-head h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .wide {
    grid-column: 1 / -1;
  }

  textarea {
    resize: vertical;
  }

  .hint-editor {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
  }

  .hint-heading,
  .hint-row,
  .survey-row,
  .check-field {
    display: flex;
    align-items: end;
    gap: 0.75rem;
  }

  .hint-heading {
    align-items: center;
    justify-content: space-between;
  }

  .hint-heading h3 {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
  }

  .hint-heading small {
    color: var(--ink-secondary);
    font-size: 0.72rem;
  }

  .hint-row > :first-child {
    flex: 1;
  }

  .hint-row > :nth-child(2) {
    width: 8rem;
  }

  .survey-row {
    align-items: end;
  }

  .survey-prompt {
    flex: 1;
  }

  .range-field {
    width: 6.5rem;
  }

  .check-field {
    align-items: center;
    color: var(--ink-secondary);
    font-size: 0.76rem;
  }

  .check-field input {
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent);
  }

  .form-actions {
    justify-content: end;
    margin-top: 1.2rem;
  }

  .challenge-row > div {
    flex-direction: column;
  }

  .challenge-row span,
  .status {
    color: var(--ink-secondary);
    font-size: 0.78rem;
  }

  .event-link {
    color: var(--accent);
    font-size: 0.84rem;
    font-weight: 700;
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

    .hint-heading,
    .hint-row,
    .survey-row {
      align-items: stretch;
      flex-direction: column;
    }

    .hint-row > :nth-child(2) {
      width: 100%;
    }

    .range-field {
      width: 100%;
    }
  }
</style>
