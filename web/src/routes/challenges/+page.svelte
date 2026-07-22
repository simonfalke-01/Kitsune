<script lang="ts">
  import { BookOpen, Check, ChevronDown, Flag, Filter, Search, Sparkles } from '@lucide/svelte';
  import Badge from '$lib/components/Badge.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { ChallengeSummary } from '$lib/api/client';
  import { copy, toned } from '$lib/i18n/index.svelte';
  import { challengeCategories, events } from '$lib/stores/events.svelte';
  import { game, submissionMessage } from '$lib/stores/game.svelte';
  import { session } from '$lib/stores/session.svelte';

  let query = $state('');
  let loaded = $state(false);
  let selectedCategory = $state<string | null>(null);
  let openChallengeId = $state<string | null>(null);
  let answers = $state<Record<string, string>>({});
  let writeupBodies = $state<Record<string, string>>({});
  let surveyAnswers = $state<Record<string, number>>({});
  let filtered = $derived(
    events.challenges.filter((challenge) => {
      const text =
        `${challenge.name} ${challenge.category} ${challenge.tags.join(' ')}`.toLowerCase();
      const matchesQuery = text.includes(query.trim().toLowerCase());
      return matchesQuery && (!selectedCategory || challenge.category === selectedCategory);
    })
  );
  let categories = $derived(challengeCategories(filtered));
  let availableCategories = $derived([...new Set(events.challenges.map((item) => item.category))]);

  $effect(() => {
    if (session.authenticated && !loaded) {
      loaded = true;
      void events.load();
    }
  });

  function score(challenge: ChallengeSummary): string {
    switch (challenge.scoring.kind) {
      case 'static':
        return `${challenge.scoring.points} pts`;
      case 'dynamic':
        return `${challenge.scoring.initial} pts`;
      case 'plugin':
        return challenge.scoring.strategy;
    }
  }

  function typeLabel(challenge: ChallengeSummary): string {
    return challenge.kind.type.replaceAll('_', ' ');
  }

  function updateAnswer(challengeId: string, value: string): void {
    answers[challengeId] = value;
  }

  async function submit(event: SubmitEvent, challenge: ChallengeSummary): Promise<void> {
    event.preventDefault();
    const answer = answers[challenge.id] ?? '';
    const receipt = await game.submit(challenge.id, answer);
    if (receipt?.outcome === 'correct') {
      answers[challenge.id] = '';
    }
  }

  async function toggleChallenge(challenge: ChallengeSummary): Promise<void> {
    const challengeId = challenge.id;
    if (openChallengeId === challengeId) {
      openChallengeId = null;
      return;
    }
    openChallengeId = challengeId;
    if (challenge.solved) {
      const writeup = challenge.writeups_enabled ? await game.loadWriteup(challengeId) : null;
      writeupBodies[challengeId] = writeup?.body ?? '';
    } else {
      await game.loadHints(challengeId);
    }
  }

  function resultText(challengeId: string): string | null {
    const receipt = game.receipts[challengeId];
    return receipt ? submissionMessage(receipt) : null;
  }

  function pendingReview(challengeId: string): boolean {
    return game.receipts[challengeId]?.outcome === 'pending';
  }

  function answerLabel(challenge: ChallengeSummary): string {
    if (challenge.kind.type === 'multiple_choice') {
      return 'Answer';
    }
    if (challenge.kind.type === 'manual_verification') {
      return 'Evidence';
    }
    return 'Flag';
  }

  function updateWriteup(challengeId: string, value: string): void {
    writeupBodies[challengeId] = value;
  }

  function updateSurveyAnswer(challengeId: string, key: string, value: string): void {
    surveyAnswers[`${challengeId}:${key}`] = Number(value);
  }

  async function saveWriteup(
    event: SubmitEvent,
    challengeId: string,
    submit: boolean
  ): Promise<void> {
    event.preventDefault();
    await game.saveWriteup(challengeId, writeupBodies[challengeId] ?? '', submit);
  }

  async function submitSurvey(event: SubmitEvent, challenge: ChallengeSummary): Promise<void> {
    event.preventDefault();
    const answers: Record<string, number> = {};
    for (const question of challenge.survey) {
      const value = surveyAnswers[`${challenge.id}:${question.key}`];
      if (value !== undefined) {
        answers[question.key] = value;
      }
    }
    await game.submitSurvey(challenge.id, answers);
  }

  function writeupEditable(challengeId: string): boolean {
    const state = game.writeups[challengeId]?.state;
    return state == null || state === 'draft' || state === 'changes_requested';
  }
