import { z } from 'zod';

import type { CreateEventInput, EventSummary } from './api/client';

const eventModeIds = ['jeopardy', 'koth', 'attack_defense', 'workshop'] as const;
const participationIds = ['individual', 'team', 'hybrid'] as const;
const eventStateIds = ['draft', 'scheduled', 'live', 'paused', 'ended', 'archived'] as const;

export const eventModeOptions = [
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

export const participationOptions = [
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

export const eventStateOptions = [
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

const optionalLocalDateTimeSchema = z.string().refine((value) => {
  return value.length === 0 || !Number.isNaN(new Date(value).getTime());
}, 'Enter a valid date and time.');

export const eventCreationSchema = z
  .object({
    description: z.string().trim().max(100_000, 'Use no more than 100,000 characters.'),
    ends_at: optionalLocalDateTimeSchema,
    modes: z.array(z.enum(eventModeIds)).min(1, 'Choose at least one mode.'),
    name: z
      .string()
      .trim()
      .min(1, 'Enter an event name.')
      .max(120, 'Use no more than 120 characters.'),
    participation: z.enum(participationIds),
    slug: z
      .string()
      .trim()
      .min(1, 'Enter an event key.')
      .max(63, 'Use no more than 63 characters.')
      .regex(
        /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]*[a-z0-9])$/u,
        'Use lowercase letters, numbers, and hyphens.'
      ),
    starts_at: optionalLocalDateTimeSchema,
    state: z.enum(eventStateIds),
    team_size_limit: z
      .number()
      .int('Enter a whole number.')
      .min(1, 'Use at least 1.')
      .max(32_767, 'Use no more than 32,767.')
  })
  .superRefine((values, context) => {
    if (!values.starts_at || !values.ends_at) {
      return;
    }

    if (new Date(values.ends_at).getTime() <= new Date(values.starts_at).getTime()) {
      context.addIssue({
        code: 'custom',
        message: 'End must be after start.',
        path: ['ends_at']
      });
    }
  });

export type EventCreationValues = z.infer<typeof eventCreationSchema>;

export const divisionMutationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a division name.')
    .max(100, 'Use no more than 100 characters.')
    .refine((value) => !/\p{Cc}/u.test(value), 'Use printable characters only.'),
  position: z
    .number()
    .int('Enter a whole number.')
    .min(0, 'Use 0 or greater.')
    .max(100_000, 'Use no more than 100,000.')
});

export type DivisionMutationValues = z.infer<typeof divisionMutationSchema>;

export const bracketMutationSchema = z.object({
  advancement_slots: z
    .number()
    .int('Enter a whole number.')
    .min(0, 'Use 0 or greater.')
    .max(32_767, 'Use no more than 32,767.'),
  name: z
    .string()
    .trim()
    .min(1, 'Enter a bracket name.')
    .max(100, 'Use no more than 100 characters.')
    .refine((value) => !/\p{Cc}/u.test(value), 'Use printable characters only.')
});

export type BracketMutationValues = z.infer<typeof bracketMutationSchema>;

export function createEventInput(values: EventCreationValues): CreateEventInput {
  return {
    description: values.description,
    ends_at: values.ends_at ? new Date(values.ends_at).toISOString() : null,
    modes: values.modes,
    name: values.name,
    participation: values.participation,
    slug: values.slug,
    starts_at: values.starts_at ? new Date(values.starts_at).toISOString() : null,
    state: values.state,
    team_size_limit: values.participation === 'individual' ? null : values.team_size_limit
  };
}

export function eventStateLabel(state: string): string {
  return eventStateOptions.find((option) => option.id === state)?.label ?? state;
}

export function formatEventDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function eventScheduleLabel(event: EventSummary): string {
  if (event.starts_at && event.ends_at) {
    return `${formatEventDateTime(event.starts_at)} to ${formatEventDateTime(event.ends_at)}`;
  }

  if (event.starts_at) {
    return `Starts ${formatEventDateTime(event.starts_at)}`;
  }

  if (event.ends_at) {
    return `Ends ${formatEventDateTime(event.ends_at)}`;
  }

  return 'No schedule';
}

export function scoreboardStateLabel(event: EventSummary): string {
  if (event.scoreboard_hidden) {
    return 'Hidden';
  }

  if (event.scoreboard_frozen) {
    return 'Frozen';
  }

  return 'Visible and live';
}
