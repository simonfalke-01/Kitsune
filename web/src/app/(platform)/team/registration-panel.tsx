'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useEvent } from '../../event-context';
import { useRealtime } from '../../realtime-context';
import { useSession } from '../../session-context';
import {
  Alert,
  AlertDialog,
  Button,
  DialogTrigger,
  EmptyState,
  Select,
  Skeleton,
  StatusIndicator,
  showToast
} from '@/components/ui';
import {
  api,
  errorMessage,
  type BracketSummary,
  type DivisionSummary,
  type EventRegistration,
  type TeamSummary
} from '@/lib/api/client';
import { canWithdrawRegistration, registrationIsClosed } from '@/lib/team';

interface RegistrationPanelProps {
  initialBrackets: BracketSummary[];
  initialDivisions: DivisionSummary[];
  initialEventId: string | null;
  initialRegistration: EventRegistration | null;
  team: TeamSummary | null;
}

function placementName(
  id: string | null | undefined,
  options: readonly { id: string; name: string }[]
): string {
  if (!id) {
    return 'None';
  }

  return options.find((option) => option.id === id)?.name ?? 'Unavailable';
}

function RegistrationLoading() {
  return (
    <div aria-label="Loading event registration" className="grid gap-4" role="status">
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

export function RegistrationPanel({
  initialBrackets,
  initialDivisions,
  initialEventId,
  initialRegistration,
  team
}: RegistrationPanelProps) {
  const { selectedEvent } = useEvent();
  const { latest } = useRealtime();
  const { session } = useSession();
  const selectedEventId = selectedEvent?.id ?? null;
  const initialMatchesEvent = initialEventId === selectedEventId;
  const [registration, setRegistration] = useState(
    initialMatchesEvent ? initialRegistration : null
  );
  const [divisions, setDivisions] = useState(initialMatchesEvent ? initialDivisions : []);
  const [brackets, setBrackets] = useState(initialMatchesEvent ? initialBrackets : []);
  const [divisionId, setDivisionId] = useState(
    initialMatchesEvent ? (initialRegistration?.division_id ?? null) : null
  );
  const [bracketId, setBracketId] = useState(
    initialMatchesEvent ? (initialRegistration?.bracket_id ?? null) : null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(selectedEventId && !initialMatchesEvent));
  const [pendingAction, setPendingAction] = useState<'register' | 'unregister' | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (nextEventId: string) => {
    const requestId = ++requestSequence.current;
    setIsLoading(true);
    setError(null);

    try {
      const [registrationResult, divisionResult, bracketResult] = await Promise.all([
        api.GET('/api/v1/events/{event_id}/registration', {
          params: {
            path: {
              event_id: nextEventId
            }
          }
        }),
        api.GET('/api/v1/events/{event_id}/divisions', {
          params: {
            path: {
              event_id: nextEventId
            }
          }
        }),
        api.GET('/api/v1/events/{event_id}/brackets', {
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

      if (!registrationResult.data) {
        setError(errorMessage(registrationResult.error, 'Event registration could not be loaded.'));
        return;
      }

      const nextRegistration = registrationResult.data.registration ?? null;
      setRegistration(nextRegistration);
      setDivisionId(nextRegistration?.division_id ?? null);
      setBracketId(nextRegistration?.bracket_id ?? null);
      setDivisions(divisionResult.data ?? []);
      setBrackets(bracketResult.data ?? []);
    } catch {
      if (requestId === requestSequence.current) {
        setError('Event registration could not be loaded. Check your connection and retry.');
      }
    } finally {
      if (requestId === requestSequence.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedEventId || initialMatchesEvent) {
      return;
    }

    const loadTimer = window.setTimeout(() => {
      void load(selectedEventId);
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [initialMatchesEvent, load, selectedEventId]);

  useEffect(() => {
    if (
      !latest ||
      !selectedEventId ||
      latest.event_id !== selectedEventId ||
      latest.event.type !== 'event_registration_changed'
    ) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      void load(selectedEventId);
    }, 150);

    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [latest, load, selectedEventId]);

  const saveRegistration = async () => {
    if (!session?.csrf_token || !selectedEvent) {
      setError('The session could not authorize this action.');
      return;
    }

    setPendingAction('register');
    setError(null);

    try {
      const result = await api.PUT('/api/v1/events/{event_id}/registration', {
        body: {
          bracket_id: bracketId,
          division_id: divisionId
        },
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            event_id: selectedEvent.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'Event registration could not be saved.'));
        return;
      }

      setRegistration(result.data);
      showToast({
        title: registration ? 'Registration updated' : 'Event registered',
        tone: 'success'
      });
    } catch {
      setError('Event registration could not be saved. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  const unregister = async (): Promise<boolean> => {
    if (!session?.csrf_token || !selectedEvent) {
      setError('The session could not authorize this action.');
      return false;
    }

    setPendingAction('unregister');
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/events/{event_id}/registration', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            event_id: selectedEvent.id
          }
        }
      });

      if (!result.response.ok) {
        setError(errorMessage(result.error, 'Event registration could not be withdrawn.'));
        return false;
      }

      setRegistration(null);
      setDivisionId(null);
      setBracketId(null);
      showToast({
        title: 'Registration withdrawn',
        tone: 'success'
      });
      return true;
    } catch {
      setError('Event registration could not be withdrawn. Check your connection and retry.');
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  if (!selectedEvent) {
    return (
      <EmptyState description="Choose an event from the navigation." title="No event selected" />
    );
  }

  if (isLoading && !registration && divisions.length === 0) {
    return <RegistrationLoading />;
  }

  const registrationClosed = registrationIsClosed(selectedEvent.state);
  const canWithdraw = canWithdrawRegistration(selectedEvent.state);
  const requiresTeam = selectedEvent.participation === 'team';
  const registrationBlocked = registrationClosed || (requiresTeam && !team);
  const isMutating = pendingAction !== null;

  return (
    <section
      aria-busy={isLoading || isMutating}
      className="grid gap-4"
      aria-labelledby="registration-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2
          className="m-0 font-display text-xl font-semibold tracking-tight text-text"
          id="registration-title"
        >
          Event registration
        </h2>
        <StatusIndicator
          label={registration ? 'Registered' : registrationClosed ? 'Closed' : 'Not registered'}
          tone={registration ? 'success' : registrationClosed ? 'neutral' : 'warning'}
        />
      </div>

      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void load(selectedEvent.id);
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

      {requiresTeam && !team ? (
        <Alert
          description="Create or join a team before registering for this event."
          title="Team required"
          tone="info"
        />
      ) : null}

      {registration ? (
        <div className="flex flex-wrap gap-6 border-y border-border-subtle py-3">
          <span className="grid gap-1">
            <span className="text-xs font-semibold text-text-muted">Entry</span>
            <strong className="text-sm text-text">
              {registration.competitor_kind === 'team' ? 'Team' : 'Individual'}
            </strong>
          </span>
          <span className="grid gap-1">
            <span className="text-xs font-semibold text-text-muted">Division</span>
            <strong className="text-sm text-text">
              {placementName(registration.division_id, divisions)}
            </strong>
          </span>
          <span className="grid gap-1">
            <span className="text-xs font-semibold text-text-muted">Bracket</span>
            <strong className="text-sm text-text">
              {placementName(registration.bracket_id, brackets)}
            </strong>
          </span>
        </div>
      ) : null}

      {registrationClosed && !registration ? (
        <Alert description="New entries are no longer accepted." title="Registration closed" />
      ) : (
        <div className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4 sm:grid-cols-2">
          {divisions.length > 0 ? (
            <Select
              isDisabled={isMutating}
              label="Division"
              onSelectionChange={(key) => {
                setDivisionId(String(key) === 'none' ? null : String(key));
              }}
              options={[
                {
                  id: 'none',
                  label: 'No division'
                },
                ...divisions.map((division) => ({
                  id: division.id,
                  label: division.name
                }))
              ]}
              selectedKey={divisionId ?? 'none'}
            />
          ) : null}
          {brackets.length > 0 ? (
            <Select
              isDisabled={isMutating}
              label="Bracket"
              onSelectionChange={(key) => {
                setBracketId(String(key) === 'none' ? null : String(key));
              }}
              options={[
                {
                  id: 'none',
                  label: 'No bracket'
                },
                ...brackets.map((bracket) => ({
                  id: bracket.id,
                  label: bracket.name
                }))
              ]}
              selectedKey={bracketId ?? 'none'}
            />
          ) : null}
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <Button
              isDisabled={registrationBlocked}
              isLoading={pendingAction === 'register'}
              onPress={() => {
                void saveRegistration();
              }}
            >
              {registration ? 'Update registration' : 'Register'}
            </Button>
            {registration && canWithdraw ? (
              <RegistrationWithdrawal
                isLoading={pendingAction === 'unregister'}
                onWithdraw={unregister}
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function RegistrationWithdrawal({
  isLoading,
  onWithdraw
}: {
  isLoading: boolean;
  onWithdraw: () => Promise<boolean>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button isDisabled={isLoading} tone="danger">
        Withdraw
      </Button>
      <AlertDialog
        actions={
          <>
            <Button isDisabled={isLoading} slot="close" tone="quiet">
              Keep registration
            </Button>
            <Button
              isLoading={isLoading}
              onPress={() => {
                void onWithdraw().then((withdrawn) => {
                  if (withdrawn) {
                    setIsOpen(false);
                  }
                });
              }}
              tone="danger"
            >
              Withdraw
            </Button>
          </>
        }
        description="Your entry is removed from this event. You can register again while registration remains open."
        title="Withdraw from this event?"
      />
    </DialogTrigger>
  );
}
