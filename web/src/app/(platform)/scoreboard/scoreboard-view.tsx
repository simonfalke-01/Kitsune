'use client';

import { flexRender, getCoreRowModel, type ColumnDef, useReactTable } from '@tanstack/react-table';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useEvent } from '../../event-context';
import { useRealtime } from '../../realtime-context';
import { useSession } from '../../session-context';
import {
  Alert,
  Button,
  EmptyState,
  Select,
  Skeleton,
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
import { buildScoreChartModel, scoreChartPath } from '@/lib/scoreboard';

interface ScoreboardViewProps {
  initialDivisions: DivisionSummary[];
  initialError: string | null;
  initialEventId: string | null;
  initialHistory: ScoreHistory | null;
  initialScoreboard: Scoreboard | null;
}

const historyTones = [
  {
    line: 'stroke-accent',
    swatch: 'bg-accent'
  },
  {
    line: 'stroke-success',
    swatch: 'bg-success'
  },
  {
    line: 'stroke-warning',
    swatch: 'bg-warning'
  },
  {
    line: 'stroke-danger',
    swatch: 'bg-danger'
  },
  {
    line: 'stroke-info',
    swatch: 'bg-info'
  }
] as const;

function historyTone(index: number): (typeof historyTones)[number] {
  return historyTones[index % historyTones.length] ?? historyTones[0];
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

function ScoreHistoryChart({ history }: { history: ScoreHistory }) {
  const titleId = useId();
  const descriptionId = useId();
  const model = useMemo(() => buildScoreChartModel(history.series), [history.series]);
  const accessiblePoints = useMemo(() => {
    return history.series
      .flatMap((series) => {
        return series.points.map((point) => ({
          competitorId: series.competitor_id,
          name: series.name,
          point
        }));
      })
      .slice(-100);
  }, [history.series]);

  if (model.series.length === 0 || model.series.every((series) => series.points.length === 0)) {
    return (
      <EmptyState
        className="p-6"
        description="Score changes will appear after the first accepted solve."
        title="No score history"
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div
        aria-label="Scrollable score history chart"
        className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised"
        role="region"
        tabIndex={0}
      >
        <svg
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          className="block min-w-prose w-full"
          role="img"
          viewBox="0 0 800 320"
        >
          <title id={titleId}>Score history</title>
          <desc id={descriptionId}>
            Running score totals for the leading competitors in this event.
          </desc>
          {[32, 96, 160, 224, 288].map((position) => (
            <line
              className="stroke-border-subtle"
              key={position}
              x1="32"
              x2="768"
              y1={position}
              y2={position}
            />
          ))}
          <text className="fill-text-muted text-xs" x="32" y="24">
            {model.maxScore}
          </text>
          <text className="fill-text-muted text-xs" x="32" y="312">
            {model.minScore}
          </text>
          {model.series.map((series, index) => (
            <path
              className={`${historyTone(index).line} fill-none`}
              d={scoreChartPath(series.points)}
              key={series.competitorId}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
            />
          ))}
        </svg>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
        {history.series.map((series, index) => (
          <li className="flex min-w-0 items-center gap-3 text-sm" key={series.competitor_id}>
            <span
              aria-hidden
              className={`h-1 w-6 shrink-0 rounded-sm ${historyTone(index).swatch}`}
            />
            <span className="min-w-0 flex-1 truncate text-text">{series.name}</span>
            <span className="shrink-0 tabular-nums text-text-muted">
              {series.points.at(-1)?.score ?? 0}
            </span>
          </li>
        ))}
      </ul>
      <ol className="sr-only">
        {accessiblePoints.map(({ competitorId, name, point }) => (
          <li key={`${competitorId}-${point.sequence}`}>
            {name}: {point.score} points at {point.occurred_at}
          </li>
        ))}
      </ol>
    </div>
  );
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
  const { selectedEvent } = useEvent();
  const { latest } = useRealtime();
  const { can } = useSession();
  const selectedEventId = selectedEvent?.id ?? null;
  const [eventId, setEventId] = useState(initialEventId);
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [divisions, setDivisions] = useState(initialDivisions);
  const [scoreboard, setScoreboard] = useState(initialScoreboard);
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState(initialError);
  const [isLoading, setIsLoading] = useState(false);
  const requestSequence = useRef(0);
  const canManageScoreboard = can('scoreboard_manage');

  const columns = useMemo<ColumnDef<ScoreboardRow>[]>(
    () => [
      {
        accessorKey: 'rank',
        cell: (context) => context.getValue<number>(),
        header: 'Rank'
      },
      {
        accessorKey: 'name',
        cell: (context) => (
          <span className="grid gap-1">
            <span className="font-medium">{context.row.original.name}</span>
            <span className="text-xs text-text-muted">
              {competitorKind(context.row.original.competitor_kind)}
            </span>
          </span>
        ),
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
      }
    ],
    []
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns non-memoizable helpers by design.
  const table = useReactTable({
    columns,
    data: scoreboard?.rows ?? [],
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
              limit: 5
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

      <div className="flex flex-wrap items-end justify-between gap-4">
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
        <div className="flex flex-wrap items-end gap-2">
          {divisions.length > 0 ? (
            <Select
              className="min-w-menu"
              isDisabled={isLoading}
              label="Division"
              onSelectionChange={(key) => {
                const nextDivisionId = String(key) === 'all' ? null : String(key);
                setDivisionId(nextDivisionId);
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

      <section className="grid gap-4" aria-labelledby="ranked-scoreboard-title">
        <h2
          className="m-0 font-display text-xl font-semibold tracking-tight text-text"
          id="ranked-scoreboard-title"
        >
          Rankings
        </h2>
        <Table aria-label="Ranked scoreboard">
          <TableHeader>
            <TableColumn className="text-right">Rank</TableColumn>
            <TableColumn isRowHeader>Competitor</TableColumn>
            <TableColumn className="text-right">Solves</TableColumn>
            <TableColumn className="text-right">Score</TableColumn>
          </TableHeader>
          <TableBody emptyState="No accepted solves yet.">
            {table.getRowModel().rows.map((row) => (
              <TableRow className="hover:bg-surface" id={row.id} key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    className={
                      cell.column.id === 'rank' ||
                      cell.column.id === 'solves' ||
                      cell.column.id === 'score'
                        ? 'text-right'
                        : undefined
                    }
                    key={cell.id}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="grid gap-4" aria-labelledby="score-history-title">
        <h2
          className="m-0 font-display text-xl font-semibold tracking-tight text-text"
          id="score-history-title"
        >
          Score history
        </h2>
        <ScoreHistoryChart history={history} />
      </section>
    </div>
  );
}
