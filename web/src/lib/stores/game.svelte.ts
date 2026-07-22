import { api, errorMessage } from '$lib/api/client';
import type {
  ChallengeHint,
  ScoreHistory,
  Scoreboard,
  SubmissionReceipt,
  SurveyReceipt,
  Writeup
} from '$lib/api/client';
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
  scoreHistory = $state<ScoreHistory | null>(null);
  receipts = $state<Record<string, SubmissionReceipt>>({});
  hints = $state<Record<string, ChallengeHint[]>>({});
  writeups = $state<Record<string, Writeup | null>>({});
  surveyReceipts = $state<Record<string, SurveyReceipt>>({});
  loadingScoreboard = $state(false);
  savingChallengeId = $state<string | null>(null);
  unlockingHint = $state<string | null>(null);
  savingWriteupId = $state<string | null>(null);
  savingSurveyId = $state<string | null>(null);
  error = $state<string | null>(null);
  private scoreboardRefresh: ReturnType<typeof setTimeout> | null = null;

  async submit(challengeId: string, answer: string): Promise<SubmissionReceipt | null> {
    const csrf = session.current?.csrf_token;
    const eventId = events.selectedEventId;
    if (!csrf || !eventId) {
      return this.authenticationFailure();
    }
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
      await Promise.all([events.loadChallenges(), this.loadScoreboardData()]);
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

  async loadScoreHistory(): Promise<void> {
    const eventId = events.selectedEventId;
    if (!eventId || !session.authenticated) {
      this.scoreHistory = null;
      return;
    }
    const { data, error } = await api.GET('/api/v1/events/{event_id}/score-history', {
      params: { path: { event_id: eventId }, query: {} }
    });
    if (!data) {
      this.error = errorMessage(error, 'Score history could not be loaded.');
      return;
    }
    this.scoreHistory = data;
  }

  async loadScoreboardData(): Promise<void> {
    await Promise.all([this.loadScoreboard(), this.loadScoreHistory()]);
  }

  scheduleScoreboardRefresh(): void {
    if (this.scoreboardRefresh) {
      clearTimeout(this.scoreboardRefresh);
    }
    this.scoreboardRefresh = setTimeout(() => {
      this.scoreboardRefresh = null;
      void this.loadScoreboardData();
    }, 150);
  }

  async loadHints(challengeId: string): Promise<void> {
    const eventId = events.selectedEventId;
    if (!eventId || !session.authenticated) {
      return;
    }
    const { data, error } = await api.GET(
      '/api/v1/events/{event_id}/challenges/{challenge_id}/hints',
      {
        params: { path: { event_id: eventId, challenge_id: challengeId } }
      }
    );
    if (!data) {
      this.error = errorMessage(error, 'Hints could not be loaded.');
      return;
    }
    this.hints = { ...this.hints, [challengeId]: data };
  }

  async unlockHint(challengeId: string, hintId: number): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    const eventId = events.selectedEventId;
    if (!csrf || !eventId) {
      this.authenticationFailure();
      return false;
    }
    this.unlockingHint = `${challengeId}:${hintId}`;
    this.error = null;
    const { data, error } = await api.POST(
      '/api/v1/events/{event_id}/challenges/{challenge_id}/hints/{hint_id}/unlock',
      {
        params: {
          path: { event_id: eventId, challenge_id: challengeId, hint_id: hintId }
        },
        headers: { 'x-csrf-token': csrf }
      }
    );
    this.unlockingHint = null;
    if (!data) {
      this.error = errorMessage(error, 'The hint could not be unlocked.');
      return false;
    }
    const existing = this.hints[challengeId] ?? [];
    this.hints = {
      ...this.hints,
      [challengeId]: existing.map((hint) => (hint.id === data.hint.id ? data.hint : hint))
    };
    if (data.charged > 0) {
      await this.loadScoreboardData();
    }
    return true;
  }

  async refreshLoadedHints(): Promise<void> {
    await Promise.all(Object.keys(this.hints).map((challengeId) => this.loadHints(challengeId)));
  }

  async loadWriteup(challengeId: string): Promise<Writeup | null> {
    const eventId = events.selectedEventId;
    if (!eventId || !session.authenticated) {
      return null;
    }
    const { data, error, response } = await api.GET(
      '/api/v1/events/{event_id}/challenges/{challenge_id}/writeup',
      {
        params: { path: { event_id: eventId, challenge_id: challengeId } }
      }
    );
    if (!data) {
      if (response.status === 404) {
        this.writeups = { ...this.writeups, [challengeId]: null };
        return null;
      }
      this.error = errorMessage(error, 'The writeup could not be loaded.');
      return null;
    }
    this.writeups = { ...this.writeups, [challengeId]: data };
    return data;
  }

  async saveWriteup(challengeId: string, body: string, submit: boolean): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    const eventId = events.selectedEventId;
    if (!csrf || !eventId) {
      this.authenticationFailure();
      return false;
    }
    this.savingWriteupId = challengeId;
    this.error = null;
    const { data, error } = await api.PUT(
      '/api/v1/events/{event_id}/challenges/{challenge_id}/writeup',
      {
        params: { path: { event_id: eventId, challenge_id: challengeId } },
        headers: { 'x-csrf-token': csrf },
        body: { body, submit }
      }
    );
    this.savingWriteupId = null;
    if (!data) {
      this.error = errorMessage(error, 'The writeup could not be saved.');
      return false;
    }
    this.writeups = { ...this.writeups, [challengeId]: data };
    return true;
  }

  async refreshLoadedWriteups(): Promise<void> {
    await Promise.all(
      Object.keys(this.writeups).map((challengeId) => this.loadWriteup(challengeId))
    );
  }

  async submitSurvey(challengeId: string, answers: Record<string, number>): Promise<boolean> {
    const csrf = session.current?.csrf_token;
    const eventId = events.selectedEventId;
    if (!csrf || !eventId) {
      this.authenticationFailure();
      return false;
    }
    this.savingSurveyId = challengeId;
    this.error = null;
    const { data, error } = await api.POST(
      '/api/v1/events/{event_id}/challenges/{challenge_id}/survey',
      {
        params: { path: { event_id: eventId, challenge_id: challengeId } },
        headers: { 'x-csrf-token': csrf },
        body: { answers }
      }
    );
    this.savingSurveyId = null;
    if (!data) {
      this.error = errorMessage(error, 'The survey response could not be saved.');
      return false;
    }
    this.surveyReceipts = { ...this.surveyReceipts, [challengeId]: data };
    return true;
  }

  clear(): void {
    this.scoreboard = null;
    this.scoreHistory = null;
    this.receipts = {};
    this.hints = {};
    this.writeups = {};
    this.surveyReceipts = {};
    this.error = null;
    this.savingChallengeId = null;
    this.unlockingHint = null;
    this.savingWriteupId = null;
    this.savingSurveyId = null;
    if (this.scoreboardRefresh) {
      clearTimeout(this.scoreboardRefresh);
    }
    this.scoreboardRefresh = null;
  }

  private authenticationFailure(): null {
    this.error = 'Your session expired. Sign in again before submitting.';
    return null;
  }
}

export const game = new GameStore();
