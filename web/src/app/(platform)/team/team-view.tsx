'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useEvent } from '../../event-context';
import { useRealtime } from '../../realtime-context';
import { useSession } from '../../session-context';
import { RegistrationPanel } from './registration-panel';
import {
  Alert,
  AlertDialog,
  Badge,
  Button,
  CodeBlock,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  Select,
  StatusIndicator,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TextField,
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
import { findUserTeam, isTeamRealtimeEvent, teamCapacity } from '@/lib/team';

interface TeamViewProps {
  initialBrackets: BracketSummary[];
  initialDivisions: DivisionSummary[];
  initialError: string | null;
  initialEventId: string | null;
  initialRegistration: EventRegistration | null;
  initialTeams: TeamSummary[];
}

type TeamAction = (value: string) => Promise<string | null>;
type TeamConfirmAction = () => Promise<string | null>;

const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Enter a team name.').max(80, 'Use no more than 80 characters.')
});

const joinTeamSchema = z.object({
  invite_code: z.string().trim().min(20, 'Enter the complete invite code.')
});

type CreateTeamValues = z.infer<typeof createTeamSchema>;
type JoinTeamValues = z.infer<typeof joinTeamSchema>;

function participationLabel(participation: string): string {
  if (participation === 'team') {
    return 'Team participation';
  }

  if (participation === 'hybrid') {
    return 'Individual or team participation';
  }

  return 'Individual participation';
}

