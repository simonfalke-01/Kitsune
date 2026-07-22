import { api, errorMessage } from '$lib/api/client';
import type { Scoreboard, SubmissionReceipt } from '$lib/api/client';
import { events } from '$lib/stores/events.svelte';
import { session } from '$lib/stores/session.svelte';

export function submissionMessage(receipt: SubmissionReceipt): string {
  if (receipt.outcome === 'correct') {
    return receipt.first_blood
      ? `First blood. ${receipt.awarded_points} points caught in the foxfire.`
      : `Accepted. ${receipt.awarded_points} points secured.`;
  }
  if (receipt.outcome === 'pending') return 'Queued for an organizer’s review.';
  const attempts =
    receipt.attempts_remaining == null ? '' : ` ${receipt.attempts_remaining} attempts remain.`;
  return `That flag did not hold.${attempts}`;
}

class GameStore {
  scoreboard = $state<Scoreboard | null>(null);
  receipts = $state<Record<string, SubmissionReceipt>>({});
  loadingScoreboard = $state(false);
  savingChallengeId = $state<string | null>(null);
  error = $state<string | null>(null);

  async submit(challengeId: string, answer: string): Promise<SubmissionReceipt | null> {
    const csrf = session.current?.csrf_token;
    const eventId = events.selectedEventId;
    if (!csrf || !eventId) return this.authenticationFailure();
    this.savingChallengeId = challengeId;
    this.error = null;
    const { data, error } = await api.POST(
      '/api/v1/events/{event_id}/challenges/{challenge_id}/submissions',
      {
        params: { path: { event_id: eventId, challenge_id: challengeId } },
        headers: { 'x-csrf-token': csrf },
        body: { idempotency_key: crypto.randomUUID(), answer }
      }
    );
    this.savingChallengeId = null;
    if (!data) {
      this.error = errorMessage(error, 'The submission could not be checked.');
      return null;
    }
    this.receipts = { ...this.receipts, [challengeId]: data };
    if (data.outcome === 'correct') {
      await Promise.all([events.loadChallenges(), this.loadScoreboard()]);
    }
    return data;
  }

  async loadScoreboard(): Promise<void> {
    const eventId = events.selectedEventId;
    if (!eventId || !session.authenticated) {
      this.scoreboard = null;
      return;
    }
    this.loadingScoreboard = true;
    const { data, error } = await api.GET('/api/v1/events/{event_id}/scoreboard', {
      params: { path: { event_id: eventId }, query: {} }
    });
    this.loadingScoreboard = false;
    if (!data) {
      this.error = errorMessage(error, 'The scoreboard could not be loaded.');
      return;
    }
    this.scoreboard = data;
  }

  clear(): void {
    this.scoreboard = null;
    this.receipts = {};
    this.error = null;
    this.savingChallengeId = null;
  }

  private authenticationFailure(): null {
    this.error = 'Your session expired. Sign in again before submitting.';
    return null;
  }
}

export const game = new GameStore();
