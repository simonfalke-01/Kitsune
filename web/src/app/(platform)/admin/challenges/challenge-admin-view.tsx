'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

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
  NumberField,
  Select,
  Switch,
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
import { api, errorMessage, type ChallengeSummary } from '@/lib/api/client';

const challengeSchema = z.object({
  answer: z.string().min(1, 'Enter the accepted flag.'),
  category: z.string().trim().min(1, 'Enter a category.'),
  description: z.string().trim().min(1, 'Enter a challenge description.'),
  max_attempts: z.number().int().min(0).max(100000),
  name: z
    .string()
    .trim()
    .min(1, 'Enter a challenge name.')
    .max(160, 'Use no more than 160 characters.'),
  points: z.number().int().min(0).max(1000000000),
  position: z.number().int().min(0).max(100000),
  state: z.enum(['draft', 'testing', 'scheduled', 'published', 'hidden', 'archived']),
  tags: z.string(),
  writeups_enabled: z.boolean()
});

type ChallengeValues = z.infer<typeof challengeSchema>;

const stateOptions = [
  {
    id: 'draft',
    label: 'Draft'
  },
  {
    id: 'testing',
    label: 'Testing'
  },
  {
    id: 'scheduled',
    label: 'Scheduled'
  },
  {
    id: 'published',
    label: 'Published'
  },
  {
    id: 'hidden',
    label: 'Hidden'
  }
] as const;

function scoreLabel(challenge: ChallengeSummary) {
  if (challenge.scoring.kind === 'static') {
    return `${challenge.scoring.points} points`;
  }

  if (challenge.scoring.kind === 'dynamic') {
    return `${challenge.scoring.initial} to ${challenge.scoring.minimum}`;
  }

  return challenge.scoring.strategy;
}