function CreateTeamForm({
  isLoading,
  onCreate,
  onDone
}: {
  isLoading: boolean;
  onCreate: TeamAction;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    clearErrors,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<CreateTeamValues>({
    defaultValues: {
      name: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setSubmitError(null);
    const parsed = createTeamSchema.safeParse(values);

    if (!parsed.success) {
      setError('name', {
        message: parsed.error.issues[0]?.message
      });
      return;
    }

    const mutationError = await onCreate(parsed.data.name.trim());

    if (mutationError) {
      setSubmitError(mutationError);
      return;
    }

    reset();
    onDone();
  });

  return (
    <Form
      onSubmit={(event) => {
        void submit(event);
      }}
      validationBehavior="aria"
    >
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            autoFocus
            errorMessage={errors.name?.message}
            isInvalid={Boolean(errors.name)}
            label="Team name"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      {submitError ? <Alert title={submitError} tone="danger" /> : null}
      <Button isLoading={isLoading} type="submit">
        Create team
      </Button>
    </Form>
  );
}

function JoinTeamForm({
  isLoading,
  onDone,
  onJoin
}: {
  isLoading: boolean;
  onDone: () => void;
  onJoin: TeamAction;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    clearErrors,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<JoinTeamValues>({
    defaultValues: {
      invite_code: ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setSubmitError(null);
    const parsed = joinTeamSchema.safeParse(values);

    if (!parsed.success) {
      setError('invite_code', {
        message: parsed.error.issues[0]?.message
      });
      return;
    }

    const mutationError = await onJoin(parsed.data.invite_code.trim());

    if (mutationError) {
      setSubmitError(mutationError);
      return;
    }

    reset();
    onDone();
  });

  return (
    <Form
      onSubmit={(event) => {
        void submit(event);
      }}
      validationBehavior="aria"
    >
      <Controller
        control={control}
        name="invite_code"
        render={({ field }) => (
          <TextField
            autoComplete="off"
            autoFocus
            errorMessage={errors.invite_code?.message}
            isInvalid={Boolean(errors.invite_code)}
            label="Invite code"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      {submitError ? <Alert title={submitError} tone="danger" /> : null}
      <Button isLoading={isLoading} type="submit">
        Join team
      </Button>
    </Form>
  );
}

function TeamlessState({
  canCreate,
  canJoin,
  isLoading,
  onCreate,
  onJoin
}: {
  canCreate: boolean;
  canJoin: boolean;
  isLoading: boolean;
  onCreate: TeamAction;
  onJoin: TeamAction;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <EmptyState
      action={
        canCreate || canJoin ? (
          <div className="flex flex-wrap justify-center gap-2">
            {canCreate ? (
              <DialogTrigger isOpen={createOpen} onOpenChange={setCreateOpen}>
                <Button>Create team</Button>
                <Dialog
                  description="The invite code is shown once after creation."
                  title="Create team"
                >
                  <CreateTeamForm
                    isLoading={isLoading}
                    onCreate={onCreate}
                    onDone={() => {
                      setCreateOpen(false);
                    }}
                  />
                </Dialog>
              </DialogTrigger>
            ) : null}
            {canJoin ? (
              <DialogTrigger isOpen={joinOpen} onOpenChange={setJoinOpen}>
                <Button tone="secondary">Join team</Button>
                <Dialog description="Ask a captain for the current code." title="Join team">
                  <JoinTeamForm
                    isLoading={isLoading}
                    onDone={() => {
                      setJoinOpen(false);
                    }}
                    onJoin={onJoin}
                  />
                </Dialog>
              </DialogTrigger>
            ) : null}
          </div>
        ) : null
      }
      description={
        canCreate || canJoin
          ? 'Create a roster or use an invite code from a captain.'
          : 'Team membership is unavailable for this account.'
      }
      title="No team"
    />
  );
}

function ConfirmTeamAction({
  buttonLabel,
  buttonTone = 'secondary',
  confirmLabel,
  description,
  isDisabled,
  isLoading,
  onConfirm,
  title
}: {
  buttonLabel: string;
  buttonTone?: 'danger' | 'secondary';
  confirmLabel: string;
  description: string;
  isDisabled?: boolean;
  isLoading: boolean;
  onConfirm: TeamConfirmAction;
  title: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const confirm = async () => {
    setError(null);
    const mutationError = await onConfirm();

    if (mutationError) {
      setError(mutationError);
      return;
    }

    setIsOpen(false);
  };

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);

        if (!nextOpen) {
          setError(null);
        }
      }}
    >
      <Button isDisabled={isDisabled} size="small" tone={buttonTone}>
        {buttonLabel}
      </Button>
      <AlertDialog
        actions={
          <>
            <Button isDisabled={isLoading} slot="close" tone="quiet">
              Cancel
            </Button>
            <Button
              isLoading={isLoading}
              onPress={() => {
                void confirm();
              }}
              tone="danger"
            >
              {confirmLabel}
            </Button>
          </>
        }
        description={description}
        title={title}
      >
        {error ? <Alert title={error} tone="danger" /> : null}
      </AlertDialog>
    </DialogTrigger>
  );
}

function TransferCaptainControl({
  isDisabled,
  isLoading,
  members,
  onTransfer
}: {
  isDisabled: boolean;
  isLoading: boolean;
  members: TeamSummary['members'];
  onTransfer: TeamAction;
}) {
  const candidates = useMemo(() => members.filter((member) => !member.captain), [members]);
  const [requestedUserId, setRequestedUserId] = useState(candidates[0]?.user_id ?? '');
  const selectedUserId = candidates.some((member) => member.user_id === requestedUserId)
    ? requestedUserId
    : (candidates[0]?.user_id ?? '');
  const selectedMember = candidates.find((member) => member.user_id === selectedUserId);

  if (candidates.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border-subtle bg-surface-raised p-4">
      <Select
        isDisabled={isDisabled}
        label="Next captain"
        onSelectionChange={(key) => {
          setRequestedUserId(String(key));
        }}
        options={candidates.map((member) => ({
          id: member.user_id,
          label: member.display_name
        }))}
        selectedKey={selectedUserId}
      />
      <ConfirmTeamAction
        buttonLabel="Transfer captaincy"
        confirmLabel="Transfer captaincy"
        description={`${selectedMember?.display_name ?? 'The selected member'} becomes captain immediately. You remain on the roster as a member.`}
        isDisabled={isDisabled || !selectedUserId}
        isLoading={isLoading}
        onConfirm={() => onTransfer(selectedUserId)}
        title="Transfer captaincy?"
      />
    </div>
  );
}

export function TeamView({
  initialBrackets,
  initialDivisions,
  initialError,
  initialEventId,
  initialRegistration,
  initialTeams
}: TeamViewProps) {
  const { selectedEvent } = useEvent();
  const { latest } = useRealtime();
  const { can, session } = useSession();
  const [teams, setTeams] = useState(initialTeams);
  const [error, setError] = useState(initialError);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const userId = session?.user.id ?? '';
  const team = useMemo(() => findUserTeam(teams, userId), [teams, userId]);
  const currentMember = team?.members.find((member) => member.user_id === userId) ?? null;
  const isCaptain = currentMember?.captain ?? false;
  const capacity = teamCapacity(team?.members.length ?? 0, selectedEvent?.team_size_limit ?? null);
  const isMutating = pendingAction !== null;

  const loadTeams = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.GET('/api/v1/teams');

      if (requestId !== requestSequence.current) {
        return;
      }

      if (!result.data) {
        setError(errorMessage(result.error, 'The team could not be loaded.'));
        return;
      }

      setTeams(result.data);
    } catch {
      if (requestId === requestSequence.current) {
        setError('The team could not be loaded. Check your connection and retry.');
      }
    } finally {
      if (requestId === requestSequence.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!latest || !isTeamRealtimeEvent(latest.event.type)) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      void loadTeams();
    }, 150);

    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [latest, loadTeams]);

  const createTeam = async (name: string): Promise<string | null> => {
    if (!session?.csrf_token) {
      return 'The session could not authorize this action.';
    }

    setPendingAction('create');

    try {
      const result = await api.POST('/api/v1/teams', {
        body: {
          name
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        return errorMessage(result.error, 'The team could not be created.');
      }

      setTeams([result.data.team]);
      setInviteCode(result.data.invite_code);
      showToast({
        title: 'Team created',
        tone: 'success'
      });
      return null;
    } catch {
      return 'The team could not be created. Check your connection and retry.';
    } finally {
      setPendingAction(null);
    }
  };

  const joinTeam = async (inviteCodeValue: string): Promise<string | null> => {
    if (!session?.csrf_token) {
      return 'The session could not authorize this action.';
    }

    setPendingAction('join');

    try {
      const result = await api.POST('/api/v1/teams/join', {
        body: {
          invite_code: inviteCodeValue
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        return errorMessage(result.error, 'The invite code could not be used.');
      }

      setTeams([result.data]);
      showToast({
        title: 'Team joined',
        tone: 'success'
      });
      return null;
    } catch {
      return 'The invite code could not be used. Check your connection and retry.';
    } finally {
      setPendingAction(null);
    }
  };

  const rotateInvite = async (): Promise<string | null> => {
    if (!session?.csrf_token || !team) {
      return 'The session could not authorize this action.';
    }

    setPendingAction('invite');

    try {
      const result = await api.POST('/api/v1/teams/{team_id}/invite', {
        params: {
          path: {
            team_id: team.id
          }
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        return errorMessage(result.error, 'The invite code could not be replaced.');
      }

      setInviteCode(result.data.invite_code);
      showToast({
        title: 'Invite code replaced',
        tone: 'success'
      });
      return null;
    } catch {
      return 'The invite code could not be replaced. Check your connection and retry.';
    } finally {
      setPendingAction(null);
    }
  };

  const transferCaptain = async (nextCaptainId: string): Promise<string | null> => {
    if (!session?.csrf_token || !team) {
      return 'The session could not authorize this action.';
    }

    setPendingAction('captain');

    try {
      const result = await api.POST('/api/v1/teams/{team_id}/captain', {
        body: {
          user_id: nextCaptainId
        },
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            team_id: team.id
          }
        }
      });

      if (!result.data) {
        return errorMessage(result.error, 'Captaincy could not be transferred.');
      }

      setTeams([result.data]);
      showToast({
        title: 'Captaincy transferred',
        tone: 'success'
      });
      return null;
    } catch {
      return 'Captaincy could not be transferred. Check your connection and retry.';
    } finally {
      setPendingAction(null);
    }
  };

  const removeMember = async (memberId: string): Promise<string | null> => {
    if (!session?.csrf_token || !team) {
      return 'The session could not authorize this action.';
    }

    setPendingAction(`remove:${memberId}`);

    try {
      const result = await api.DELETE('/api/v1/teams/{team_id}/members/{user_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            team_id: team.id,
            user_id: memberId
          }
        }
      });

      if (!result.data) {
        return errorMessage(result.error, 'The member could not be removed.');
      }

      setTeams([result.data]);
      showToast({
        title: 'Member removed',
        tone: 'success'
      });
      return null;
    } catch {
      return 'The member could not be removed. Check your connection and retry.';
    } finally {
      setPendingAction(null);
    }
  };

  const leaveTeam = async (): Promise<string | null> => {
    if (!session?.csrf_token || !team) {
      return 'The session could not authorize this action.';
    }

    setPendingAction('leave');

    try {
      const result = await api.DELETE('/api/v1/teams/{team_id}/membership', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            team_id: team.id
          }
        }
      });

      if (!result.response.ok) {
        return errorMessage(result.error, 'The team could not be left.');
      }

      setTeams([]);
      setInviteCode(null);
      showToast({
        title: 'Team left',
        tone: 'success'
      });
      return null;
    } catch {
      return 'The team could not be left. Check your connection and retry.';
    } finally {
      setPendingAction(null);
    }
  };

  if (error && teams.length === 0) {
    return (
      <Alert
        actions={
          <Button
            isLoading={isLoading}
            onPress={() => {
              void loadTeams();
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

  return (
    <div aria-busy={isLoading || isMutating} className="grid gap-8">
      <section
        aria-label="Current team context"
        className="border-l-2 border-accent bg-surface-raised px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-1">
            <strong className="text-sm font-semibold text-text">
              {selectedEvent?.name ?? 'No event selected'}
            </strong>
            <span className="text-xs text-text-muted">
              {selectedEvent ? participationLabel(selectedEvent.participation) : 'Event context'}
            </span>
          </div>
          <StatusIndicator
            label={team ? capacity.label : 'No team'}
            tone={team ? capacity.tone : 'neutral'}
          />
        </div>
      </section>

      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void loadTeams();
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

      {inviteCode ? (
        <section className="grid gap-3" aria-labelledby="team-invite-title">
          <Alert
            description="Copy it now. The code cannot be retrieved after leaving this page."
            title="Invite code ready"
            tone="success"
          />
          <h2 className="sr-only" id="team-invite-title">
            Team invite code
          </h2>
          <CodeBlock code={inviteCode} label="Team invite code" />
        </section>
      ) : null}

      {!team ? (
        <TeamlessState
          canCreate={can('team_create')}
          canJoin={can('team_join')}
          isLoading={isMutating}
          onCreate={createTeam}
          onJoin={joinTeam}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid gap-1">
              <h2 className="m-0 font-display text-xl font-semibold tracking-tight text-text">
                {team.name}
              </h2>
              <span className="text-sm text-text-muted">{capacity.label}</span>
            </div>
            {isCaptain && can('team_captain') ? (
              <ConfirmTeamAction
                buttonLabel="Replace invite code"
                confirmLabel="Replace code"
                description="The current invite code stops working immediately. The replacement is shown once."
                isDisabled={isMutating}
                isLoading={pendingAction === 'invite'}
                onConfirm={rotateInvite}
                title="Replace the invite code?"
              />
            ) : null}
          </div>

          <section className="grid gap-4" aria-labelledby="team-roster-title">
            <h2
              className="m-0 font-display text-xl font-semibold tracking-tight text-text"
              id="team-roster-title"
            >
              Roster
            </h2>
            <Table aria-label="Team roster">
              <TableHeader>
                <TableColumn isRowHeader>Member</TableColumn>
                <TableColumn>Role</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody emptyState="No team members.">
                {team.members.map((member) => (
                  <TableRow id={member.user_id} key={member.user_id}>
                    <TableCell>
                      <span className="font-medium text-text">{member.display_name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge tone={member.captain ? 'accent' : 'neutral'}>
                        {member.captain ? 'Captain' : 'Member'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isCaptain &&
                      can('team_captain') &&
                      !member.captain &&
                      member.user_id !== userId ? (
                        <ConfirmTeamAction
                          buttonLabel="Remove"
                          buttonTone="danger"
                          confirmLabel="Remove member"
                          description={`${member.display_name} loses access to the roster and team-owned event progress.`}
                          isDisabled={isMutating}
                          isLoading={pendingAction === `remove:${member.user_id}`}
                          onConfirm={() => removeMember(member.user_id)}
                          title={`Remove ${member.display_name}?`}
                        />
                      ) : (
                        <span className="text-sm text-text-muted">
                          {member.user_id === userId ? (
                            'You'
                          ) : (
                            <span className="sr-only">No action available</span>
                          )}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          {isCaptain && can('team_captain') ? (
            <section className="grid gap-4" aria-labelledby="captain-controls-title">
              <h2
                className="m-0 font-display text-xl font-semibold tracking-tight text-text"
                id="captain-controls-title"
              >
                Captain controls
              </h2>
              <TransferCaptainControl
                isDisabled={isMutating}
                isLoading={pendingAction === 'captain'}
                members={team.members}
                onTransfer={transferCaptain}
              />
            </section>
          ) : can('team_join') ? (
            <section className="grid gap-3" aria-labelledby="membership-controls-title">
              <h2
                className="m-0 font-display text-xl font-semibold tracking-tight text-text"
                id="membership-controls-title"
              >
                Membership
              </h2>
              <ConfirmTeamAction
                buttonLabel="Leave team"
                buttonTone="danger"
                confirmLabel="Leave team"
                description="You lose access to this roster and team-owned event progress."
                isDisabled={isMutating}
                isLoading={pendingAction === 'leave'}
                onConfirm={leaveTeam}
                title={`Leave ${team.name}?`}
              />
            </section>
          ) : null}
        </>
      )}

      <RegistrationPanel
        initialBrackets={initialBrackets}
        initialDivisions={initialDivisions}
        initialEventId={initialEventId}
        initialRegistration={initialRegistration}
        key={selectedEvent?.id ?? 'no-event'}
        team={team}
      />
    </div>
  );
}
