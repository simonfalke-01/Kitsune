import 'server-only';

import { cookies, headers } from 'next/headers';
import createClient from 'openapi-fetch';

import type {
  ChallengeSummary,
  DivisionSummary,
  EventSummary,
  ScoreHistory,
  Scoreboard,
  Session
} from './client';
import type { paths } from './schema';
import { chooseDefaultEvent, normalizeChallenge } from '../events';

const apiOrigin = process.env.KITSUNE_API_ORIGIN ?? 'http://127.0.0.1:3000';

async function getServerClient() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie') ?? '';

  return createClient<paths>({
    baseUrl: apiOrigin,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      cookie
    }
  });
}

export async function getServerSession(): Promise<Session | null> {
  const client = await getServerClient();
  const result = await client.GET('/api/v1/auth/session');

  if (result.data) {
    return result.data;
  }

  if (result.response.status === 401) {
    return null;
  }

  throw new Error('Session service unavailable.');
}

export async function getServerSetupRequired(): Promise<boolean> {
  const client = await getServerClient();
  const result = await client.GET('/api/v1/setup');

  if (result.data) {
    return result.data.required;
  }

  throw new Error('Setup service unavailable.');
}

export interface PlatformBootstrap {
  challenges: ChallengeSummary[];
  events: EventSummary[];
  selectedEventId: string | null;
}

export async function getPlatformBootstrap(): Promise<PlatformBootstrap> {
  const client = await getServerClient();
  const [cookieStore, eventResult] = await Promise.all([cookies(), client.GET('/api/v1/events')]);

  if (!eventResult.data) {
    throw new Error('Events service unavailable.');
  }

  const events = eventResult.data;
  const persistedEventId = cookieStore.get('kitsune.selected-event')?.value;
  const selectedEvent =
    events.find((event) => event.id === persistedEventId) ?? chooseDefaultEvent(events);

  if (!selectedEvent) {
    return {
      challenges: [],
      events,
      selectedEventId: null
    };
  }

  const challengeResult = await client.GET('/api/v1/events/{event_id}/challenges', {
    params: {
      path: {
        event_id: selectedEvent.id
      }
    }
  });

  if (!challengeResult.data) {
    throw new Error('Challenges service unavailable.');
  }

  const challenges = challengeResult.data.map(normalizeChallenge).sort((left, right) => {
    const positionDifference = left.position - right.position;

    if (positionDifference !== 0) {
      return positionDifference;
    }

    return left.name.localeCompare(right.name);
  });

  return {
    challenges,
    events,
    selectedEventId: selectedEvent.id
  };
}

export interface ScoreboardBootstrap {
  divisions: DivisionSummary[];
  error: string | null;
  eventId: string | null;
  history: ScoreHistory | null;
  scoreboard: Scoreboard | null;
}

export async function getServerScoreboardBootstrap(): Promise<ScoreboardBootstrap> {
  const client = await getServerClient();
  const [cookieStore, eventResult] = await Promise.all([cookies(), client.GET('/api/v1/events')]);

  if (!eventResult.data) {
    return {
      divisions: [],
      error: 'The scoreboard could not be loaded.',
      eventId: null,
      history: null,
      scoreboard: null
    };
  }

  const persistedEventId = cookieStore.get('kitsune.selected-event')?.value;
  const selectedEvent =
    eventResult.data.find((event) => event.id === persistedEventId) ??
    chooseDefaultEvent(eventResult.data);

  if (!selectedEvent) {
    return {
      divisions: [],
      error: null,
      eventId: null,
      history: null,
      scoreboard: null
    };
  }

  const [scoreboardResult, historyResult, divisionResult] = await Promise.all([
    client.GET('/api/v1/events/{event_id}/scoreboard', {
      params: {
        path: {
          event_id: selectedEvent.id
        }
      }
    }),
    client.GET('/api/v1/events/{event_id}/score-history', {
      params: {
        path: {
          event_id: selectedEvent.id
        },
        query: {
          limit: 5
        }
      }
    }),
    client.GET('/api/v1/events/{event_id}/divisions', {
      params: {
        path: {
          event_id: selectedEvent.id
        }
      }
    })
  ]);

  if (!scoreboardResult.data || !historyResult.data) {
    return {
      divisions: divisionResult.data ?? [],
      error: 'The scoreboard could not be loaded.',
      eventId: selectedEvent.id,
      history: historyResult.data ?? null,
      scoreboard: scoreboardResult.data ?? null
    };
  }

  return {
    divisions: divisionResult.data ?? [],
    error: null,
    eventId: selectedEvent.id,
    history: historyResult.data,
    scoreboard: scoreboardResult.data
  };
}