function CreateChallengeForm({
  nextPosition,
  onDone
}: {
  nextPosition: number;
  onDone: () => void;
}) {
  const { refresh, selectedEvent } = useEvent();
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
  } = useForm<ChallengeValues>({
    defaultValues: {
      answer: '',
      category: '',
      description: '',
      max_attempts: 0,
      name: '',
      points: 100,
      position: nextPosition,
      state: 'draft',
      tags: '',
      writeups_enabled: true
    }
  });

  const submit = handleSubmit(async (values) => {
    clearErrors();
    setError(null);
    const parsed = challengeSchema.safeParse(values);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (
          field === 'answer' ||
          field === 'category' ||
          field === 'description' ||
          field === 'max_attempts' ||
          field === 'name' ||
          field === 'points' ||
          field === 'position' ||
          field === 'state' ||
          field === 'tags' ||
          field === 'writeups_enabled'
        ) {
          setFieldError(field, {
            message: issue.message
          });
        }
      }
      return;
    }

    if (!selectedEvent) {
      setError('Choose an event before creating a challenge.');
      return;
    }

    if (!session?.csrf_token) {
      setError('The session could not authorize this action.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await api.POST('/api/v1/events/{event_id}/challenges', {
        body: {
          answers: [
            {
              case_insensitive: false,
              kind: 'exact',
              value: parsed.data.answer
            }
          ],
          category: parsed.data.category,
          description: parsed.data.description,
          hints: [],
          kind: {
            type: 'static_flag'
          },
          max_attempts: parsed.data.max_attempts === 0 ? null : parsed.data.max_attempts,
          name: parsed.data.name,
          position: parsed.data.position,
          scoring: {
            kind: 'static',
            points: parsed.data.points
          },
          state: parsed.data.state,
          survey: [],
          tags: parsed.data.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          visibility: {
            division_ids: [],
            prerequisites: [],
            visible_from: null,
            visible_until: null
          },
          writeups_enabled: parsed.data.writeups_enabled
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
        setError(errorMessage(result.error, 'The challenge could not be created.'));
        return;
      }

      await refresh();
      reset({
        answer: '',
        category: '',
        description: '',
        max_attempts: 0,
        name: '',
        points: 100,
        position: parsed.data.position + 1,
        state: 'draft',
        tags: '',
        writeups_enabled: true
      });
      onDone();
      showToast({
        title: 'Challenge created',
        tone: 'success'
      });
    } catch {
      setError('The challenge could not be created. Check your connection and retry.');
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
            label="Challenge name"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <TextField
            errorMessage={errors.category?.message}
            isInvalid={Boolean(errors.category)}
            label="Category"
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
        name="answer"
        render={({ field }) => (
          <TextField
            errorMessage={errors.answer?.message}
            isInvalid={Boolean(errors.answer)}
            label="Accepted flag"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Controller
          control={control}
          name="points"
          render={({ field }) => (
            <NumberField
              errorMessage={errors.points?.message}
              isInvalid={Boolean(errors.points)}
              label="Points"
              maxValue={1000000000}
              minValue={0}
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
              errorMessage={errors.position?.message}
              isInvalid={Boolean(errors.position)}
              label="Position"
              maxValue={100000}
              minValue={0}
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="max_attempts"
          render={({ field }) => (
            <NumberField
              description="Zero allows unlimited attempts."
              errorMessage={errors.max_attempts?.message}
              isInvalid={Boolean(errors.max_attempts)}
              label="Attempt limit"
              maxValue={100000}
              minValue={0}
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              value={field.value}
            />
          )}
        />
      </div>
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
        name="tags"
        render={({ field }) => (
          <TextField
            description="Separate tags with commas."
            errorMessage={errors.tags?.message}
            isInvalid={Boolean(errors.tags)}
            label="Tags"
            name={field.name}
            onBlur={field.onBlur}
            onChange={field.onChange}
            value={field.value}
          />
        )}
      />
      <Controller
        control={control}
        name="writeups_enabled"
        render={({ field }) => (
          <Switch
            description="Allow competitors to submit a writeup after solving."
            isSelected={field.value}
            label="Writeups"
            onChange={field.onChange}
          />
        )}
      />
      {error ? <Alert title={error} tone="danger" /> : null}
      <Button isLoading={isSubmitting} type="submit">
        Create challenge
      </Button>
    </Form>
  );
}

export function ChallengeAdminView() {
  const { challenges, isLoading, selectedEvent } = useEvent();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const nextPosition =
    challenges.reduce((maximum, challenge) => Math.max(maximum, challenge.position), -1) + 1;

  if (!can('challenge_manage')) {
    return <Alert title="Challenge authoring is unavailable for this account." tone="danger" />;
  }

  if (!selectedEvent) {
    return (
      <EmptyState
        description="Choose an event from the event switcher before authoring challenges."
        title="No event selected"
      />
    );
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-accent-border bg-accent-subtle p-4">
        <div className="grid gap-1">
          <span className="font-display text-lg font-semibold text-text">{selectedEvent.name}</span>
          <span className="text-sm text-text-muted">{challenges.length} challenges</span>
        </div>
        <DialogTrigger isOpen={createOpen} onOpenChange={setCreateOpen}>
          <Button>Create challenge</Button>
          <Dialog
            description="Create a static flag challenge. Other challenge kinds remain API-only."
            title="Create challenge"
          >
            <CreateChallengeForm
              nextPosition={nextPosition}
              onDone={() => {
                setCreateOpen(false);
              }}
            />
          </Dialog>
        </DialogTrigger>
      </section>

      {isLoading ? (
        <Alert title="Refreshing challenge inventory." tone="info" />
      ) : challenges.length === 0 ? (
        <EmptyState
          action={
            <Button
              onPress={() => {
                setCreateOpen(true);
              }}
              tone="secondary"
            >
              Create challenge
            </Button>
          }
          description="Create the first challenge for this event."
          title="No challenges"
        />
      ) : (
        <Table aria-label={`${selectedEvent.name} challenges`}>
          <TableHeader>
            <TableColumn isRowHeader>Challenge</TableColumn>
            <TableColumn>State</TableColumn>
            <TableColumn>Category</TableColumn>
            <TableColumn>Score</TableColumn>
            <TableColumn>Position</TableColumn>
          </TableHeader>
          <TableBody emptyState="No challenges.">
            {challenges.map((challenge) => (
              <TableRow id={challenge.id} key={challenge.id}>
                <TableCell>
                  <span className="grid gap-1">
                    <span className="font-medium text-text">{challenge.name}</span>
                    <span className="text-xs text-text-muted">
                      {challenge.tags.length > 0 ? challenge.tags.join(', ') : 'No tags'}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <Badge tone={challenge.state === 'published' ? 'success' : 'neutral'}>
                    {challenge.state}
                  </Badge>
                </TableCell>
                <TableCell>{challenge.category}</TableCell>
                <TableCell>{scoreLabel(challenge)}</TableCell>
                <TableCell>{challenge.position}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
