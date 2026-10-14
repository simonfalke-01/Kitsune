'use client';

import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useSession } from '../../../session-context';
import {
  Alert,
  AlertDialog,
  Button,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  NumberField,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  TextField,
  showToast
} from '@/components/ui';
import {
  api,
  errorMessage,
  type BracketSummary,
  type DivisionSummary,
  type EventSummary
} from '@/lib/api/client';
import {
  bracketMutationSchema,
  type BracketMutationValues,
  divisionMutationSchema,
  type DivisionMutationValues
} from '@/lib/admin-events';

interface ClassificationState {
  brackets: BracketSummary[];
  divisions: DivisionSummary[];
}

const classificationLoadFallback =
  'Divisions and brackets could not be loaded. Check your connection and retry.';

class ClassificationLoadError extends Error {}

async function fetchClassifications(eventId: string): Promise<ClassificationState> {
  try {
    const [divisionResult, bracketResult] = await Promise.all([
      api.GET('/api/v1/events/{event_id}/divisions', {
        params: {
          path: {
            event_id: eventId
          }
        }
      }),
      api.GET('/api/v1/events/{event_id}/brackets', {
        params: {
          path: {
            event_id: eventId
          }
        }
      })
    ]);

    if (!divisionResult.data || !bracketResult.data) {
      throw new ClassificationLoadError(
        errorMessage(
          divisionResult.error ?? bracketResult.error,
          'Divisions and brackets could not be loaded.'
        )
      );
    }

    return {
      brackets: [...bracketResult.data].sort((left, right) => left.name.localeCompare(right.name)),
      divisions: [...divisionResult.data].sort((left, right) => {
        const positionDifference = left.position - right.position;

        return positionDifference !== 0 ? positionDifference : left.name.localeCompare(right.name);
      })
    };
  } catch (error) {
    if (error instanceof ClassificationLoadError) {
      throw error;
    }

    throw new ClassificationLoadError(classificationLoadFallback);
  }
}

