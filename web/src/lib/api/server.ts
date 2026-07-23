import 'server-only';

import { cookies, headers } from 'next/headers';
import createClient from 'openapi-fetch';

import type {
  ApiTokenSummary,
  AuditPage,
  BracketSummary,
  ChallengeSummary,
  DivisionSummary,
  EventRegistration,
  EventSummary,
  HealthSummary,
  ManagedGrant,
  ManagedPermission,
  ManagedRole,
  ManagedUser,
  OAuthClient,
  OidcProvider,
  PasskeySummary,
  ReadinessSummary,
  ScoreHistory,
  Scoreboard,
  SamlProvider,
  Session,
  SessionSummary,
  TeamSummary
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

export interface TeamBootstrap {
  brackets: BracketSummary[];
  divisions: DivisionSummary[];
  error: string | null;
  eventId: string | null;
  registration: EventRegistration | null;
  teams: TeamSummary[];
}

export async function getServerTeamBootstrap(): Promise<TeamBootstrap> {
  const client = await getServerClient();
  const [cookieStore, eventResult, teamResult] = await Promise.all([
    cookies(),
    client.GET('/api/v1/events'),
    client.GET('/api/v1/teams')
  ]);

  if (!eventResult.data || !teamResult.data) {
    return {
      brackets: [],
      divisions: [],
      error: 'The team could not be loaded.',
      eventId: null,
      registration: null,
      teams: []
    };
  }

  const persistedEventId = cookieStore.get('kitsune.selected-event')?.value;
  const selectedEvent =
    eventResult.data.find((event) => event.id === persistedEventId) ??
    chooseDefaultEvent(eventResult.data);

  if (!selectedEvent) {
    return {
      brackets: [],
      divisions: [],
      error: null,
      eventId: null,
      registration: null,
      teams: teamResult.data
    };
  }

  const [registrationResult, divisionResult, bracketResult] = await Promise.all([
    client.GET('/api/v1/events/{event_id}/registration', {
      params: {
        path: {
          event_id: selectedEvent.id
        }
      }
    }),
    client.GET('/api/v1/events/{event_id}/divisions', {
      params: {
        path: {
          event_id: selectedEvent.id
        }
      }
    }),
    client.GET('/api/v1/events/{event_id}/brackets', {
      params: {
        path: {
          event_id: selectedEvent.id
        }
      }
    })
  ]);

  return {
    brackets: bracketResult.data ?? [],
    divisions: divisionResult.data ?? [],
    error: registrationResult.data ? null : 'Event registration could not be loaded.',
    eventId: selectedEvent.id,
    registration: registrationResult.data?.registration ?? null,
    teams: teamResult.data
  };
}

export interface AccountBootstrap {
  error: string | null;
  passkeys: PasskeySummary[];
  sessions: SessionSummary[];
  tokens: ApiTokenSummary[];
}

export async function getServerAccountBootstrap(): Promise<AccountBootstrap> {
  const client = await getServerClient();
  const [sessionResult, passkeyResult, tokenResult] = await Promise.all([
    client.GET('/api/v1/auth/sessions'),
    client.GET('/api/v1/auth/passkeys'),
    client.GET('/api/v1/auth/tokens')
  ]);

  if (!sessionResult.data || !passkeyResult.data || !tokenResult.data) {
    return {
      error: 'Security settings could not be loaded.',
      passkeys: passkeyResult.data ?? [],
      sessions: sessionResult.data ?? [],
      tokens: tokenResult.data ?? []
    };
  }

  return {
    error: null,
    passkeys: passkeyResult.data,
    sessions: sessionResult.data,
    tokens: tokenResult.data
  };
}

export interface AdminBootstrap {
  error: string | null;
  health: HealthSummary | null;
  readiness: ReadinessSummary | null;
}

export async function getServerAdminBootstrap(): Promise<AdminBootstrap> {
  const client = await getServerClient();
  const [healthResult, readinessResult] = await Promise.all([
    client.GET('/health'),
    client.GET('/ready')
  ]);

  return {
    error:
      healthResult.data && readinessResult.data ? null : 'Platform health could not be loaded.',
    health: healthResult.data ?? null,
    readiness: readinessResult.data ?? null
  };
}

export interface AccessBootstrap {
  error: string | null;
  grants: ManagedGrant[];
  permissions: ManagedPermission[];
  roles: ManagedRole[];
  users: ManagedUser[];
}

export async function getServerAccessBootstrap(): Promise<AccessBootstrap> {
  const client = await getServerClient();
  const [userResult, roleResult, grantResult, permissionResult] = await Promise.all([
    client.GET('/api/v1/admin/users'),
    client.GET('/api/v1/admin/roles'),
    client.GET('/api/v1/admin/role-grants'),
    client.GET('/api/v1/admin/permissions')
  ]);

  return {
    error:
      userResult.data && roleResult.data && grantResult.data && permissionResult.data
        ? null
        : 'Access inventory could not be loaded.',
    grants: grantResult.data ?? [],
    permissions: permissionResult.data ?? [],
    roles: roleResult.data ?? [],
    users: userResult.data ?? []
  };
}

export interface AuditBootstrap {
  error: string | null;
  page: AuditPage | null;
}

export async function getServerAuditBootstrap(): Promise<AuditBootstrap> {
  const client = await getServerClient();
  const result = await client.GET('/api/v1/audit', {
    params: {
      query: {
        limit: 50
      }
    }
  });

  return {
    error: result.data ? null : 'Audit history could not be loaded.',
    page: result.data ?? null
  };
}

export interface SettingsBootstrap {
  error: string | null;
  oauthClients: OAuthClient[];
  oidcProviders: OidcProvider[];
  samlProviders: SamlProvider[];
}

export async function getServerSettingsBootstrap(): Promise<SettingsBootstrap> {
  const client = await getServerClient();
  const [oauthResult, oidcResult, samlResult] = await Promise.all([
    client.GET('/api/v1/auth/oauth-clients'),
    client.GET('/api/v1/auth/oidc/providers'),
    client.GET('/api/v1/auth/saml/providers')
  ]);

  return {
    error:
      oauthResult.data && oidcResult.data && samlResult.data
        ? null
        : 'Platform settings could not be loaded.',
    oauthClients: oauthResult.data ?? [],
    oidcProviders: oidcResult.data ?? [],
    samlProviders: samlResult.data ?? []
  };
}
