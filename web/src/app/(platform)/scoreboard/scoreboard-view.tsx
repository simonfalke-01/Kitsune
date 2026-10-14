'use client';

import { flexRender, getCoreRowModel, type ColumnDef, useReactTable } from '@tanstack/react-table';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { useEvent } from '../../event-context';
import { useRealtime } from '../../realtime-context';
import { useSession } from '../../session-context';
import { ScoreHistoryChart } from '@/components/charts/score-history-chart';
import { ScoreboardExport } from '@/components/charts/scoreboard-export';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Link,
  SearchField,
  Select,
  Skeleton,
  Sparkline,
  StatusIndicator,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from '@/components/ui';
import {
  api,
  errorMessage,
  type DivisionSummary,
  type ScoreHistory,
  type Scoreboard,
  type ScoreboardRow
} from '@/lib/api/client';
import { competitorProfileHref, parseCompetitorKind } from '@/lib/competitors';
import { filterScoreboardRows, parseScoreboardUrlState } from '@/lib/scoreboard';
import { buildScoreHistorySeries, buildSparklineSeries } from '@/lib/visualization/score-history';

interface ScoreboardViewProps {
  initialDivisions: DivisionSummary[];
  initialError: string | null;
  initialEventId: string | null;
  initialHistory: ScoreHistory | null;
  initialScoreboard: Scoreboard | null;
}

function competitorKind(kind: string): string {
  return kind === 'team' ? 'Team' : 'Individual';
}

function eventPhase(state: string): string {
  const phases: Readonly<Record<string, string>> = {
    archived: 'Archived event',
    draft: 'Draft event',
    ended: 'Competition ended',
    live: 'Live competition',
    paused: 'Competition paused',
    scheduled: 'Competition scheduled'
  };

  return phases[state] ?? 'Event standings';
}

function rankTone(rank: number): 'info' | 'neutral' | 'success' | 'warning' {
  if (rank === 1) {
    return 'warning';
  }

  if (rank === 2) {
    return 'info';
  }

  if (rank === 3) {
    return 'success';
  }

  return 'neutral';
}

