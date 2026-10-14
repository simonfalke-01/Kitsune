'use client';

import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { EventClassificationAdmin } from './event-classification-admin';
import { EventDraftDialog } from './event-draft-dialog';
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
  Link,
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
import type { EventSummary } from '@/lib/api/client';
import {
  createEventInput,
  eventCreationSchema,
  type EventCreationValues,
  eventModeOptions,
  eventScheduleLabel,
  eventStateLabel,
  eventStateOptions,
  participationOptions,
  scoreboardStateLabel
} from '@/lib/admin-events';

const eventDefaults: EventCreationValues = {
  description: '',
  ends_at: '',
  modes: ['jeopardy'],
  name: '',
  participation: 'team',
  slug: '',
  starts_at: '',
  state: 'draft',
  team_size_limit: 4
};

function EventStateBadge({ state }: { state: string }) {
  const tone = state === 'live' ? 'success' : state === 'paused' ? 'warning' : 'neutral';

  return <Badge tone={tone}>{eventStateLabel(state)}</Badge>;
}

function EventSelectionAction({ event }: { event: EventSummary }) {
  const { isLoading, selectEvent, selectedEvent } = useEvent();

  if (selectedEvent?.id === event.id) {
    return <span className="text-sm text-text-muted">Selected</span>;
  }

  return (
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
  );
}

function EventList({ events }: { events: EventSummary[] }) {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {events.map((event) => (
          <article
            className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4"
            key={event.id}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="grid min-w-0 gap-1">
                <strong className="truncate font-medium text-text">{event.name}</strong>
                <span className="truncate font-mono text-xs text-text-muted">{event.slug}</span>
              </div>
              <EventStateBadge state={event.state} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-text-muted">Schedule</dt>
                <dd className="m-0 text-text">{eventScheduleLabel(event)}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Participation</dt>
                <dd className="m-0 text-text">
                  {event.participation}
                  {event.team_size_limit ? `, up to ${event.team_size_limit}` : ''}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-text-muted">Modes</dt>
                <dd className="m-0 text-text">{event.modes.join(', ')}</dd>
              </div>
            </dl>
            <div>
              <EventSelectionAction event={event} />
            </div>
          </article>
        ))}
      </div>

      <div className="hidden md:block">
        <Table aria-label="Organizer events">
          <TableHeader>
            <TableColumn isRowHeader>Event</TableColumn>
            <TableColumn>State</TableColumn>
            <TableColumn>Schedule</TableColumn>
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
                  <EventStateBadge state={event.state} />
                </TableCell>
                <TableCell>{eventScheduleLabel(event)}</TableCell>
                <TableCell>
                  {event.participation}
                  {event.team_size_limit ? `, up to ${event.team_size_limit}` : ''}
                </TableCell>
                <TableCell>{event.modes.join(', ')}</TableCell>
                <TableCell>
                  <EventSelectionAction event={event} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

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
  } = useForm<EventCreationValues>({
    defaultValues: eventDefaults
  });
  const participation = useWatch({
    control,
    name: 'participation'
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = eventCreationSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (
          field === 'description' ||
          field === 'ends_at' ||
          field === 'modes' ||
          field === 'name' ||
          field === 'participation' ||
          field === 'slug' ||
          field === 'starts_at' ||
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
        body: createEventInput(parsed.data),
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
      reset(eventDefaults);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="starts_at"
          render={({ field }) => (
            <TextField
              description="Optional. Uses your current time zone."
              errorMessage={errors.starts_at?.message}
              isInvalid={Boolean(errors.starts_at)}
              label="Starts"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              type="datetime-local"
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="ends_at"
          render={({ field }) => (
            <TextField
              description="Optional. Must be after start when both are set."
              errorMessage={errors.ends_at?.message}
              isInvalid={Boolean(errors.ends_at)}
              label="Ends"
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              type="datetime-local"
              value={field.value}
            />
          )}
        />
      </div>
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
              maxValue={32_767}
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
            options={eventStateOptions}
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
              {eventModeOptions.map((mode) => (
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
              <span className="text-sm text-danger-text">{errors.modes.message}</span>
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

function SelectedEventContext({ event }: { event: EventSummary }) {
  const { can } = useSession();

  return (
    <section
      aria-labelledby="selected-event-title"
      className="grid gap-4 border-l-2 border-accent bg-surface-raised px-4 py-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <span className="text-xs font-semibold tracking-wide text-text-muted">
            Selected event
          </span>
          <h2
            className="m-0 font-display text-lg font-semibold tracking-tight text-text"
            id="selected-event-title"
          >
            {event.name}
          </h2>
        </div>
        <Link href="/admin">Open live operations</Link>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-text-muted">Lifecycle</dt>
          <dd className="m-0 text-text">{eventStateLabel(event.state)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Scoreboard</dt>
          <dd className="m-0 text-text">{scoreboardStateLabel(event)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Schedule</dt>
          <dd className="m-0 text-text">{eventScheduleLabel(event)}</dd>
        </div>
      </dl>
      {!can('scoreboard_manage') ? (
        <p className="m-0 text-sm text-text-muted">
          Scoreboard controls require scoreboard management permission.
        </p>
      ) : null}
    </section>
  );
}

export function EventAdminView() {
  const { error, events, isLoading, refresh, selectedEvent } = useEvent();
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
            description="Set participation, modes, timing, and initial state."
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

      {isLoading && events.length === 0 ? (
        <Alert title="Loading events" />
      ) : error && events.length === 0 ? null : events.length === 0 ? (
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
        <EventList events={events} />
      )}

      {selectedEvent ? (
        <>
          <SelectedEventContext event={selectedEvent} />
          <div className="flex flex-wrap items-center gap-2">
            <EventDraftDialog event={selectedEvent} key={selectedEvent.id} />
            <Button isDisabled tone="danger">
              Delete event
            </Button>
            <Badge tone="info">Delete API pending</Badge>
          </div>
          <EventClassificationAdmin event={selectedEvent} key={selectedEvent.id} />
        </>
      ) : events.length > 0 && !isLoading ? (
        <EmptyState
          description="Select an event to manage its divisions and brackets."
          title="No event selected"
        />
      ) : null}
    </div>
  );
}