function DivisionForm({
  division,
  eventId,
  onSaved
}: {
  division?: DivisionSummary;
  eventId: string;
  onSaved: () => Promise<void>;
}) {
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    clearErrors,
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors }
  } = useForm<DivisionMutationValues>({
    defaultValues: {
      name: division?.name ?? '',
      position: division?.position ?? 0
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = divisionMutationSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (field === 'name' || field === 'position') {
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
      const result = division
        ? await api.PATCH('/api/v1/events/{event_id}/divisions/{division_id}', {
            body: parsed.data,
            headers: {
              'x-csrf-token': session.csrf_token
            },
            params: {
              path: {
                division_id: division.id,
                event_id: eventId
              }
            }
          })
        : await api.POST('/api/v1/events/{event_id}/divisions', {
            body: parsed.data,
            headers: {
              'x-csrf-token': session.csrf_token
            },
            params: {
              path: {
                event_id: eventId
              }
            }
          });

      if (!result.data) {
        setError(errorMessage(result.error, 'The division could not be saved.'));
        return;
      }

      await onSaved();
      showToast({
        title: division ? 'Division updated' : 'Division created',
        tone: 'success'
      });
    } catch {
      setError('The division could not be saved. Check your connection and retry.');
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
            label="Division name"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="position"
        render={({ field }) => (
          <NumberField
            description="Lower positions appear first."
            errorMessage={errors.position?.message}
            isInvalid={Boolean(errors.position)}
            label="Position"
            maxValue={100_000}
            minValue={0}
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        {division ? 'Save division' : 'Create division'}
      </Button>
    </Form>
  );
}

function DivisionEditor({
  division,
  eventId,
  onSaved
}: {
  division?: DivisionSummary;
  eventId: string;
  onSaved: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button size="small" tone={division ? 'secondary' : 'primary'}>
        {division ? 'Edit' : 'Create division'}
      </Button>
      <Dialog
        description={
          division
            ? 'Change this division name or ordering position.'
            : 'Divisions group entrants for rankings and visibility.'
        }
        title={division ? 'Edit division' : 'Create division'}
      >
        <DivisionForm
          division={division}
          eventId={eventId}
          onSaved={async () => {
            await onSaved();
            setIsOpen(false);
          }}
        />
      </Dialog>
    </DialogTrigger>
  );
}

function DeleteDivision({
  division,
  eventId,
  onDeleted
}: {
  division: DivisionSummary;
  eventId: string;
  onDeleted: () => Promise<void>;
}) {
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const remove = async () => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/events/{event_id}/divisions/{division_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            division_id: division.id,
            event_id: eventId
          }
        }
      });

      if (!result.response.ok) {
        setError(errorMessage(result.error, 'The division could not be deleted.'));
        return;
      }

      await onDeleted();
      setIsOpen(false);
      showToast({
        title: 'Division deleted',
        tone: 'success'
      });
    } catch {
      setError('The division could not be deleted. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button size="small" tone="danger">
        Delete
      </Button>
      <AlertDialog
        actions={
          <>
            <Button isDisabled={isSubmitting} slot="close" tone="quiet">
              Keep division
            </Button>
            <Button
              isLoading={isSubmitting}
              onPress={() => {
                void remove();
              }}
              tone="danger"
            >
              Delete division
            </Button>
          </>
        }
        description={`${division.name} will be removed. Divisions assigned to entrants cannot be deleted.`}
        title="Delete this division?"
      >
        {error ? <Alert title={error} tone="danger" /> : null}
      </AlertDialog>
    </DialogTrigger>
  );
}

function BracketForm({
  bracket,
  eventId,
  onSaved
}: {
  bracket?: BracketSummary;
  eventId: string;
  onSaved: () => Promise<void>;
}) {
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    clearErrors,
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors }
  } = useForm<BracketMutationValues>({
    defaultValues: {
      advancement_slots: bracket?.advancement_slots ?? 0,
      name: bracket?.name ?? ''
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = bracketMutationSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (field === 'advancement_slots' || field === 'name') {
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
      const result = bracket
        ? await api.PATCH('/api/v1/events/{event_id}/brackets/{bracket_id}', {
            body: parsed.data,
            headers: {
              'x-csrf-token': session.csrf_token
            },
            params: {
              path: {
                bracket_id: bracket.id,
                event_id: eventId
              }
            }
          })
        : await api.POST('/api/v1/events/{event_id}/brackets', {
            body: parsed.data,
            headers: {
              'x-csrf-token': session.csrf_token
            },
            params: {
              path: {
                event_id: eventId
              }
            }
          });

      if (!result.data) {
        setError(errorMessage(result.error, 'The bracket could not be saved.'));
        return;
      }

      await onSaved();
      showToast({
        title: bracket ? 'Bracket updated' : 'Bracket created',
        tone: 'success'
      });
    } catch {
      setError('The bracket could not be saved. Check your connection and retry.');
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
            label="Bracket name"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="advancement_slots"
        render={({ field }) => (
          <NumberField
            description="Number of entrants that advance from this bracket."
            errorMessage={errors.advancement_slots?.message}
            isInvalid={Boolean(errors.advancement_slots)}
            label="Advancement slots"
            maxValue={32_767}
            minValue={0}
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        {bracket ? 'Save bracket' : 'Create bracket'}
      </Button>
    </Form>
  );
}

function BracketEditor({
  bracket,
  eventId,
  onSaved
}: {
  bracket?: BracketSummary;
  eventId: string;
  onSaved: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button size="small" tone={bracket ? 'secondary' : 'primary'}>
        {bracket ? 'Edit' : 'Create bracket'}
      </Button>
      <Dialog
        description={
          bracket
            ? 'Change this bracket name or advancement count.'
            : 'Brackets group entrants for staged advancement.'
        }
        title={bracket ? 'Edit bracket' : 'Create bracket'}
      >
        <BracketForm
          bracket={bracket}
          eventId={eventId}
          onSaved={async () => {
            await onSaved();
            setIsOpen(false);
          }}
        />
      </Dialog>
    </DialogTrigger>
  );
}

function DeleteBracket({
  bracket,
  eventId,
  onDeleted
}: {
  bracket: BracketSummary;
  eventId: string;
  onDeleted: () => Promise<void>;
}) {
  const { session } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const remove = async () => {
    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await api.DELETE('/api/v1/events/{event_id}/brackets/{bracket_id}', {
        headers: {
          'x-csrf-token': session.csrf_token
        },
        params: {
          path: {
            bracket_id: bracket.id,
            event_id: eventId
          }
        }
      });

      if (!result.response.ok) {
        setError(errorMessage(result.error, 'The bracket could not be deleted.'));
        return;
      }

      await onDeleted();
      setIsOpen(false);
      showToast({
        title: 'Bracket deleted',
        tone: 'success'
      });
    } catch {
      setError('The bracket could not be deleted. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button size="small" tone="danger">
        Delete
      </Button>
      <AlertDialog
        actions={
          <>
            <Button isDisabled={isSubmitting} slot="close" tone="quiet">
              Keep bracket
            </Button>
            <Button
              isLoading={isSubmitting}
              onPress={() => {
                void remove();
              }}
              tone="danger"
            >
              Delete bracket
            </Button>
          </>
        }
        description={`${bracket.name} will be removed. Brackets assigned to entrants cannot be deleted.`}
        title="Delete this bracket?"
      >
        {error ? <Alert title={error} tone="danger" /> : null}
      </AlertDialog>
    </DialogTrigger>
  );
}

function DivisionCollection({
  divisions,
  eventId,
  onRefresh
}: {
  divisions: DivisionSummary[];
  eventId: string;
  onRefresh: () => Promise<void>;
}) {
  if (divisions.length === 0) {
    return (
      <EmptyState
        action={<DivisionEditor eventId={eventId} onSaved={onRefresh} />}
        description="Create a division to group entrants for ranking and challenge visibility."
        title="No divisions"
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-sm text-text-muted">{divisions.length} divisions</span>
        <DivisionEditor eventId={eventId} onSaved={onRefresh} />
      </div>
      <div className="grid gap-3 md:hidden">
        {divisions.map((division) => (
          <article
            className="grid gap-3 rounded-lg border border-border-subtle bg-surface-raised p-4"
            key={division.id}
          >
            <div>
              <strong className="text-sm font-semibold text-text">{division.name}</strong>
              <p className="m-0 text-sm text-text-muted">Position {division.position}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DivisionEditor division={division} eventId={eventId} onSaved={onRefresh} />
              <DeleteDivision division={division} eventId={eventId} onDeleted={onRefresh} />
            </div>
          </article>
        ))}
      </div>
      <div className="hidden md:block">
        <Table aria-label="Event divisions">
          <TableHeader>
            <TableColumn isRowHeader>Division</TableColumn>
            <TableColumn>Position</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyState="No divisions.">
            {divisions.map((division) => (
              <TableRow id={division.id} key={division.id}>
                <TableCell>{division.name}</TableCell>
                <TableCell>{division.position}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <DivisionEditor division={division} eventId={eventId} onSaved={onRefresh} />
                    <DeleteDivision division={division} eventId={eventId} onDeleted={onRefresh} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function BracketCollection({
  brackets,
  eventId,
  onRefresh
}: {
  brackets: BracketSummary[];
  eventId: string;
  onRefresh: () => Promise<void>;
}) {
  if (brackets.length === 0) {
    return (
      <EmptyState
        action={<BracketEditor eventId={eventId} onSaved={onRefresh} />}
        description="Create a bracket when entrants advance through staged competition."
        title="No brackets"
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-sm text-text-muted">{brackets.length} brackets</span>
        <BracketEditor eventId={eventId} onSaved={onRefresh} />
      </div>
      <div className="grid gap-3 md:hidden">
        {brackets.map((bracket) => (
          <article
            className="grid gap-3 rounded-lg border border-border-subtle bg-surface-raised p-4"
            key={bracket.id}
          >
            <div>
              <strong className="text-sm font-semibold text-text">{bracket.name}</strong>
              <p className="m-0 text-sm text-text-muted">
                {bracket.advancement_slots} advancement slots
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BracketEditor bracket={bracket} eventId={eventId} onSaved={onRefresh} />
              <DeleteBracket bracket={bracket} eventId={eventId} onDeleted={onRefresh} />
            </div>
          </article>
        ))}
      </div>
      <div className="hidden md:block">
        <Table aria-label="Event brackets">
          <TableHeader>
            <TableColumn isRowHeader>Bracket</TableColumn>
            <TableColumn>Advancement slots</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyState="No brackets.">
            {brackets.map((bracket) => (
              <TableRow id={bracket.id} key={bracket.id}>
                <TableCell>{bracket.name}</TableCell>
                <TableCell>{bracket.advancement_slots}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <BracketEditor bracket={bracket} eventId={eventId} onSaved={onRefresh} />
                    <DeleteBracket bracket={bracket} eventId={eventId} onDeleted={onRefresh} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function EventClassificationAdmin({ event }: { event: EventSummary }) {
  const [classifications, setClassifications] = useState<ClassificationState>({
    brackets: [],
    divisions: []
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setClassifications(await fetchClassifications(event.id));
    } catch (loadError) {
      setError(
        loadError instanceof ClassificationLoadError
          ? loadError.message
          : classificationLoadFallback
      );
    } finally {
      setIsLoading(false);
    }
  }, [event.id]);

  useEffect(() => {
    let isCurrent = true;

    void fetchClassifications(event.id)
      .then((nextClassifications) => {
        if (isCurrent) {
          setClassifications(nextClassifications);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setError(
            loadError instanceof ClassificationLoadError
              ? loadError.message
              : classificationLoadFallback
          );
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [event.id]);

  return (
    <section aria-busy={isLoading} aria-labelledby="event-groups-title" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2
          className="m-0 font-display text-xl font-semibold tracking-tight text-text"
          id="event-groups-title"
        >
          Entrant groups
        </h2>
        <Button
          isLoading={isLoading}
          onPress={() => {
            void load();
          }}
          size="small"
          tone="secondary"
        >
          Refresh
        </Button>
      </div>

      {error ? (
        <Alert
          actions={
            <Button
              onPress={() => {
                void load();
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

      {isLoading && !error ? (
        <Alert title="Loading divisions and brackets" />
      ) : !error ? (
        <Tabs defaultSelectedKey="divisions">
          <TabsList aria-label="Entrant group type">
            <TabsTab id="divisions">Divisions</TabsTab>
            <TabsTab id="brackets">Brackets</TabsTab>
          </TabsList>
          <TabsPanel id="divisions">
            <DivisionCollection
              divisions={classifications.divisions}
              eventId={event.id}
              onRefresh={load}
            />
          </TabsPanel>
          <TabsPanel id="brackets">
            <BracketCollection
              brackets={classifications.brackets}
              eventId={event.id}
              onRefresh={load}
            />
          </TabsPanel>
        </Tabs>
      ) : null}
    </section>
  );
}
