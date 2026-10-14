import { z } from 'zod';

import type { ChallengeSummary, CreateChallengeInput } from '@/lib/api/client';

export const challengeKindValues = [
  'static_flag',
  'multiple_choice',
  'dynamic_instance',
  'file_backed',
  'remote_service',
  'manual_verification',
  'plugin'
] as const;

export const answerKindValues = ['exact', 'regex'] as const;
export const scoringKindValues = ['static', 'dynamic', 'plugin'] as const;
export const challengeStateValues = [
  'draft',
  'testing',
  'scheduled',
  'published',
  'hidden',
  'archived'
] as const;

export type ChallengeEditorSection =
  'basics' | 'behavior' | 'scoring' | 'extras' | 'visibility' | 'review';

const editorKey = z.string().min(1);
const nonNegativeInteger = z.number().int().min(0).max(1_000_000_000);
const positiveInteger = z.number().int().min(1).max(1_000_000_000);
const optionalDateTime = z
  .string()
  .refine(
    (value) => value === '' || !Number.isNaN(new Date(value).getTime()),
    'Enter a valid date and time.'
  );

const answerSchema = z.object({
  case_insensitive: z.boolean(),
  editor_key: editorKey,
  kind: z.enum(answerKindValues),
  value: z.string()
});

const choiceSchema = z.object({
  editor_key: editorKey,
  is_correct: z.boolean(),
  value: z.string()
});

const hintSchema = z.object({
  content: z.string(),
  cost: nonNegativeInteger,
  editor_key: editorKey,
  id: positiveInteger
});

const surveySchema = z.object({
  editor_key: editorKey,
  key: z.string(),
  maximum: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  minimum: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  prompt: z.string(),
  required: z.boolean(),
  use_range: z.boolean()
});

export const challengeEditorSchema = z
  .object({
    answers: z.array(answerSchema).max(32, 'Use no more than 32 answer rules.'),
    category: z.string().trim().min(1, 'Enter a category.'),
    choices: z.array(choiceSchema).max(32, 'Use no more than 32 choices.'),
    description: z
      .string()
      .trim()
      .min(1, 'Enter a challenge description.')
      .max(200_000, 'Use no more than 200,000 characters.'),
    division_ids: z.array(z.string().min(1)),
    dynamic_template: z.string(),
    hints: z.array(hintSchema).max(64, 'Use no more than 64 hints.'),
    kind: z.enum(challengeKindValues),
    max_attempts: z.number().int().min(0).max(2_147_483_647),
    name: z
      .string()
      .trim()
      .min(1, 'Enter a challenge name.')
      .max(160, 'Use no more than 160 characters.'),
    plugin_config: z.string(),
    plugin_kind: z.string(),
    plugin_name: z.string(),
    position: z.number().int().min(0).max(100_000),
    prerequisites: z.array(z.string().min(1)),
    remote_connection: z.string(),
    scoring_decay: positiveInteger,
    scoring_initial: nonNegativeInteger,
    scoring_kind: z.enum(scoringKindValues),
    scoring_minimum: nonNegativeInteger,
    scoring_plugin: z.string(),
    scoring_points: nonNegativeInteger,
    scoring_strategy: z.string(),
    state: z.enum(challengeStateValues),
    survey: z.array(surveySchema),
    tags: z.string(),
    visible_from: optionalDateTime,
    visible_until: optionalDateTime,
    writeups_enabled: z.boolean()
  })
  .superRefine((values, context) => {
    const addIssue = (path: (number | string)[], message: string) => {
      context.addIssue({
        code: 'custom',
        message,
        path
      });
    };

    if (
      values.kind === 'static_flag' ||
      values.kind === 'file_backed' ||
      values.kind === 'remote_service'
    ) {
      if (values.answers.length === 0) {
        addIssue(['answers'], 'Add at least one answer rule.');
      }

      for (const [index, answer] of values.answers.entries()) {
        if (answer.value.trim().length === 0) {
          addIssue(
            ['answers', index, 'value'],
            answer.kind === 'exact' ? 'Enter the accepted answer.' : 'Enter a regular expression.'
          );
        } else if (answer.kind === 'regex' && answer.value.length > 2_048) {
          addIssue(
            ['answers', index, 'value'],
            'Use no more than 2,048 characters for a regular expression.'
          );
        }
      }
    }

    if (values.kind === 'multiple_choice') {
      const populatedChoices = values.choices.filter((choice) => choice.value.trim().length > 0);

      if (populatedChoices.length < 2) {
        addIssue(['choices'], 'Add at least two choices.');
      }

      if (!populatedChoices.some((choice) => choice.is_correct)) {
        addIssue(['choices'], 'Mark at least one choice as correct.');
      }

      const normalizedChoices = populatedChoices.map((choice) => choice.value.trim().toLowerCase());
      if (new Set(normalizedChoices).size !== normalizedChoices.length) {
        addIssue(['choices'], 'Choice labels must be unique.');
      }

      for (const [index, choice] of values.choices.entries()) {
        if (choice.value.trim().length === 0) {
          addIssue(['choices', index, 'value'], 'Enter the choice label.');
        }
      }
    }

    if (values.kind === 'dynamic_instance' && values.dynamic_template.trim().length === 0) {
      addIssue(['dynamic_template'], 'Enter the dynamic instance template key.');
    }

    if (values.kind === 'remote_service' && values.remote_connection.trim().length === 0) {
      addIssue(['remote_connection'], 'Enter the service connection details.');
    }

    if (values.kind === 'plugin') {
      if (values.plugin_name.trim().length === 0) {
        addIssue(['plugin_name'], 'Enter the challenge plugin key.');
      }
      if (values.plugin_kind.trim().length === 0) {
        addIssue(['plugin_kind'], 'Enter the plugin challenge kind.');
      }
      try {
        JSON.parse(values.plugin_config.trim() || '{}');
      } catch {
        addIssue(['plugin_config'], 'Enter valid JSON configuration.');
      }
    }

    if (values.scoring_kind === 'dynamic' && values.scoring_minimum > values.scoring_initial) {
      addIssue(['scoring_minimum'], 'Minimum points cannot exceed initial points.');
    }

    if (values.scoring_kind === 'plugin') {
      if (values.scoring_plugin.trim().length === 0) {
        addIssue(['scoring_plugin'], 'Enter the scoring plugin key.');
      }
      if (values.scoring_strategy.trim().length === 0) {
        addIssue(['scoring_strategy'], 'Enter the scoring strategy key.');
      }
    }

    const hintIds = values.hints.map((hint) => hint.id);
    if (new Set(hintIds).size !== hintIds.length) {
      addIssue(['hints'], 'Hint IDs must be unique.');
    }
    for (const [index, hint] of values.hints.entries()) {
      if (hint.content.trim().length === 0) {
        addIssue(['hints', index, 'content'], 'Enter the hint content.');
      }
    }

    const surveyKeys = values.survey.map((item) => item.key.trim().toLowerCase()).filter(Boolean);
    if (new Set(surveyKeys).size !== surveyKeys.length) {
      addIssue(['survey'], 'Survey keys must be unique.');
    }
    for (const [index, item] of values.survey.entries()) {
      if (item.key.trim().length === 0) {
        addIssue(['survey', index, 'key'], 'Enter a stable survey key.');
      }
      if (item.prompt.trim().length === 0) {
        addIssue(['survey', index, 'prompt'], 'Enter the survey prompt.');
      }
      if (item.use_range && item.minimum > item.maximum) {
        addIssue(['survey', index, 'maximum'], 'Maximum must be at least the minimum.');
      }
    }

    if (
      values.visible_from &&
      values.visible_until &&
      new Date(values.visible_until) <= new Date(values.visible_from)
    ) {
      addIssue(['visible_until'], 'Hide time must be after the release time.');
    }
  });

