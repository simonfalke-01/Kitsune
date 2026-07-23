'use client';

import { useState } from 'react';

import { useEvent } from '../../event-context';
import { useRealtime } from '../../realtime-context';
import { useSession } from '../../session-context';
import {
  Alert,
  Button,
  EmptyState,
  Select,
  StatusIndicator,
  Switch,
  showToast
} from '@/components/ui';
import {
  api,
  errorMessage,
  type EventSummary,
  type HealthSummary,
  type ReadinessSummary
} from '@/lib/api/client';

interface AdminViewProps {
  initialError: string | null;
  initialHealth: HealthSummary | null;
  initialReadiness: ReadinessSummary | null;
}

const lifecycleOptions = [
  {
    id: 'draft',
    label: 'Draft'
  },
  {
    id: 'scheduled',
    label: 'Scheduled'
  },
  {
    id: 'live',
    label: 'Live'
  },
  {
    id: 'paused',
    label: 'Paused'
  },
  {
    id: 'ended',
    label: 'Ended'
  },
  {
    id: 'archived',
    label: 'Archived'
  }
] as const;

function EventControls({ event }: { event: EventSummary }) {
  const { refresh } = useEvent();
  const { session } = useSession();
  const [state, setState] = useState(event.state);
  const [scoreboardHidden, setScoreboardHidden] = useState(event.scoreboard_hidden);
  const [scoreboardFrozen, setScoreboardFrozen] = useState(event.scoreboard_frozen);
  const [pendingAction, setPendingAction] = useState<'scoreboard' | 'state' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateState = async () => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction('state');
    setError(null);

    try {
      const result = await api.PATCH('/api/v1/events/{event_id}/state', {
        body: {
          state: state as 'archived' | 'draft' | 'ended' | 'live' | 'paused' | 'scheduled'
        },
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            event_id: event.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The event state could not be changed.'));
        return;
      }

      await refresh();
      showToast({
        title: 'Event state updated',
        tone: 'success'
      });
    } catch {
      setError('The event state could not be changed. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  const updateScoreboard = async () => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction('scoreboard');
    setError(null);

    try {
      const result = await api.PATCH('/api/v1/events/{event_id}/scoreboard-controls', {
        body: {
          frozen: scoreboardFrozen,
          hidden: scoreboardHidden
        },
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            event_id: event.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'Scoreboard controls could not be updated.'));
        return;
      }

      await refresh();
      showToast({
        title: 'Scoreboard controls updated',
        tone: 'success'
      });
    } catch {
      setError('Scoreboard controls could not be updated. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div aria-busy={pendingAction !== null} className="grid gap-8">
      {error ? <Alert title={error} tone="danger" /> : null}

      <section className="grid gap-4" aria-labelledby="event-state-title">
        <h2
          className="m-0 font-display text-xl font-semibold tracking-tight text-text"
          id="event-state-title"
        >
          Event state
        </h2>
        <div className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4 sm:grid-cols-2">
          <Select
            isDisabled={pendingAction !== null}
            label="Lifecycle"
            onSelectionChange={(key) => {
              setState(String(key));
            }}
            options={lifecycleOptions}
            selectedKey={state}
          />
          <div className="flex items-end">
            <Button
              isLoading={pendingAction === 'state'}
              onPress={() => {
                void updateState();
              }}
            >
              Update state
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="scoreboard-controls-title">
        <h2
          className="m-0 font-display text-xl font-semibold tracking-tight text-text"
          id="scoreboard-controls-title"
        >
          Scoreboard controls
        </h2>
        <div className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4">
          <Switch
            description="Conceal the entire public scoreboard."
            isDisabled={pendingAction !== null}
            isSelected={scoreboardHidden}
            label="Hidden"
            onChange={setScoreboardHidden}
          />
          <Switch
            description="Conceal new score entries while preserving the last public snapshot."
            isDisabled={pendingAction !== null}
            isSelected={scoreboardFrozen}
            label="Frozen"
            onChange={setScoreboardFrozen}
          />
          <Button
            className="w-fit"
            isLoading={pendingAction === 'scoreboard'}
            onPress={() => {
              void updateScoreboard();
            }}
          >
            Update scoreboard
          </Button>
        </div>
      </section>
    </div>
  );
}

export function AdminView({ initialError, initialHealth, initialReadiness }: AdminViewProps) {
  const { selectedEvent } = useEvent();
  const { isConnected } = useRealtime();
  const { can } = useSession();
  const [health, setHealth] = useState(initialHealth);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [error, setError] = useState(initialError);
  const [isLoading, setIsLoading] = useState(false);

  const refreshHealth = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [healthResult, readinessResult] = await Promise.all([
        api.GET('/health'),
        api.GET('/ready')
      ]);

      if (!healthResult.data || !readinessResult.data) {
        setError('Platform health could not be loaded.');
        return;
      }

      setHealth(healthResult.data);
      setReadiness(readinessResult.data);
    } catch {
      setError('Platform health could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!can('event_manage')) {
    return <Alert title="Live operations are unavailable for this account." tone="danger" />;
  }

  return (
    <div className="grid gap-8">
      <section
        aria-label="Current event operations"
        className="border-l-2 border-accent bg-surface-raised px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-1">
            <strong className="text-sm font-semibold text-text">
              {selectedEvent?.name ?? 'No event selected'}
            </strong>
            <span className="text-xs text-text-muted">
              {selectedEvent ? selectedEvent.state : 'Choose an event'}
            </span>
          </div>
          <StatusIndicator
            label={isConnected ? 'Realtime connected' : 'Realtime offline'}
            tone={isConnected ? 'success' : 'warning'}
          />
        </div>
      </section>

      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void refreshHealth();
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

      <section className="grid gap-4" aria-labelledby="health-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2
            className="m-0 font-display text-xl font-semibold tracking-tight text-text"
            id="health-title"
          >
            Platform health
          </h2>
          <Button
            isLoading={isLoading}
            onPress={() => {
              void refreshHealth();
            }}
            size="small"
            tone="secondary"
          >
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap gap-6 border-y border-border-subtle py-3">
          <StatusIndicator
            label={`API ${health?.status ?? 'unavailable'}`}
            tone={health?.status === 'ok' ? 'success' : 'danger'}
          />
          <StatusIndicator
            label={`Database ${readiness?.postgres ?? 'unavailable'}`}
            tone={readiness?.postgres === 'ready' ? 'success' : 'danger'}
          />
          <StatusIndicator
            label={isConnected ? 'Realtime ready' : 'Realtime offline'}
            tone={isConnected ? 'success' : 'warning'}
          />
        </div>
      </section>

      {selectedEvent ? (
        <EventControls event={selectedEvent} key={selectedEvent.id} />
      ) : (
        <EmptyState description="Choose an event from the navigation." title="No event selected" />
      )}
    </div>
  );
}
