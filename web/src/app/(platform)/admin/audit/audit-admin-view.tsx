'use client';

import { useState } from 'react';

import { useEvent } from '../../../event-context';
import { useSession } from '../../../session-context';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  Select,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TextField
} from '@/components/ui';
import { api, type AuditEntry, type AuditPage, type AuditQuery } from '@/lib/api/client';
import { humanizeAuditAction, metadataEntries, shortIdentifier } from '@/lib/audit-format';

interface AuditAdminViewProps {
  initialError: string | null;
  initialPage: AuditPage | null;
}

interface AuditFilters {
  action: string;
  actorId: string;
  eventId: string;
  resourceType: string;
}

const initialFilters: AuditFilters = {
  action: '',
  actorId: '',
  eventId: 'all',
  resourceType: ''
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium'
  }).format(new Date(value));
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  return {
    value: metadata
  };
}

function AuditDetails({ entry }: { entry: AuditEntry }) {
  const entries = metadataEntries(metadataRecord(entry.metadata));

  return (
    <div className="grid gap-4">
      <dl className="grid gap-3 text-sm">
        <div className="grid gap-1">
          <dt className="text-text-muted">Correlation ID</dt>
          <dd className="m-0 break-all font-mono text-xs text-text">{entry.correlation_id}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-text-muted">Resource ID</dt>
          <dd className="m-0 break-all font-mono text-xs text-text">{entry.resource_id}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-text-muted">Entry ID</dt>
          <dd className="m-0 break-all font-mono text-xs text-text">{entry.id}</dd>
        </div>
      </dl>
      {entries.length > 0 ? (
        <dl className="grid gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-4 text-sm">
          {entries.map(([key, value]) => (
            <div className="grid gap-1" key={key}>
              <dt className="font-mono text-xs text-text-muted">{key}</dt>
              <dd className="m-0 break-all text-text">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="m-0 text-sm text-text-muted">No structured metadata.</p>
      )}
    </div>
  );
}

export function AuditAdminView({ initialError, initialPage }: AuditAdminViewProps) {
  const { events } = useEvent();
  const { can } = useSession();
  const [entries, setEntries] = useState(initialPage?.entries ?? []);
  const [nextCursor, setNextCursor] = useState(initialPage?.next_cursor ?? null);
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [error, setError] = useState(initialError);
  const [isLoading, setIsLoading] = useState(false);
  const eventNames = new Map(events.map((event) => [event.id, event.name]));

  const load = async ({
    append,
    cursor,
    nextFilters
  }: {
    append: boolean;
    cursor?: string;
    nextFilters: AuditFilters;
  }) => {
    setIsLoading(true);
    setError(null);

    const query: AuditQuery = {
      limit: 50
    };

    if (cursor) {
      query.cursor = cursor;
    }
    if (nextFilters.action.trim()) {
      query.action = nextFilters.action.trim();
    }
    if (nextFilters.actorId.trim()) {
      query.actor_id = nextFilters.actorId.trim();
    }
    if (nextFilters.eventId !== 'all') {
      query.event_id = nextFilters.eventId;
    }
    if (nextFilters.resourceType.trim()) {
      query.resource_type = nextFilters.resourceType.trim();
    }

    try {
      const result = await api.GET('/api/v1/audit', {
        params: {
          query
        }
      });

      if (!result.data) {
        setError('Audit history could not be loaded.');
        return;
      }

      setEntries((current) =>
        append ? [...current, ...result.data.entries] : result.data.entries
      );
      setNextCursor(result.data.next_cursor ?? null);
      setAppliedFilters(nextFilters);
    } catch {
      setError('Audit history could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!can('audit_read')) {
    return <Alert title="Audit history is unavailable for this account." tone="danger" />;
  }

  return (
    <div aria-busy={isLoading} className="grid gap-8">
      <Form
        className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void load({
            append: false,
            nextFilters: filters
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Action"
            onChange={(value) => {
              setFilters((current) => ({
                ...current,
                action: value
              }));
            }}
            value={filters.action}
          />
          <TextField
            label="Resource type"
            onChange={(value) => {
              setFilters((current) => ({
                ...current,
                resourceType: value
              }));
            }}
            value={filters.resourceType}
          />
          <TextField
            label="Actor ID"
            onChange={(value) => {
              setFilters((current) => ({
                ...current,
                actorId: value
              }));
            }}
            value={filters.actorId}
          />
          <Select
            label="Event"
            onSelectionChange={(key) => {
              setFilters((current) => ({
                ...current,
                eventId: String(key)
              }));
            }}
            options={[
              {
                id: 'all',
                label: 'All events'
              },
              ...events.map((event) => ({
                id: event.id,
                label: event.name
              }))
            ]}
            selectedKey={filters.eventId}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button isLoading={isLoading} type="submit">
            Apply filters
          </Button>
          <Button
            isDisabled={isLoading}
            onPress={() => {
              setFilters(initialFilters);
              void load({
                append: false,
                nextFilters: initialFilters
              });
            }}
            tone="quiet"
          >
            Clear
          </Button>
        </div>
      </Form>

      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void load({
                  append: false,
                  nextFilters: appliedFilters
                });
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
        <Badge>{entries.length} entries</Badge>
        <Button
          isLoading={isLoading}
          onPress={() => {
            void load({
              append: false,
              nextFilters: appliedFilters
            });
          }}
          size="small"
          tone="secondary"
        >
          Refresh
        </Button>
      </div>

      {entries.length === 0 && !isLoading ? (
        <EmptyState
          description="Adjust the filters or wait for the next audited action."
          title="No audit entries"
        />
      ) : (
        <Table aria-label="Audit history">
          <TableHeader>
            <TableColumn isRowHeader>Action</TableColumn>
            <TableColumn>Resource</TableColumn>
            <TableColumn>Actor</TableColumn>
            <TableColumn>Event</TableColumn>
            <TableColumn>Occurred</TableColumn>
            <TableColumn>Details</TableColumn>
          </TableHeader>
          <TableBody emptyState="No audit entries.">
            {entries.map((entry) => (
              <TableRow id={entry.id} key={entry.id}>
                <TableCell>
                  <span className="grid gap-1">
                    <span className="font-medium text-text">
                      {humanizeAuditAction(entry.action)}
                    </span>
                    <span className="font-mono text-xs text-text-muted">{entry.action}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="grid gap-1">
                    <span>{entry.resource_type}</span>
                    <span className="font-mono text-xs text-text-muted">
                      {shortIdentifier(entry.resource_id)}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs">{shortIdentifier(entry.actor_id)}</span>
                </TableCell>
                <TableCell>
                  {entry.event_id ? (eventNames.get(entry.event_id) ?? 'Event') : 'Organization'}
                </TableCell>
                <TableCell>{formatTimestamp(entry.occurred_at)}</TableCell>
                <TableCell>
                  <DialogTrigger>
                    <Button size="small" tone="quiet">
                      Inspect
                    </Button>
                    <Dialog
                      description={`${entry.resource_type} at ${formatTimestamp(entry.occurred_at)}`}
                      title={humanizeAuditAction(entry.action)}
                    >
                      <AuditDetails entry={entry} />
                    </Dialog>
                  </DialogTrigger>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button
            isLoading={isLoading}
            onPress={() => {
              void load({
                append: true,
                cursor: nextCursor,
                nextFilters: appliedFilters
              });
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