export type ChallengeEditorValues = z.infer<typeof challengeEditorSchema>;

export interface ChallengeEditorIssue {
  message: string;
  path: string;
  section: ChallengeEditorSection;
}

const sectionByField: Record<string, ChallengeEditorSection> = {
  answers: 'behavior',
  category: 'basics',
  choices: 'behavior',
  description: 'basics',
  division_ids: 'visibility',
  dynamic_template: 'behavior',
  hints: 'extras',
  kind: 'behavior',
  max_attempts: 'basics',
  name: 'basics',
  plugin_config: 'behavior',
  plugin_kind: 'behavior',
  plugin_name: 'behavior',
  position: 'basics',
  prerequisites: 'visibility',
  remote_connection: 'behavior',
  scoring_decay: 'scoring',
  scoring_initial: 'scoring',
  scoring_kind: 'scoring',
  scoring_minimum: 'scoring',
  scoring_plugin: 'scoring',
  scoring_points: 'scoring',
  scoring_strategy: 'scoring',
  state: 'basics',
  survey: 'extras',
  tags: 'basics',
  visible_from: 'visibility',
  visible_until: 'visibility',
  writeups_enabled: 'basics'
};

export function defaultChallengeEditorValues(nextPosition: number): ChallengeEditorValues {
  return {
    answers: [
      {
        case_insensitive: false,
        editor_key: 'answer-1',
        kind: 'exact',
        value: ''
      }
    ],
    category: '',
    choices: [
      {
        editor_key: 'choice-1',
        is_correct: true,
        value: ''
      },
      {
        editor_key: 'choice-2',
        is_correct: false,
        value: ''
      }
    ],
    description: '',
    division_ids: [],
    dynamic_template: '',
    hints: [],
    kind: 'static_flag',
    max_attempts: 0,
    name: '',
    plugin_config: '{}',
    plugin_kind: '',
    plugin_name: '',
    position: nextPosition,
    prerequisites: [],
    remote_connection: '',
    scoring_decay: 100,
    scoring_initial: 500,
    scoring_kind: 'static',
    scoring_minimum: 100,
    scoring_plugin: '',
    scoring_points: 100,
    scoring_strategy: '',
    state: 'draft',
    survey: [],
    tags: '',
    visible_from: '',
    visible_until: '',
    writeups_enabled: true
  };
}