function ScoreboardLoading() {
  return (
    <div aria-label="Loading scoreboard" className="grid gap-6" role="status">
      <div className="flex flex-wrap gap-6 border-y border-border-subtle py-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="h-10 w-24" key={index} />
        ))}
      </div>
      <div className="grid gap-2 rounded-lg border border-border-subtle p-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton className="h-12 w-full" key={index} />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ScoreboardView({
  initialDivisions,
  initialError,
  initialEventId,
  initialHistory,
  initialScoreboard
}: ScoreboardViewProps) {
  const pathname = usePathname() ?? '/scoreboard';
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUrlState = parseScoreboardUrlState(
    new URLSearchParams(searchParams?.toString() ?? '')
  );
  const { selectedEvent } = useEvent();
  const { latest } = useRealtime();
  const { can, session } = useSession();
  const selectedEventId = selectedEvent?.id ?? null;
  const [eventId, setEventId] = useState(initialEventId);
  const [divisionId, setDivisionId] = useState<string | null>(initialUrlState.divisionId);
  const [divisions, setDivisions] = useState(initialDivisions);
  const [scoreboard, setScoreboard] = useState(initialScoreboard);
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState(initialError);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCompetitorId, setActiveCompetitorId] = useState<string | null>(null);
  const [selfCompetitorId, setSelfCompetitorId] = useState<string | null>(session?.user.id ?? null);
  const [query, setQuery] = useState(initialUrlState.search);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const deferredQuery = useDeferredValue(normalizedQuery.length >= 2 ? normalizedQuery : '');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const requestSequence = useRef(0);
  const loadedInitialDivision = useRef(false);
  const canManageScoreboard = can('scoreboard_manage');
  const chartSeries = useMemo(
    () =>
      buildScoreHistorySeries(
        history?.series ?? [],
        selfCompetitorId ? new Set([selfCompetitorId]) : new Set()
      ),
    [history?.series, selfCompetitorId]
  );
  const latestHistoryTimestamp = Math.max(
    ...chartSeries.flatMap((series) => series.points.map((point) => point.x)),
    0
  );
  const sparklineByCompetitor = useMemo(() => {
    return new Map(
      chartSeries.map((series) => [series.id, buildSparklineSeries(series, latestHistoryTimestamp)])
    );
  }, [chartSeries, latestHistoryTimestamp]);
  const filteredRows = useMemo(() => {
    return filterScoreboardRows(scoreboard?.rows ?? [], deferredQuery);
  }, [deferredQuery, scoreboard?.rows]);

  const updateUrl = useCallback(
    (nextSearch: string, nextDivisionId: string | null) => {
      const next = new URLSearchParams(searchParams?.toString() ?? '');

      if (nextSearch.trim().length >= 2) {
        next.set('search', nextSearch.trim());
      } else {
        next.delete('search');
      }

      if (nextDivisionId) {
        next.set('division', nextDivisionId);
      } else {
        next.delete('division');
      }

      const serialized = next.toString();
      router.replace(serialized ? `${pathname}?${serialized}` : pathname, {
        scroll: false
      });
    },
    [pathname, router, searchParams]
  );

  const columns = useMemo<ColumnDef<ScoreboardRow>[]>(
    () => [
      {
        accessorKey: 'rank',
        cell: (context) => (
          <Badge tone={rankTone(context.getValue<number>())}>#{context.getValue<number>()}</Badge>
        ),
        header: 'Rank'
      },
      {
        accessorKey: 'name',
        cell: (context) => {
          const kind = parseCompetitorKind(context.row.original.competitor_kind);

          return (
            <span className="grid gap-1">
              <span className="flex flex-wrap items-center gap-2">
                {kind ? (
                  <Link
                    href={competitorProfileHref(kind, context.row.original.competitor_id)}
                    tone="current"
                  >
                    {context.row.original.name}
                  </Link>
                ) : (
                  <span className="font-medium">{context.row.original.name}</span>
                )}
                {context.row.original.competitor_id === selfCompetitorId ? (
                  <Badge tone="success">You</Badge>
                ) : null}
              </span>
              <span className="text-xs text-text-muted">
                {competitorKind(context.row.original.competitor_kind)}
              </span>
            </span>
          );
        },
        header: 'Competitor'
      },
      {
        accessorKey: 'solves',
        cell: (context) => context.getValue<number>(),
        header: 'Solves'
      },
      {
        accessorKey: 'score',
        cell: (context) => context.getValue<number>(),
        header: 'Score'
      },
      {
        id: 'trend',
        cell: (context) => {
          const series = sparklineByCompetitor.get(context.row.original.competitor_id);
          return series ? <Sparkline interpolation="step" series={series} /> : null;
        },
        header: '12-hour trend'
      }
    ],
    [selfCompetitorId, sparklineByCompetitor]
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns non-memoizable helpers by design.
  const table = useReactTable({
    columns,
    data: filteredRows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.competitor_id
  });

  const load = useCallback(async (nextEventId: string, nextDivisionId: string | null) => {
    const requestId = ++requestSequence.current;
    setIsLoading(true);
    setError(null);

    try {
      const [scoreboardResult, historyResult, divisionResult] = await Promise.all([
        api.GET('/api/v1/events/{event_id}/scoreboard', {
          params: {
            path: {
              event_id: nextEventId
            },
            query: {
              division_id: nextDivisionId
            }
          }
        }),
        api.GET('/api/v1/events/{event_id}/score-history', {
          params: {
            path: {
              event_id: nextEventId
            },
            query: {
              division_id: nextDivisionId,
              limit: 20
            }
          }
        }),
        api.GET('/api/v1/events/{event_id}/divisions', {
          params: {
            path: {
              event_id: nextEventId
            }
          }
        })
      ]);

      if (requestId !== requestSequence.current) {
        return;
      }

      if (!scoreboardResult.data || !historyResult.data) {
        setError(
          errorMessage(
            scoreboardResult.error ?? historyResult.error,
            'The scoreboard could not be loaded.'
          )
        );
        return;
      }

      setScoreboard(scoreboardResult.data);
      setHistory(historyResult.data);
      setDivisions(divisionResult.data ?? []);
    } catch {
      if (requestId === requestSequence.current) {
        setError('The scoreboard could not be loaded. Check your connection and retry.');
      }
    } finally {
      if (requestId === requestSequence.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    function handleSearchShortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }

    window.addEventListener('keydown', handleSearchShortcut);
    return () => {
      window.removeEventListener('keydown', handleSearchShortcut);
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id;

    if (!selectedEvent || !userId) {
      setSelfCompetitorId(null);
      return;
    }

    setSelfCompetitorId(userId);

    if (selectedEvent.participation !== 'team') {
      return;
    }

    let active = true;

    void api
      .GET('/api/v1/events/{event_id}/competitors/{competitor_kind}/{competitor_id}', {
        params: {
          path: {
            competitor_id: userId,
            competitor_kind: 'user',
            event_id: selectedEvent.id
          }
        }
      })
      .then((result) => {
        const teamId = result.data?.teams[0]?.team_id;

        if (active && teamId) {
          setSelfCompetitorId(teamId);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [selectedEvent, session?.user.id]);

  useEffect(() => {
    if (
      loadedInitialDivision.current ||
      !divisionId ||
      !selectedEventId ||
      selectedEventId !== eventId
    ) {
      return;
    }

    loadedInitialDivision.current = true;
    void load(selectedEventId, divisionId);
  }, [divisionId, eventId, load, selectedEventId]);

  useEffect(() => {
    if (selectedEventId === eventId) {
      return;
    }

    setEventId(selectedEventId);
    setDivisionId(null);
    setDivisions([]);
    setScoreboard(null);
    setHistory(null);

    if (!selectedEventId) {
      requestSequence.current += 1;
      setError(null);
      return;
    }

    void load(selectedEventId, null);
  }, [eventId, load, selectedEventId]);

  useEffect(() => {
    if (
      !latest ||
      !selectedEventId ||
      latest.event_id !== selectedEventId ||
      (latest.event.type !== 'score_changed' && latest.event.type !== 'scoreboard_control_changed')
    ) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      void load(selectedEventId, divisionId);
    }, 150);

    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [divisionId, latest, load, selectedEventId]);

  if (!selectedEvent) {
    return (
      <EmptyState description="Choose an event from the navigation." title="No event selected" />
    );
  }

  if (selectedEvent.id !== eventId) {
    return <ScoreboardLoading />;
  }

  if (isLoading && (!scoreboard || !history)) {
    return <ScoreboardLoading />;
  }

  if (error && (!scoreboard || !history)) {
    return (
      <Alert
        actions={
          <Button
            onPress={() => {
              void load(selectedEvent.id, divisionId);
            }}
            size="small"
            tone="secondary"
          >
            Retry
          </Button>
        }
        title={error}
        tone="danger"
      />
    );
  }

  if (!scoreboard || !history) {
    return (
      <EmptyState
        description="Standings will appear when scoring is available."
        title="No scoreboard"
      />
    );
  }

  if (scoreboard.hidden && !canManageScoreboard) {
    return (
      <Alert
        description="Standings are not public for this event."
        title="Scoreboard hidden"
        tone="info"
      />
    );
  }

  const leadingScore = scoreboard.rows[0]?.score ?? 0;
  const solvedChallenges = scoreboard.rows.reduce((total, row) => total + row.solves, 0);
  const selfStanding = selfCompetitorId
    ? (scoreboard.rows.find((row) => row.competitor_id === selfCompetitorId) ?? null)
    : null;
  return (
    <div aria-busy={isLoading} className="grid gap-8">
      <section
        aria-label="Event scoreboard status"
        className="border-l-2 border-accent bg-surface-raised px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-1">
            <strong className="text-sm font-semibold text-text">{selectedEvent.name}</strong>
            <span className="text-xs text-text-muted">{eventPhase(selectedEvent.state)}</span>
          </div>
          <StatusIndicator
            label={scoreboard.frozen ? 'Frozen' : scoreboard.hidden ? 'Hidden' : 'Public'}
            tone={scoreboard.frozen ? 'warning' : scoreboard.hidden ? 'neutral' : 'success'}
          />
        </div>
      </section>

      {scoreboard.hidden ? (
        <Alert
          description="Organizers can inspect live standings while competitors see the hidden state."
          title="Scoreboard hidden"
          tone="info"
        />
      ) : null}
      {error ? (
        <Alert
          actions={
            <Button
              onPress={() => {
                void load(selectedEvent.id, divisionId);
              }}
              size="small"
              tone="secondary"
            >
              Retry
            </Button>
          }
          title={error}
          tone="danger"
        />
      ) : null}
      {scoreboard.frozen ? (
        <Alert
          description={
            canManageScoreboard
              ? 'Organizer standings include scores withheld from competitors.'
              : 'New scores remain concealed until the board is released.'
          }
          title="Scoreboard frozen"
          tone="warning"
        />
      ) : null}

      <div className="grid gap-4">
        <div className="flex flex-wrap gap-6 border-y border-border-subtle py-3">
          <span className="grid gap-1">
            <span className="text-xs font-semibold text-text-muted">Competitors</span>
            <strong className="text-lg tabular-nums text-text">{scoreboard.rows.length}</strong>
          </span>
          <span className="grid gap-1">
            <span className="text-xs font-semibold text-text-muted">Accepted solves</span>
            <strong className="text-lg tabular-nums text-text">{solvedChallenges}</strong>
          </span>
          <span className="grid gap-1">
            <span className="text-xs font-semibold text-text-muted">Leading score</span>
            <strong className="text-lg tabular-nums text-text">{leadingScore}</strong>
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SearchField
            className="w-full max-w-auth"
            description="Press Command or Control F to focus search."
            inputRef={searchInputRef}
            label="Find competitor"
            onChange={(value) => {
              setQuery(value);
              updateUrl(value, divisionId);
            }}
            placeholder="Team or competitor"
            value={query}
          />
          <div className="flex flex-wrap items-end gap-2">
            {divisions.length > 0 ? (
              <Select
                className="min-w-menu"
                isDisabled={isLoading}
                label="Division"
                onSelectionChange={(key) => {
                  const nextDivisionId = String(key) === 'all' ? null : String(key);
                  setDivisionId(nextDivisionId);
                  updateUrl(query, nextDivisionId);
                  void load(selectedEvent.id, nextDivisionId);
                }}
                options={[
                  {
                    id: 'all',
                    label: 'All divisions'
                  },
                  ...divisions.map((division) => ({
                    id: division.id,
                    label: division.name
                  }))
                ]}
                selectedKey={divisionId ?? 'all'}
              />
            ) : null}
            <ScoreboardExport
              eventName={selectedEvent.name}
              history={history}
              rows={filteredRows}
            />
            <Button
              isLoading={isLoading}
              onPress={() => {
                void load(selectedEvent.id, divisionId);
              }}
              size="small"
              tone="secondary"
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {selfStanding ? (
        <section
          aria-label="Your standing"
          className="grid gap-4 border-l-4 border-success bg-success-subtle px-4 py-3 sm:grid-cols-4"
        >
          <span className="grid gap-1 sm:col-span-2">
            <span className="text-xs font-semibold text-success-text">Your standing</span>
            <Link
              href={competitorProfileHref(
                parseCompetitorKind(selfStanding.competitor_kind) ?? 'user',
                selfStanding.competitor_id
              )}
              tone="current"
            >
              {selfStanding.name}
            </Link>
          </span>
          <span className="grid gap-1">
            <span className="text-xs text-success-text">Rank</span>
            <strong className="text-lg tabular-nums text-text">#{selfStanding.rank}</strong>
          </span>
          <span className="grid gap-1">
            <span className="text-xs text-success-text">Score</span>
            <strong className="text-lg tabular-nums text-text">
              {selfStanding.score.toLocaleString()} pts
            </strong>
          </span>
        </section>
      ) : null}

      <section className="grid gap-4" aria-labelledby="score-history-title">
        <h2
          className="m-0 font-display text-xl font-semibold tracking-tight text-text"
          id="score-history-title"
        >
          Score history
        </h2>
        <ScoreHistoryChart
          activeCompetitorId={activeCompetitorId}
          emphasizedCompetitorId={selfCompetitorId}
          eventStart={selectedEvent.starts_at}
          history={history}
          onActiveCompetitorChange={setActiveCompetitorId}
        />
      </section>

      <section className="grid gap-4" aria-labelledby="ranked-scoreboard-title">
        <h2
          className="m-0 font-display text-xl font-semibold tracking-tight text-text"
          id="ranked-scoreboard-title"
        >
          Rankings
          <span className="ml-3 text-sm font-normal text-text-muted">
            {filteredRows.length} shown
          </span>
        </h2>
        <Table
          aria-label="Ranked scoreboard"
          wrapperClassName="max-h-workspace overflow-y-auto"
          wrapperLabel="Scrollable ranked scoreboard"
        >
          <TableHeader>
            <TableColumn className="text-right">Rank</TableColumn>
            <TableColumn isRowHeader>Competitor</TableColumn>
            <TableColumn className="text-right">Solves</TableColumn>
            <TableColumn className="text-right">Score</TableColumn>
            <TableColumn>Trend</TableColumn>
          </TableHeader>
          <TableBody
            emptyState={
              deferredQuery ? 'No competitors match this search.' : 'No accepted solves yet.'
            }
          >
            {table.getRowModel().rows.map((row) => {
              const isSelf = selfCompetitorId === row.original.competitor_id;

              return (
                <TableRow
                  aria-current={isSelf ? 'true' : undefined}
                  className={
                    activeCompetitorId === row.original.competitor_id
                      ? 'bg-accent-subtle'
                      : isSelf
                        ? 'bg-success-subtle'
                        : 'hover:bg-surface'
                  }
                  data-pin={isSelf ? 'viewport' : undefined}
                  id={row.id}
                  key={row.id}
                  onHoverEnd={() => {
                    setActiveCompetitorId(null);
                  }}
                  onHoverStart={() => {
                    setActiveCompetitorId(row.original.competitor_id);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      className={`${isSelf ? 'sticky top-0 bottom-0 z-20 bg-success-subtle' : ''} ${
                        cell.column.id === 'rank' ||
                        cell.column.id === 'solves' ||
                        cell.column.id === 'score'
                          ? 'text-right'
                          : ''
                      }`}
                      key={cell.id}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
