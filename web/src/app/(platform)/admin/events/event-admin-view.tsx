'use client';

import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useEvent } from '../../../event-context';
import { useSession } from '../../../session-context';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  NumberField,
  Select,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TextArea,
  TextField,
  showToast
} from '@/components/ui';
import { api, errorMessage } from '@/lib/api/client';

const eventSchema = z.object({
  description: z.string().trim(),
  modes: z.array(z.enum(['jeopardy', 'koth', 'attack_defense', 'workshop'])).min(1),
  name: z
    .string()
    .trim()
    .min(1, 'Enter an event name.')
    .max(120, 'Use no more than 120 characters.'),
  participation: z.enum(['individual', 'team', 'hybrid']),
  slug: z
    .string()
    .trim()
    .min(1, 'Enter an event key.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Use lowercase letters, numbers, and hyphens.'),
  state: z.enum(['draft', 'scheduled', 'live', 'paused', 'ended', 'archived']),
  team_size_limit: z.number().int().min(1).max(1000)
});

type EventValues = z.infer<typeof eventSchema>;

const modeOptions = [
  {
    id: 'jeopardy',
    label: 'Jeopardy'
  },
  {
    id: 'koth',
    label: 'King of the Hill'
  },
  {
    id: 'attack_defense',
    label: 'Attack/Defense'
  },
  {
    id: 'workshop',
    label: 'Workshop'
  }
] as const;

const participationOptions = [
  {
    id: 'individual',
    label: 'Individual'
  },
  {
    id: 'team',
    label: 'Team'
  },
  {
    id: 'hybrid',
    label: 'Individual or team'
  }
] as const;

const stateOptions = [
  {
    id: 'draft',
    label: 'Draft'
  },
  {
    id: 'scheduled',
    label: 'Scheduled'
  }
] as const;

function CreateEventForm({ onDone }: { onDone: () => void }) {
  const { refresh, selectEvent } = useEvent();
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    clearErrors,
    control,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors }
  } = useForm<EventValues>({
    defaultValues: {
      description: '',
      modes: ['jeopardy'],
      name: '',
      participation: 'team',
      slug: '',
      state: 'draft',
      team_size_limit: 4
    }
  });
  const participation = useWatch({
    control,
    name: 'participation'
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = eventSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (
          field === 'description' ||
          field === 'modes' ||
          field === 'name' ||
          field === 'participation' ||
          field === 'slug' ||
          field === 'state' ||
          field === 'team_size_limit'
        ) {
          setFieldError(field, {
            message: issue.message
          });
        }
      }
      return;
    }

    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await api.POST('/api/v1/events', {
        body: {
          description: parsed.data.description,
          ends_at: null,
          modes: parsed.data.modes,
          name: parsed.data.name,
          participation: parsed.data.participation,
          slug: parsed.data.slug,
          starts_at: null,
          state: parsed.data.state,
          team_size_limit:
            parsed.data.participation === 'individual' ? null : parsed.data.team_size_limit
        },
        headers: {
          'x-csrf-token': session.csrf_token
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The event could not be created.'));
        return;
      }

      await refresh();
      await selectEvent(result.data.id);
      reset();
      onDone();
      showToast({
        title: 'Event created',
        tone: 'success'
      });
    } catch {
      setError('The event could not be created. Check your connection and retry.');
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
        name="name"
        render={({ field }) => (
          <TextField
            autoFocus
            errorMessage={errors.name?.message}
            isInvalid={Boolean(errors.name)}
            label="Event name"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="slug"
        render={({ field }) => (
          <TextField
            errorMessage={errors.slug?.message}
            isInvalid={Boolean(errors.slug)}
            label="Event key"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextArea
            errorMessage={errors.description?.message}
            isInvalid={Boolean(errors.description)}
            label="Description"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="participation"
        render={({ field }) => (
          <Select
            label="Participation"
            onSelectionChange={(key) => {
              field.onChange(String(key));
            }}
            options={participationOptions}
            selectedKey={field.value}
          />
        )}
      />
      {participation !== 'individual' ? (
        <Controller
          control={control}
          name="team_size_limit"
          render={({ field }) => (
            <NumberField
              errorMessage={errors.team_size_limit?.message}
              isInvalid={Boolean(errors.team_size_limit)}
              label="Team size limit"
              maxValue={1000}
              minValue={1}
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
      ) : null}
      <Controller
        control={control}
        name="state"
        render={({ field }) => (
          <Select
            label="Initial state"
            onSelectionChange={(key) => {
              field.onChange(String(key));
            }}
            options={stateOptions}
            selectedKey={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="modes"
        render={({ field }) => (
          <fieldset className="grid gap-3 rounded-lg border border-border-subtle p-4">
            <legend className="px-2 text-sm font-semibold text-text">Modes</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {modeOptions.map((mode) => (
                <Checkbox
                  isSelected={field.value.includes(mode.id)}
                  key={mode.id}
                  onChange={(selected) => {
                    field.onChange(
                      selected
                        ? [...field.value, mode.id]
                        : field.value.filter((value) => value !== mode.id)
                    );
                  }}
                >
                  {mode.label}
                </Checkbox>
              ))}
            </div>
            {errors.modes ? (
              <span className="text-sm text-danger-text">Choose at least one mode.</span>
            ) : null}
          </fieldset>
        )}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        Create event
      </Button>
    </Form>
  );
}

export function EventAdminView() {
  const { events, isLoading, selectEvent, selectedEvent } = useEvent();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useState(false);

  if (!can('event_manage')) {
    return <Alert title="Event management is unavailable for this account." tone="danger" />;
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Badge>{events.length} events</Badge>
        <DialogTrigger isOpen={createOpen} onOpenChange={setCreateOpen}>
          <Button>Create event</Button>
          <Dialog
            description="This creates an undated event with the selected lifecycle."
            title="Create event"
          >
            <CreateEventForm
              onDone={() => {
                setCreateOpen(false);
              }}
            />
          </Dialog>
        </DialogTrigger>
      </div>

      {events.length === 0 ? (
        <EmptyState
          action={
            <Button
              onPress={() => {
                setCreateOpen(true);
              }}
              tone="secondary"
            >
              Create event
            </Button>
          }
          description="Create the first event before publishing challenges."
          title="No events"
        />
      ) : (
        <Table aria-label="Organizer events">
          <TableHeader>
            <TableColumn isRowHeader>Event</TableColumn>
            <TableColumn>State</TableColumn>
            <TableColumn>Participation</TableColumn>
            <TableColumn>Modes</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyState="No events.">
            {events.map((event) => (
              <TableRow id={event.id} key={event.id}>
                <TableCell>
                  <span className="grid gap-1">
                    <span className="font-medium text-text">{event.name}</span>
                    <span className="font-mono text-xs text-text-muted">{event.slug}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <Badge tone={event.state === 'live' ? 'success' : 'neutral'}>{event.state}</Badge>
                </TableCell>
                <TableCell>{event.participation}</TableCell>
                <TableCell>{event.modes.join(', ')}</TableCell>
                <TableCell>
                  {selectedEvent?.id === event.id ? (
                    <span className="text-sm text-text-muted">Selected</span>
                  ) : (
                    <Button
                      isDisabled={isLoading}
                      onPress={() => {
                        void selectEvent(event.id);
                      }}
                      size="small"
                      tone="secondary"
                    >
                      Use event
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
