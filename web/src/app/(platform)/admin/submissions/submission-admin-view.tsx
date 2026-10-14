'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { useEvent } from '../../../event-context';
import { useSession } from '../../../session-context';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogTrigger,
  EmptyState,
  Link,
  SearchField,
  Select,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow
} from '@/components/ui';
import { api, type AuditEntry, type AuditPage, type AuditQuery } from '@/lib/api/client';
import { metadataEntries, shortIdentifier } from '@/lib/audit-format';
import { competitorProfileHref } from '@/lib/competitors';

interface SubmissionAdminViewProps {
  initialError: string | null;
  initialPage: AuditPage | null;
}

interface SubmissionProjection {
  accepted: boolean | null;
  challengeId: string;
  competitorId: string | null;
  competitorKind: 'team' | 'user' | null;
  outcome: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function submissionProjection(entry: AuditEntry): SubmissionProjection {
  const metadata = record(entry.metadata);
  const data = record(metadata?.data) ?? metadata;
  const competitor = record(data?.competitor);
  const kind = competitor?.kind;
  const outcome = typeof data?.outcome === 'string' ? data.outcome : '';
  const accepted = typeof data?.accepted === 'boolean' ? data.accepted : null;

  return {
    accepted,
    challengeId: typeof data?.challenge_id === 'string' ? data.challenge_id : entry.resource_id,
    competitorId: typeof competitor?.id === 'string' ? competitor.id : (entry.actor_id ?? null),
    competitorKind: kind === 'team' || kind === 'user' ? kind : null,
    outcome:
      entry.action === 'submission.review'
        ? accepted
          ? 'correct'
          : 'discarded'
        : outcome || 'recorded'
  };
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(new Date(value));
}

function outcomeTone(outcome: string): 'danger' | 'info' | 'neutral' | 'success' | 'warning' {
  if (outcome === 'correct') {
    return 'success';
  }

  if (outcome === 'incorrect' || outcome === 'discarded') {
    return 'danger';
  }

  if (outcome === 'pending') {
    return 'warning';
  }

  if (outcome === 'reviewed') {
    return 'info';
  }

  return 'neutral';
}

function SubmissionDetails({ entry }: { entry: AuditEntry }) {
  const projection = submissionProjection(entry);
  const entries = metadataEntries(record(entry.metadata) ?? {});

  return (
    <div className="grid gap-4">
      <dl className="m-0 grid gap-3 text-sm sm:grid-cols-2">
        <div className="grid gap-1">
          <dt className="text-text-muted">Submission</dt>
          <dd className="m-0 break-all font-mono text-xs text-text">{entry.resource_id}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-text-muted">Challenge</dt>
          <dd className="m-0 break-all font-mono text-xs text-text">{projection.challengeId}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-text-muted">Correlation</dt>
          <dd className="m-0 break-all font-mono text-xs text-text">{entry.correlation_id}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-text-muted">Network address</dt>
          <dd className="m-0 text-text-muted">Not included in the audit projection</dd>
        </div>
      </dl>
      {entries.length > 0 ? (
        <dl className="m-0 grid gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-4 text-sm">
          {entries.map(([key, value]) => (
            <div className="grid gap-1" key={key}>
              <dt className="font-mono text-xs text-text-muted">{key}</dt>
              <dd className="m-0 break-all text-text">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function SubmissionAdminView({ initialError, initialPage }: SubmissionAdminViewProps) {
  const { challenges, events, selectedEvent } = useEvent();
  const { can } = useSession();
  const searchParams = useSearchParams();
  const initialKind = searchParams?.get('kind');
  const [entries, setEntries] = useState(initialPage?.entries ?? []);
  const [nextCursor, setNextCursor] = useState(initialPage?.next_cursor ?? null);
  const [error, setError] = useState(initialError);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState(searchParams?.get('search') ?? '');
  const [outcome, setOutcome] = useState('all');
  const [competitorKind, setCompetitorKind] = useState(
    initialKind === 'team' || initialKind === 'user' ? initialKind : 'all'
  );
  const challengeNames = useMemo(
    () => new Map(challenges.map((challenge) => [challenge.id, challenge.name])),
    [challenges]
  );
  const eventNames = new Map(events.map((event) => [event.id, event.name]));
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return entries.filter((entry) => {
      const projection = submissionProjection(entry);
      const challengeName = challengeNames.get(projection.challengeId) ?? '';
      const matchesEvent = !selectedEvent || entry.event_id === selectedEvent.id;
      const matchesOutcome = outcome === 'all' || projection.outcome === outcome;
      const matchesKind = competitorKind === 'all' || projection.competitorKind === competitorKind;
      const matchesQuery =
        !normalizedQuery ||
        [
          challengeName,
          projection.challengeId,
          projection.competitorId ?? '',
          entry.resource_id,
          projection.outcome
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));

      return matchesEvent && matchesOutcome && matchesKind && matchesQuery;
    });
  }, [challengeNames, competitorKind, entries, outcome, query, selectedEvent]);

  async function load(append: boolean, cursor?: string) {
    setIsLoading(true);
    setError(null);

    const apiQuery: AuditQuery = {
      limit: 50,
      resource_type: 'submission'
    };

    if (cursor) {
      apiQuery.cursor = cursor;
    }

    if (selectedEvent) {
      apiQuery.event_id = selectedEvent.id;
    }

    try {
      const result = await api.GET('/api/v1/audit', {
        params: {
          query: apiQuery
        }
      });

      if (!result.data) {
        setError('Submission history could not be loaded.');
        return;
      }

      setEntries((current) =>
        append ? [...current, ...result.data.entries] : result.data.entries
      );
      setNextCursor(result.data.next_cursor ?? null);
    } catch {
      setError('Submission history could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }

  if (!can('audit_read')) {
    return <Alert title="Submission history is unavailable for this account." tone="danger" />;
  }

  return (
    <div aria-busy={isLoading} className="grid gap-6">
      <div className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4 lg:grid-cols-3">
        <SearchField
          label="Find submission"
          onChange={setQuery}
          placeholder="Challenge, competitor, or submission"
          value={query}
        />
        <Select
          label="Result"
          onSelectionChange={(key) => {
            setOutcome(String(key));
          }}
          options={[
            {
              id: 'all',
              label: 'All results'
            },
            {
              id: 'correct',
              label: 'Correct'
            },
            {
              id: 'incorrect',
              label: 'Incorrect'
            },
            {
              id: 'pending',
              label: 'Pending'
            },
            {
              id: 'discarded',
              label: 'Discarded'
            },
            {
              id: 'recorded',
              label: 'Recorded'
            }
          ]}
          selectedKey={outcome}
        />
        <Select
          label="Competitor"
          onSelectionChange={(key) => {
            setCompetitorKind(String(key));
          }}
          options={[
            {
              id: 'all',
              label: 'Teams and individuals'
            },
            {
              id: 'team',
              label: 'Teams'
            },
            {
              id: 'user',
              label: 'Individuals'
            }
          ]}
          selectedKey={competitorKind}
        />
      </div>

      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void load(false);
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{filteredEntries.length} shown</Badge>
          {selectedEvent ? <Badge tone="accent">{selectedEvent.name}</Badge> : null}
        </div>
        <Button
          isLoading={isLoading}
          onPress={() => {
            void load(false);
          }}
          size="small"
          tone="secondary"
        >
          Refresh
        </Button>
      </div>

      {filteredEntries.length === 0 && !isLoading ? (
        <EmptyState
          description="Adjust the filters or wait for the next submission."
          title="No submissions"
        />
      ) : (
        <Table aria-label="Submission history">
          <TableHeader>
            <TableColumn className="text-right">Time</TableColumn>
            <TableColumn isRowHeader>Challenge</TableColumn>
            <TableColumn>Competitor</TableColumn>
            <TableColumn>Kind</TableColumn>
            <TableColumn>Result</TableColumn>
            <TableColumn>Details</TableColumn>
          </TableHeader>
          <TableBody emptyState="No submissions.">
            {filteredEntries.map((entry) => {
              const projection = submissionProjection(entry);
              const challengeName =
                challengeNames.get(projection.challengeId) ??
                shortIdentifier(projection.challengeId);

              return (
                <TableRow id={entry.id} key={entry.id}>
                  <TableCell className="text-right text-text-muted">
                    <time dateTime={entry.occurred_at}>{formatTimestamp(entry.occurred_at)}</time>
                  </TableCell>
                  <TableCell>
                    <span className="grid gap-1">
                      <span className="font-medium text-text">{challengeName}</span>
                      <span className="font-mono text-xs text-text-muted">
                        {shortIdentifier(projection.challengeId)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {projection.competitorId && projection.competitorKind ? (
                      <Link
                        href={competitorProfileHref(
                          projection.competitorKind,
                          projection.competitorId
                        )}
                      >
                        {shortIdentifier(projection.competitorId)}
                      </Link>
                    ) : (
                      <span className="text-text-muted">
                        {shortIdentifier(projection.competitorId)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{projection.competitorKind ?? 'Unknown'}</TableCell>
                  <TableCell>
                    <Badge tone={outcomeTone(projection.outcome)}>{projection.outcome}</Badge>
                  </TableCell>
                  <TableCell>
                    <DialogTrigger>
                      <Button size="small" tone="quiet">
                        Inspect
                      </Button>
                      <Dialog
                        description={`${eventNames.get(entry.event_id ?? '') ?? 'Event'} at ${formatTimestamp(entry.occurred_at)}`}
                        title={`${challengeName} submission`}
                      >
                        <SubmissionDetails entry={entry} />
                      </Dialog>
                    </DialogTrigger>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            isLoading={isLoading}
            onPress={() => {
              void load(true, nextCursor);
            }}
            tone="secondary"
          >
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