export function validateChallengeEditor(values: ChallengeEditorValues): ChallengeEditorIssue[] {
  const result = challengeEditorSchema.safeParse(values);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => {
    const firstField = String(issue.path[0] ?? 'review');

    return {
      message: issue.message,
      path: issue.path.join('.'),
      section: sectionByField[firstField] ?? 'review'
    };
  });
}

function dateTimeValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function toCreateChallengeInput(values: ChallengeEditorValues): CreateChallengeInput {
  const parsed = challengeEditorSchema.parse(values);
  let kind: CreateChallengeInput['kind'];
  let answers: CreateChallengeInput['answers'];

  switch (parsed.kind) {
    case 'multiple_choice':
      kind = {
        choices: parsed.choices.map((choice) => choice.value.trim()),
        type: 'multiple_choice'
      };
      answers = parsed.choices
        .filter((choice) => choice.is_correct)
        .map((choice) => ({
          kind: 'choice',
          value: choice.value.trim()
        }));
      break;
    case 'dynamic_instance':
      kind = {
        template: parsed.dynamic_template.trim(),
        type: 'dynamic_instance'
      };
      answers = [{ kind: 'dynamic' }];
      break;
    case 'file_backed':
      kind = { type: 'file_backed' };
      answers = parsed.answers.map((answer) =>
        answer.kind === 'exact'
          ? {
              case_insensitive: answer.case_insensitive,
              kind: 'exact',
              value: answer.value.trim()
            }
          : {
              case_insensitive: answer.case_insensitive,
              kind: 'regex',
              pattern: answer.value.trim()
            }
      );
      break;
    case 'remote_service':
      kind = {
        connection: parsed.remote_connection.trim(),
        type: 'remote_service'
      };
      answers = parsed.answers.map((answer) =>
        answer.kind === 'exact'
          ? {
              case_insensitive: answer.case_insensitive,
              kind: 'exact',
              value: answer.value.trim()
            }
          : {
              case_insensitive: answer.case_insensitive,
              kind: 'regex',
              pattern: answer.value.trim()
            }
      );
      break;
    case 'manual_verification':
      kind = { type: 'manual_verification' };
      answers = [{ kind: 'manual' }];
      break;
    case 'plugin':
      kind = {
        config: JSON.parse(parsed.plugin_config.trim() || '{}') as unknown,
        kind: parsed.plugin_kind.trim(),
        plugin: parsed.plugin_name.trim(),
        type: 'plugin'
      };
      answers = [{ kind: 'plugin' }];
      break;
    case 'static_flag':
      kind = { type: 'static_flag' };
      answers = parsed.answers.map((answer) =>
        answer.kind === 'exact'
          ? {
              case_insensitive: answer.case_insensitive,
              kind: 'exact',
              value: answer.value.trim()
            }
          : {
              case_insensitive: answer.case_insensitive,
              kind: 'regex',
              pattern: answer.value.trim()
            }
      );
      break;
  }

  const scoring: CreateChallengeInput['scoring'] =
    parsed.scoring_kind === 'static'
      ? {
          kind: 'static',
          points: parsed.scoring_points
        }
      : parsed.scoring_kind === 'dynamic'
        ? {
            decay: parsed.scoring_decay,
            initial: parsed.scoring_initial,
            kind: 'dynamic',
            minimum: parsed.scoring_minimum
          }
        : {
            kind: 'plugin',
            plugin: parsed.scoring_plugin.trim(),
            strategy: parsed.scoring_strategy.trim()
          };

  return {
    answers,
    category: parsed.category.trim(),
    description: parsed.description.trim(),
    hints: parsed.hints.map((hint) => ({
      content: hint.content.trim(),
      cost: hint.cost,
      id: hint.id
    })),
    kind,
    max_attempts: parsed.max_attempts === 0 ? null : parsed.max_attempts,
    name: parsed.name.trim(),
    position: parsed.position,
    scoring,
    state: parsed.state,
    survey: parsed.survey.map((item) => ({
      key: item.key.trim(),
      prompt: item.prompt.trim(),
      range: item.use_range ? [item.minimum, item.maximum] : null,
      required: item.required
    })),
    tags: Array.from(
      new Set(
        parsed.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      )
    ),
    visibility: {
      division_ids: parsed.division_ids,
      prerequisites: parsed.prerequisites,
      visible_from: dateTimeValue(parsed.visible_from),
      visible_until: dateTimeValue(parsed.visible_until)
    },
    writeups_enabled: parsed.writeups_enabled
  };
}

export function scoreLabel(challenge: ChallengeSummary): string {
  if (challenge.scoring.kind === 'static') {
    return `${challenge.scoring.points} points`;
  }

  if (challenge.scoring.kind === 'dynamic') {
    return `${challenge.scoring.initial} to ${challenge.scoring.minimum}`;
  }

  return challenge.scoring.strategy;
}
