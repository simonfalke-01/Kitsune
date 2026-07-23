'use client';

import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useSession } from '../../../session-context';
import {
  Alert,
  AlertDialog,
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
  showToast
} from '@/components/ui';
import { api, errorMessage, type TeamSummary } from '@/lib/api/client';

interface TeamAdminViewProps {
  initialError: string | null;
  initialTeams: TeamSummary[];
}

const transferSchema = z.object({
  replacement_captain_id: z.string(),
  target_team_id: z.string().min(1),
  user_id: z.string().min(1)
});

type TransferValues = z.infer<typeof transferSchema>;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium'
  }).format(new Date(value));
}

function TransferMemberForm({
  onDone,
  onRefresh,
  sourceTeam,
  teams
}: {
  onDone: () => void;
  onRefresh: () => Promise<void>;
  sourceTeam: TeamSummary;
  teams: TeamSummary[];
}) {
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetTeams = teams.filter((team) => team.id !== sourceTeam.id);
  const {
    control,
    handleSubmit,
    formState: { errors }
  } = useForm<TransferValues>({
    defaultValues: {
      replacement_captain_id: '',
      target_team_id: targetTeams[0]?.id ?? '',
      user_id: sourceTeam.members[0]?.user_id ?? ''
    }
  });
  const selectedUserId = useWatch({
    control,
    name: 'user_id'
  });
  const selectedMember = sourceTeam.members.find((member) => member.user_id === selectedUserId);
  const replacementCandidates = sourceTeam.members.filter(
    (member) => member.user_id !== selectedUserId
  );

  const submit = handleSubmit(async (values) => {
    const parsed = transferSchema.safeParse(values);

    if (!parsed.success) {
      setError('Choose a member and destination team.');
      return;
    }

    if (selectedMember?.captain && !parsed.data.replacement_captain_id) {
      setError('Choose a replacement captain before moving the current captain.');
      return;
    }

    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.POST(
        '/api/v1/admin/teams/{source_team_id}/members/{user_id}/transfer',
        {
          body: {
            replacement_captain_id: selectedMember?.captain
              ? parsed.data.replacement_captain_id
              : null,
            target_team_id: parsed.data.target_team_id
          },
          headers: {
            'x-csrf-token': session.csrf_token
          },
          params: {
            path: {
              source_team_id: sourceTeam.id,
              user_id: parsed.data.user_id
            }
          }
        }
      );

      if (!result.data) {
        setError(errorMessage(result.error, 'The member could not be transferred.'));
        return;
      }

      await onRefresh();
      onDone();
      showToast({
        title: 'Member transferred',
        tone: 'success'
      });
    } catch {
      setError('The member could not be transferred. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
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
        name="user_id"
        render={({ field }) => (
          <Select
            label="Member"
            onSelectionChange={(key) => {
              field.onChange(String(key));
            }}
            options={sourceTeam.members.map((member) => ({
              id: member.user_id,
              label: member.captain ? `${member.display_name} (captain)` : member.display_name
            }))}
            selectedKey={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="target_team_id"
        render={({ field }) => (
          <Select
            label="Destination team"
            onSelectionChange={(key) => {
              field.onChange(String(key));
            }}
            options={targetTeams.map((team) => ({
              id: team.id,
              label: `${team.name} (${team.members.length})`
            }))}
            selectedKey={field.value}
          />
        )}
      />
      {selectedMember?.captain ? (
        replacementCandidates.length > 0 ? (
          <Controller
            control={control}
            name="replacement_captain_id"
            render={({ field }) => (
              <Select
                description="Required because the selected member currently captains the source team."
                label="Replacement captain"
                onSelectionChange={(key) => {
                  field.onChange(String(key));
                }}
                options={replacementCandidates.map((member) => ({
                  id: member.user_id,
                  label: member.display_name
                }))}
                selectedKey={field.value || null}
              />
            )}
          />
        ) : (
          <Alert
            title="The only member cannot be transferred. Merge the team instead."
            tone="warning"
          />
        )
      ) : null}
      {errors.user_id || errors.target_team_id ? (
        <Alert title="Choose a member and destination team." tone="danger" />
      ) : null}
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button
        isDisabled={
          targetTeams.length === 0 ||
          sourceTeam.members.length === 0 ||
          (Boolean(selectedMember?.captain) && replacementCandidates.length === 0)
        }
        isLoading={isSubmitting}
        type="submit"
      >
        Transfer member
      </Button>
    </Form>
  );
}

function MergeTeamAction({
  onRefresh,
  sourceTeam,
  teams
}: {
  onRefresh: () => Promise<void>;
  sourceTeam: TeamSummary;
  teams: TeamSummary[];
}) {
  const { session } = useSession();
  const targetTeams = teams.filter((team) => team.id !== sourceTeam.id);
  const [targetTeamId, setTargetTeamId] = useState(targetTeams[0]?.id ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetTeam = targetTeams.find((team) => team.id === targetTeamId);

  const merge = async () => {
    if (!session?.csrf_token || !targetTeamId) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await api.POST('/api/v1/admin/teams/{source_team_id}/merge', {
        body: {
          target_team_id: targetTeamId
        },
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            source_team_id: sourceTeam.id
          }
        }
      });

      if (!result.data) {
        showToast({
          description: errorMessage(result.error, 'The teams could not be merged.'),
          title: 'Merge failed',
          tone: 'danger'
        });
        return;
      }

      await onRefresh();
      setIsOpen(false);
      showToast({
        title: 'Teams merged',
        tone: 'success'
      });
    } catch {
      showToast({
        description: 'Check your connection and retry.',
        title: 'Merge failed',
        tone: 'danger'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button isDisabled={targetTeams.length === 0} size="small" tone="danger">
        Merge
      </Button>
      <AlertDialog
        actions={
          <>
            <Button isDisabled={isSubmitting} slot="close" tone="quiet">
              Keep teams
            </Button>
            <Button
              isDisabled={!targetTeamId}
              isLoading={isSubmitting}
              onPress={() => {
                void merge();
              }}
              tone="danger"
            >
              Merge team
            </Button>
          </>
        }
        description={`${sourceTeam.name} will be removed after its roster and event history move to the surviving team.`}
        title="Merge this team?"
      >
        <Select
          description={
            targetTeam
              ? `${targetTeam.name} will contain both rosters and retain the merged history.`
              : undefined
          }
          label="Surviving team"
          onSelectionChange={(key) => {
            setTargetTeamId(String(key));
          }}
          options={targetTeams.map((team) => ({
            id: team.id,
            label: `${team.name} (${team.members.length})`
          }))}
          selectedKey={targetTeamId}
        />
      </AlertDialog>
    </DialogTrigger>
  );
}

export function TeamAdminView({ initialError, initialTeams }: TeamAdminViewProps) {
  const { can } = useSession();
  const [teams, setTeams] = useState(initialTeams);
  const [error, setError] = useState(initialError);
  const [isLoading, setIsLoading] = useState(false);
  const [transferTeamId, setTransferTeamId] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.GET('/api/v1/admin/teams');

      if (!result.data) {
        setError('Team inventory could not be loaded.');
        return;
      }

      setTeams(result.data);
    } catch {
      setError('Team inventory could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!can('team_manage')) {
    return <Alert title="Team administration is unavailable for this account." tone="danger" />;
  }

  return (
    <div aria-busy={isLoading} className="grid gap-6">
      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void refresh();
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
        <Badge>{teams.length} teams</Badge>
        <Button
          isLoading={isLoading}
          onPress={() => {
            void refresh();
          }}
          size="small"
          tone="secondary"
        >
          Refresh
        </Button>
      </div>

      {teams.length === 0 ? (
        <EmptyState
          description="Teams appear here after competitors create them."
          title="No teams"
        />
      ) : (
        <Table aria-label="Organizer teams">
          <TableHeader>
            <TableColumn isRowHeader>Team</TableColumn>
            <TableColumn>Captain</TableColumn>
            <TableColumn>Members</TableColumn>
            <TableColumn>Created</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyState="No teams.">
            {teams.map((team) => {
              const captain = team.members.find((member) => member.captain);

              return (
                <TableRow id={team.id} key={team.id}>
                  <TableCell>{team.name}</TableCell>
                  <TableCell>{captain?.display_name ?? 'No captain'}</TableCell>
                  <TableCell>{team.members.length}</TableCell>
                  <TableCell>{formatDate(team.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <DialogTrigger
                        isOpen={transferTeamId === team.id}
                        onOpenChange={(open) => {
                          setTransferTeamId(open ? team.id : null);
                        }}
                      >
                        <Button
                          isDisabled={team.members.length === 0 || teams.length < 2}
                          size="small"
                          tone="secondary"
                        >
                          Transfer
                        </Button>
                        <Dialog
                          description={`Move one member out of ${team.name}.`}
                          title="Transfer team member"
                        >
                          <TransferMemberForm
                            onDone={() => {
                              setTransferTeamId(null);
                            }}
                            onRefresh={refresh}
                            sourceTeam={team}
                            teams={teams}
                          />
                        </Dialog>
                      </DialogTrigger>
                      <MergeTeamAction onRefresh={refresh} sourceTeam={team} teams={teams} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
