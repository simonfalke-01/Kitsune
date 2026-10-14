import 'server-only';

import { cookies, headers } from 'next/headers';
import createClient from 'openapi-fetch';

import type { EventSummary, ScoreHistorySeries } from '@/lib/api/client';
import type { paths } from '@/lib/api/schema';
import {
  normalizeCompetitorProfile,
  type CompetitorKind,
  type NormalizedCompetitorProfile
} from '@/lib/competitors';
import { chooseDefaultEvent } from '@/lib/events';

const apiOrigin = process.env.KITSUNE_API_ORIGIN ?? 'http://127.0.0.1:3000';

export type CompetitorProfileBootstrap =
  | {
      event: EventSummary;
      history: ScoreHistorySeries | null;
      profile: NormalizedCompetitorProfile;
      status: 'ready';
    }
  | {
      status: 'no-event';
    }
  | {
      status: 'not-found';
    };

export async function getCompetitorProfileBootstrap(
  kind: CompetitorKind,
  competitorId: string
): Promise<CompetitorProfileBootstrap> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const client = createClient<paths>({
    baseUrl: apiOrigin,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      cookie: requestHeaders.get('cookie') ?? ''
    }
  });
  const eventResult = await client.GET('/api/v1/events');

  if (!eventResult.data) {
    throw new Error('Events service unavailable.');
  }

  const persistedEventId = cookieStore.get('kitsune.selected-event')?.value;
  const event =
    eventResult.data.find((candidate) => candidate.id === persistedEventId) ??
    chooseDefaultEvent(eventResult.data);

  if (!event) {
    return {
      status: 'no-event'
    };
  }

  const [profileResult, historyResult] = await Promise.all([
    client.GET('/api/v1/events/{event_id}/competitors/{competitor_kind}/{competitor_id}', {
      params: {
        path: {
          competitor_id: competitorId,
          competitor_kind: kind,
          event_id: event.id
        }
      }
    }),
    client.GET('/api/v1/events/{event_id}/score-history', {
      params: {
        path: {
          event_id: event.id
        },
        query: {
          limit: 20
        }
      }
    })
  ]);

  if (!profileResult.data) {
    if (profileResult.response.status === 404) {
      return {
        status: 'not-found'
      };
    }

    throw new Error('Competitor profile service unavailable.');
  }

  const profile = normalizeCompetitorProfile(profileResult.data);

  if (profile.competitor_kind !== kind || profile.competitor_id !== competitorId) {
    throw new Error('Kitsune returned a different competitor profile.');
  }

  return {
    event,
    history:
      historyResult.data?.series.find(
        (series) => series.competitor_id === competitorId && series.competitor_kind === kind
      ) ?? null,
    profile,
    status: 'ready'
  };
}
