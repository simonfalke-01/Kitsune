import { browser } from '$app/environment';
import { api, errorMessage } from '$lib/api/client';
import type {
  ChallengeSummary,
  CreateChallengeInput,
  CreateEventInput,
  EventSummary,
  UpdateEventStateInput
} from '$lib/api/client';
import { session } from '$lib/stores/session.svelte';
import { SvelteMap } from 'svelte/reactivity';

const EVENT_STATE_PRIORITY: Readonly<Record<string, number>> = {
  live: 0,
  scheduled: 1,
  paused: 2,
  draft: 3,
  ended: 4,
  archived: 5
};
const SELECTED_EVENT_KEY = 'kitsune.selected-event';

type WireChallenge = Omit<ChallengeSummary, 'survey'> & {
  survey: Array<Omit<ChallengeSummary['survey'][number], 'range'> & { range?: number[] | null }>;
};

export function chooseDefaultEvent(events: readonly EventSummary[]): EventSummary | null {
  return (
    [...events].sort((left, right) => {
      const stateDifference =
        (EVENT_STATE_PRIORITY[left.state] ?? Number.MAX_SAFE_INTEGER) -
        (EVENT_STATE_PRIORITY[right.state] ?? Number.MAX_SAFE_INTEGER);
      return stateDifference || left.name.localeCompare(right.name);
    })[0] ?? null
  );
}

export function challengeCategories(
  challenges: readonly ChallengeSummary[]
): ReadonlyMap<string, ChallengeSummary[]> {
  const grouped = new SvelteMap<string, ChallengeSummary[]>();
  for (const challenge of challenges) {
    const group = grouped.get(challenge.category) ?? [];
    group.push(challenge);
    grouped.set(challenge.category, group);
  }
  for (const group of grouped.values()) {
    group.sort(
      (left, right) => left.position - right.position || left.name.localeCompare(right.name)
    );
  }
  return grouped;
}

function normalizeChallenge(challenge: WireChallenge): ChallengeSummary {
  return {
    ...challenge,
    survey: challenge.survey.map((question) => ({
      ...question,
      range:
        question.range == null
          ? question.range
          : question.range.length === 2
            ? [question.range[0], question.range[1]]
            : null
    }))
  };
}

class EventStore {
  events = $state<EventSummary[]>([]);
  challenges = $state<ChallengeSummary[]>([]);
  selectedEventId = $state<string | null>(null);
  loading = $state(false);
  saving = $state(false);
  error = $state<string | null>(null);
  private challengeRequest = 0;

  get selectedEvent(): EventSummary | null {
    return this.events.find((event) => event.id === this.selectedEventId) ?? null;
  }

  async load(): Promise<void> {
    if (!session.authenticated) return;
    this.loading = true;
    this.error = null;
    const { data, error } = await api.GET('/api/v1/events');
    if (!data) {
      this.error = errorMessage(error, 'Events could not be loaded.');
      this.loading = false;
      return;
    }
    this.events = data;
    const persisted = browser ? localStorage.getItem(SELECTED_EVENT_KEY) : null;
    if (!this.selectedEventId && persisted && data.some((event) => event.id === persisted)) {
      this.selectedEventId = persisted;
    } else if (!this.selectedEventId || !data.some((event) => event.id === this.selectedEventId)) {
      this.selectedEventId = chooseDefaultEvent(data)?.id ?? null;
    }
    this.persistSelection();
    await this.loadChallenges();
    this.loading = false;
  }

  async select(eventId: string): Promise<void> {
    if (this.selectedEventId === eventId) return;
    this.selectedEventId = eventId;
    this.persistSelection();
    await this.loadChallenges();
  }

  async loadChallenges(): Promise<void> {
    const eventId = this.selectedEventId;
    const request = ++this.challengeRequest;
    if (!eventId) {
      this.challenges = [];
      return;
    }
    const { data, error } = await api.GET('/api/v1/events/{event_id}/challenges', {
      params: { path: { event_id: eventId } }
    });
    if (request !== this.challengeRequest) return;
    if (!data) {
      this.error = errorMessage(error, 'Challenges could not be loaded.');
      this.challenges = [];
      return;
    }
    this.challenges = data.map(normalizeChallenge);
  }

  async createEvent(input: CreateEventInput): Promise<EventSummary | null> {
    const csrf = session.current?.csrf_token;
    if (!csrf) return this.authenticationFailure();
    this.saving = true;
    this.error = null;
    const { data, error } = await api.POST('/api/v1/events', {
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The event could not be created.');
      return null;
    }
    this.events = [...this.events, data];
    this.selectedEventId = data.id;
    this.persistSelection();
    this.challenges = [];
    return data;
  }

  async createChallenge(input: CreateChallengeInput): Promise<ChallengeSummary | null> {
    const csrf = session.current?.csrf_token;
    const eventId = this.selectedEventId;
    if (!csrf || !eventId) return this.authenticationFailure();
    this.saving = true;
    this.error = null;
    const { data, error } = await api.POST('/api/v1/events/{event_id}/challenges', {
      params: { path: { event_id: eventId } },
      headers: { 'x-csrf-token': csrf },
      body: input
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The challenge could not be saved.');
      return null;
    }
    const normalized = normalizeChallenge(data);
    this.challenges = [...this.challenges, normalized];
    return normalized;
  }

  async setState(state: UpdateEventStateInput['state']): Promise<EventSummary | null> {
    const csrf = session.current?.csrf_token;
    const eventId = this.selectedEventId;
    if (!csrf || !eventId) return this.authenticationFailure();
    this.saving = true;
    this.error = null;
    const { data, error } = await api.PATCH('/api/v1/events/{event_id}/state', {
      params: { path: { event_id: eventId } },
      headers: { 'x-csrf-token': csrf },
      body: { state }
    });
    this.saving = false;
    if (!data) {
      this.error = errorMessage(error, 'The event state could not be changed.');
      return null;
    }
    this.events = this.events.map((event) => (event.id === data.id ? data : event));
    return data;
  }

  clear(): void {
    this.events = [];
    this.challenges = [];
    this.selectedEventId = null;
    this.error = null;
    this.challengeRequest += 1;
    if (browser) localStorage.removeItem(SELECTED_EVENT_KEY);
  }

  private authenticationFailure(): null {
    this.error = 'Your session expired. Sign in again before making changes.';
    return null;
  }

  private persistSelection(): void {
    if (!browser) return;
    if (this.selectedEventId) {
      localStorage.setItem(SELECTED_EVENT_KEY, this.selectedEventId);
    } else {
      localStorage.removeItem(SELECTED_EVENT_KEY);
    }
  }
}

export const events = new EventStore();