</script>

<svelte:head><title>Challenges — Kitsune</title></svelte:head>

<div class="page">
  <div class="split-header">
    <div>
      <p class="eyebrow">{events.selectedEvent?.name ?? 'Jeopardy'}</p>
      <h1 class="title">Challenges</h1>
      <p class="lede">Choose carefully. Every trail tells you something.</p>
    </div>
    <div class="tools">
      <label>
        <span class="sr-only">Search challenges</span>
        <Search size={15} />
        <input bind:value={query} placeholder="Search" />
      </label>
      <select bind:value={selectedCategory} aria-label="Filter by category">
        <option value={null}>All categories</option>
        {#each availableCategories as category (category)}
          <option value={category}>{category}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if events.loading}
    <p class="status" role="status">Following the foxfire…</p>
  {:else if categories.size}
    <div class="board">
      {#each [...categories] as [category, challenges] (category)}
        <section class="category">
          <div class="category-head">
            <h2>{category}</h2>
            <Badge>
              {challenges.length}
              {challenges.length === 1 ? 'challenge' : 'challenges'}
            </Badge>
          </div>
          <div class="challenge-grid">
            {#each challenges as challenge (challenge.id)}
              <Card>
                <article class="challenge-card">
                  <div class="challenge-top">
                    <Sparkles size={17} />
                    {#if challenge.solved}
                      <Badge tone="success"><Check size={11} /> Outfoxed</Badge>
                    {:else}
                      <strong>{score(challenge)}</strong>
                    {/if}
                  </div>
                  <div>
                    <h3>{challenge.name}</h3>
                    <p>{challenge.description}</p>
                  </div>
                  <footer>
                    <span>{typeLabel(challenge)}</span>
                    {#if challenge.max_attempts}
                      <span>{challenge.max_attempts} attempts</span>
                    {/if}
                  </footer>
                  <Button
                    variant={openChallengeId === challenge.id ? 'quiet' : 'secondary'}
                    disabled={pendingReview(challenge.id)}
                    onclick={() => toggleChallenge(challenge)}
                  >
                    {#if challenge.solved}
                      <BookOpen size={15} />
                      After the solve
                      <ChevronDown size={14} />
                    {:else if pendingReview(challenge.id)}
                      <Check size={15} />
                      Awaiting review
                    {:else}
                      <Flag size={15} />
                      Submit flag
                      <ChevronDown size={14} />
                    {/if}
                  </Button>
                  {#if openChallengeId === challenge.id && !challenge.solved && !pendingReview(challenge.id)}
                    <form onsubmit={(event) => submit(event, challenge)}>
                      <label>
                        <span>{answerLabel(challenge)}</span>
                        {#if challenge.kind.type === 'multiple_choice'}
                          <select
                            required
                            value={answers[challenge.id] ?? ''}
                            onchange={(event) =>
                              updateAnswer(challenge.id, event.currentTarget.value)}
                          >
                            <option value="" disabled>Choose an answer</option>
                            {#each challenge.kind.choices as choice (choice)}
                              <option value={choice}>{choice}</option>
                            {/each}
                          </select>
                        {:else}
                          <input
                            required
                            maxlength="4096"
                            autocomplete="off"
                            value={answers[challenge.id] ?? ''}
                            oninput={(event) =>
                              updateAnswer(challenge.id, event.currentTarget.value)}
                            placeholder={'kit{…}'}
                          />
                        {/if}
                      </label>
                      <Button type="submit" loading={game.savingChallengeId === challenge.id}>
                        Inspect submission
                      </Button>
                    </form>
                  {/if}
                  {#if openChallengeId === challenge.id && !challenge.solved && game.hints[challenge.id]?.length}
                    <section class="hints" aria-label={`Hints for ${challenge.name}`}>
                      <h4>Hints</h4>
                      {#each game.hints[challenge.id] as hint (hint.id)}
                        <article>
                          <div>
                            <strong>Hint {hint.id}</strong>
                            <small>{hint.cost} point cost</small>
                          </div>
                          {#if hint.unlocked}
                            <p>{hint.content}</p>
                          {:else}
                            <Button
                              variant="secondary"
                              loading={game.unlockingHint === `${challenge.id}:${hint.id}`}
                              onclick={() => game.unlockHint(challenge.id, hint.id)}
                            >
                              Unlock hint
                            </Button>
                          {/if}
                        </article>
                      {/each}
                    </section>
                  {/if}
                  {#if openChallengeId === challenge.id && challenge.solved}
                    <section class="post-solve" aria-label={`After solving ${challenge.name}`}>
                      {#if challenge.writeups_enabled}
                        <form onsubmit={(event) => saveWriteup(event, challenge.id, true)}>
                          <div class="post-solve-heading">
                            <div>
                              <h4>Writeup</h4>
                              <small>
                                {game.writeups[challenge.id]?.state?.replaceAll('_', ' ') ??
                                  'New draft'}
                              </small>
                            </div>
                            {#if game.writeups[challenge.id]?.feedback}
                              <Badge tone="warning">Changes requested</Badge>
                            {/if}
                          </div>
                          {#if game.writeups[challenge.id]?.feedback}
                            <p class="review-feedback">{game.writeups[challenge.id]?.feedback}</p>
                          {/if}
                          <label>
                            <span>Your solution</span>
                            <textarea
                              rows="6"
                              required
                              minlength="20"
                              maxlength="100000"
                              disabled={!writeupEditable(challenge.id)}
                              value={writeupBodies[challenge.id] ?? ''}
                              oninput={(event) =>
                                updateWriteup(challenge.id, event.currentTarget.value)}
                              placeholder="Explain the path, the false turns, and what finally worked."
                            ></textarea>
                          </label>
                          {#if writeupEditable(challenge.id)}
                            <div class="post-solve-actions">
                              <Button
                                variant="secondary"
                                loading={game.savingWriteupId === challenge.id}
                                onclick={(event) => {
                                  event.preventDefault();
                                  void game.saveWriteup(
                                    challenge.id,
                                    writeupBodies[challenge.id] ?? '',
                                    false
                                  );
                                }}
                              >
                                Save draft
                              </Button>
                              <Button type="submit" loading={game.savingWriteupId === challenge.id}>
                                Submit for review
                              </Button>
                            </div>
                          {/if}
                        </form>
                      {/if}
                      {#if challenge.survey.length}
                        <form onsubmit={(event) => submitSurvey(event, challenge)}>
                          <div class="post-solve-heading">
                            <div>
                              <h4>Quick survey</h4>
                              <small>Your response is reported only in aggregate.</small>
                            </div>
                            {#if game.surveyReceipts[challenge.id]}
                              <Badge tone="success">Saved</Badge>
                            {/if}
                          </div>
                          {#each challenge.survey as question (question.key)}
                            <label>
                              <span>{question.prompt}</span>
                              <input
                                type="number"
                                required={question.required}
                                min={question.range?.[0]}
                                max={question.range?.[1]}
                                value={surveyAnswers[`${challenge.id}:${question.key}`] ?? ''}
                                oninput={(event) =>
                                  updateSurveyAnswer(
                                    challenge.id,
                                    question.key,
                                    event.currentTarget.value
                                  )}
                              />
                            </label>
                          {/each}
                          <Button type="submit" loading={game.savingSurveyId === challenge.id}>
                            Save survey
                          </Button>
                        </form>
                      {/if}
                    </section>
                  {/if}
                  {#if resultText(challenge.id)}
                    <p
                      class:accepted={game.receipts[challenge.id]?.outcome === 'correct'}
                      class="result"
                      role="status"
                    >
                      {resultText(challenge.id)}
                    </p>
                  {:else if openChallengeId === challenge.id && game.error}
                    <p class="result error-text" role="alert">{game.error}</p>
                  {/if}
                </article>
              </Card>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    <EmptyState
      title={toned(copy('empty').challenges)}
      detail={query || selectedCategory
        ? 'Nothing matches the current filters.'
        : 'The board updates live when an organizer publishes a challenge.'}
    >
      {#snippet action()}
        {#if query || selectedCategory}
          <button
            class="clear-filter"
            type="button"
            onclick={() => {
              query = '';
              selectedCategory = null;
            }}
          >
            <Filter size={15} />
            Clear filters
          </button>
        {/if}
      {/snippet}
    </EmptyState>
  {/if}
</div>

<style>
  .tools,
  .tools label,
  .tools select,
  .challenge-top,
  .category-head,
  footer,
  .clear-filter {
    display: flex;
    align-items: center;
  }

  .challenge-card form,
  .challenge-card form label {
    display: grid;
    gap: 0.55rem;
  }

  .challenge-card form {
    padding-top: 0.85rem;
    border-top: 1px solid var(--line);
  }

  .challenge-card form label > span {
    color: var(--ink-secondary);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .challenge-card form input,
  .challenge-card form select,
  .challenge-card form textarea {
    width: 100%;
    min-height: 2.65rem;
    padding: 0 0.72rem;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    outline: none;
    background: var(--surface-raised);
    color: var(--ink);
    font: inherit;
  }

  .challenge-card form input:focus,
  .challenge-card form select:focus,
  .challenge-card form textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
  }

  .result {
    margin: 0;
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--danger) 10%, var(--surface));
    color: var(--danger);
    font-size: 0.78rem;
  }

  .result.accepted {
    background: color-mix(in srgb, var(--success) 11%, var(--surface));
    color: var(--success);
  }

  .hints {
    display: grid;
    gap: 0.65rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--line);
  }

  .post-solve {
    display: grid;
    gap: 0.85rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--line);
  }

  .post-solve > form {
    padding: 0.8rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
  }

  .post-solve textarea {
    resize: vertical;
  }

  .post-solve-heading,
  .post-solve-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
  }

  .post-solve-heading h4,
  .post-solve-heading small {
    margin: 0;
  }

  .post-solve-heading small {
    color: var(--ink-faint);
    font-size: 0.68rem;
    text-transform: capitalize;
  }

  .post-solve-actions {
    justify-content: flex-end;
  }

  .review-feedback {
    padding: 0.65rem;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warning) 10%, var(--surface));
    color: var(--ink-secondary);
  }

  .hints h4,
  .hints p {
    margin: 0;
  }

  .hints > article {
    display: grid;
    gap: 0.6rem;
    padding: 0.7rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
  }

  .hints > article > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .hints small {
    color: var(--ink-faint);
    font-size: 0.68rem;
  }

  .hints p {
    color: var(--ink-secondary);
    font-size: 0.8rem;
    line-height: 1.55;
  }

  .tools {
    gap: 0.5rem;
  }

  .tools label,
  .tools select {
    min-height: 2.55rem;
    gap: 0.45rem;
    padding: 0 0.7rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink-secondary);
  }

  .tools input {
    width: 10rem;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
  }

  .tools select {
    cursor: pointer;
    font-size: 0.8rem;
  }

  .board,
  .category {
    display: grid;
    gap: 1rem;
  }

  .board {
    gap: 2rem;
    margin-top: 2rem;
  }

  .category-head {
    justify-content: space-between;
  }

  .category-head h2 {
    margin: 0;
    font-size: 1rem;
  }

  .challenge-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .challenge-card {
    display: grid;
    min-height: 13rem;
    align-content: space-between;
    gap: 1.2rem;
  }

  .challenge-top,
  footer {
    justify-content: space-between;
    gap: 0.6rem;
  }

  .challenge-top {
    color: var(--accent);
  }

  .challenge-top strong {
    color: var(--ink);
    font-size: 0.82rem;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .challenge-card p {
    display: -webkit-box;
    overflow: hidden;
    margin: 0.55rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.82rem;
    line-height: 1.55;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  footer,
  .status {
    color: var(--ink-faint);
    font-size: 0.7rem;
    text-transform: capitalize;
  }

  .clear-filter {
    gap: 0.4rem;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 700;
  }

  @media (max-width: 850px) {
    .challenge-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .tools {
      width: 100%;
    }

    .tools label,
    .tools input,
    .tools select {
      min-width: 0;
      flex: 1;
    }

    .challenge-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
