'use client';

import { useEffect, useMemo, useState } from 'react';

import { Sparkline } from '@/components/ui';
import {
  api,
  type CompetitorProfile,
  type EventSummary,
  type ScoreHistory
} from '@/lib/api/client';
import { buildScoreHistorySeries, buildSparklineSeries } from '@/lib/visualization/score-history';

interface NavigationEventStatusProps {
  event: EventSummary;
  userId: string;
}

function countdownLabel(event: EventSummary, now: number): string {
  const startsAt = event.starts_at ? Date.parse(event.starts_at) : Number.NaN;
  const endsAt = event.ends_at ? Date.parse(event.ends_at) : Number.NaN;
  const target = Number.isFinite(startsAt) && now < startsAt ? startsAt : endsAt;

  if (!Number.isFinite(target)) {
    return event.state === 'live' ? 'Live now' : event.state;
  }

  const difference = target - now;

  if (difference <= 0) {
    return event.state === 'ended' || event.state === 'archived' ? 'Ended' : 'Ending';
  }

  const totalMinutes = Math.max(1, Math.ceil(difference / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  const duration =
    days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return now < startsAt ? `Starts in ${duration}` : `Ends in ${duration}`;
}

export function NavigationEventStatus({ event, userId }: NavigationEventStatusProps) {
  const [now, setNow] = useState(() => Date.now());
  const [profile, setProfile] = useState<CompetitorProfile | null>(null);
  const [history, setHistory] = useState<ScoreHistory | null>(null);
  const [competitorId, setCompetitorId] = useState(userId);
  const [status, setStatus] = useState<'error' | 'loading' | 'ready'>('loading');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const request = {
      active: true
    };

    void (async () => {
      const [userProfileResult, historyResult] = await Promise.all([
        api.GET('/api/v1/events/{event_id}/competitors/{competitor_kind}/{competitor_id}', {
          params: {
            path: {
              competitor_id: userId,
              competitor_kind: 'user',
              event_id: event.id
            }
          }
        }),
        api.GET('/api/v1/events/{event_id}/score-history', {
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

      let nextProfile = userProfileResult.data ?? null;
      let nextCompetitorId = userId;

      if (event.participation === 'team') {
        const team = nextProfile?.teams[0];

        if (team) {
          const teamProfileResult = await api.GET(
            '/api/v1/events/{event_id}/competitors/{competitor_kind}/{competitor_id}',
            {
              params: {
                path: {
                  competitor_id: team.team_id,
                  competitor_kind: 'team',
                  event_id: event.id
                }
              }
            }
          );

          nextProfile = teamProfileResult.data ?? null;
          nextCompetitorId = team.team_id;
        }
      }

      if (!request.active) {
        return;
      }

      setProfile(nextProfile);
      setHistory(historyResult.data ?? null);
      setCompetitorId(nextCompetitorId);
      setStatus(nextProfile && historyResult.data ? 'ready' : 'error');
    })().catch(() => {
      if (request.active) {
        setStatus('error');
      }
    });

    return () => {
      request.active = false;
    };
  }, [event.id, event.participation, userId]);

  const userSeries = useMemo(() => {
    if (!history) {
      return null;
    }

    const series = buildScoreHistorySeries(history.series).find(
      (entry) => entry.id === competitorId
    );
    const latest = Math.max(
      ...history.series
        .flatMap((entry) => entry.points.map((point) => Date.parse(point.occurred_at)))
        .filter(Number.isFinite),
      0
    );
    return series ? buildSparklineSeries(series, latest) : null;
  }, [competitorId, history]);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid min-w-0 gap-1 sm:justify-items-end">
        <span className="text-xs font-medium text-text">{countdownLabel(event, now)}</span>
        {profile?.standing ? (
          <span className="text-xs tabular-nums text-text-muted">
            #{profile.standing.rank} · {profile.standing.score.toLocaleString()} pts
          </span>
        ) : (
          <span className="text-xs text-text-muted">
            {status === 'loading'
              ? 'Loading standing'
              : status === 'error'
                ? 'Standing unavailable'
                : 'No standing'}
          </span>
        )}
      </div>
      {userSeries ? (
        <Sparkline interpolation="step" series={userSeries} />
      ) : (
        <span
          aria-hidden
          className="hidden h-sparkline w-24 rounded-sm bg-surface-active sm:block"
        />
      )}
    </div>
  );
}
