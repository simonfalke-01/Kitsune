import { describe, expect, it } from 'vitest';

import {
  defaultChallengeEditorValues,
  toCreateChallengeInput,
  validateChallengeEditor,
  type ChallengeEditorValues
} from './admin-challenges';

function validValues(overrides: Partial<ChallengeEditorValues> = {}): ChallengeEditorValues {
  return {
    ...defaultChallengeEditorValues(4),
    answers: [
      {
        case_insensitive: true,
        editor_key: 'answer',
        kind: 'exact',
        value: 'kit{accepted}'
      }
    ],
    category: 'Web',
    description: 'Solve the service.',
    name: 'Request smuggling',
    ...overrides
  };
}

describe('admin challenge helpers', () => {
  it.each([
    {
      expectedAnswer: { case_insensitive: true, kind: 'exact', value: 'kit{accepted}' },
      expectedKind: { type: 'static_flag' },
      kind: 'static_flag' as const
    },
    {
      expectedAnswer: { case_insensitive: true, kind: 'exact', value: 'kit{accepted}' },
      expectedKind: { type: 'file_backed' },
      kind: 'file_backed' as const
    },
    {
      expectedAnswer: { case_insensitive: true, kind: 'exact', value: 'kit{accepted}' },
      expectedKind: { connection: 'tcp://challenge.example:31337', type: 'remote_service' },
      kind: 'remote_service' as const,
      remote_connection: 'tcp://challenge.example:31337'
    },
    {
      dynamic_template: 'shell-template',
      expectedAnswer: { kind: 'dynamic' },
      expectedKind: { template: 'shell-template', type: 'dynamic_instance' },
      kind: 'dynamic_instance' as const
    },
    {
      expectedAnswer: { kind: 'manual' },
      expectedKind: { type: 'manual_verification' },
      kind: 'manual_verification' as const
    }
  ])('serializes $kind behavior and answer contracts', (example) => {
    const input = toCreateChallengeInput(
      validValues({
        dynamic_template: example.dynamic_template ?? '',
        kind: example.kind,
        remote_connection: example.remote_connection ?? ''
      })
    );

    expect(input.kind).toEqual(example.expectedKind);
    expect(input.answers).toEqual([example.expectedAnswer]);
  });

  it('serializes choices, plugin fields, scoring, extras and visibility', () => {
    const choiceInput = toCreateChallengeInput(
      validValues({
        choices: [
          {
            editor_key: 'choice-a',
            is_correct: false,
            value: 'Alpha'
          },
          {
            editor_key: 'choice-b',
            is_correct: true,
            value: 'Beta'
          }
        ],
        kind: 'multiple_choice'
      })
    );

    expect(choiceInput.kind).toEqual({
      choices: ['Alpha', 'Beta'],
      type: 'multiple_choice'
    });
    expect(choiceInput.answers).toEqual([{ kind: 'choice', value: 'Beta' }]);

    const pluginInput = toCreateChallengeInput(
      validValues({
        division_ids: ['division-a'],
        hints: [
          {
            content: 'Read the response headers.',
            cost: 20,
            editor_key: 'hint-a',
            id: 7
          }
        ],
        kind: 'plugin',
        plugin_config: '{"image":"challenge:v2"}',
        plugin_kind: 'container',
        plugin_name: 'oci',
        prerequisites: ['challenge-a'],
        scoring_decay: 80,
        scoring_initial: 500,
        scoring_kind: 'dynamic',
        scoring_minimum: 100,
        survey: [
          {
            editor_key: 'survey-a',
            key: 'difficulty',
            maximum: 5,
            minimum: 1,
            prompt: 'How difficult was this challenge?',
            required: true,
            use_range: true
          }
        ],
        tags: 'web, finals, web',
        visible_from: '2026-08-01T10:00:00.000Z',
        visible_until: '2026-08-01T12:00:00.000Z'
      })
    );

    expect(pluginInput).toMatchObject({
      answers: [{ kind: 'plugin' }],
      hints: [{ content: 'Read the response headers.', cost: 20, id: 7 }],
      kind: {
        config: { image: 'challenge:v2' },
        kind: 'container',
        plugin: 'oci',
        type: 'plugin'
      },
      scoring: {
        decay: 80,
        initial: 500,
        kind: 'dynamic',
        minimum: 100
      },
      survey: [
        {
          key: 'difficulty',
          prompt: 'How difficult was this challenge?',
          range: [1, 5],
          required: true
        }
      ],
      tags: ['web', 'finals'],
      visibility: {
        division_ids: ['division-a'],
        prerequisites: ['challenge-a'],
        visible_from: '2026-08-01T10:00:00.000Z',
        visible_until: '2026-08-01T12:00:00.000Z'
      }
    });
  });

  it('reports cross-section validation issues', () => {
    const issues = validateChallengeEditor(
      validValues({
        answers: [],
        hints: [
          {
            content: '',
            cost: 0,
            editor_key: 'hint-a',
            id: 1
          },
          {
            content: 'Duplicate ID',
            cost: 0,
            editor_key: 'hint-b',
            id: 1
          }
        ],
        scoring_initial: 100,
        scoring_kind: 'dynamic',
        scoring_minimum: 200,
        survey: [
          {
            editor_key: 'survey-a',
            key: 'rating',
            maximum: 1,
            minimum: 5,
            prompt: '',
            required: true,
            use_range: true
          }
        ],
        visible_from: '2026-08-02T12:00',
        visible_until: '2026-08-02T10:00'
      })
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Add at least one answer rule.', section: 'behavior' }),
        expect.objectContaining({
          message: 'Minimum points cannot exceed initial points.',
          section: 'scoring'
        }),
        expect.objectContaining({ message: 'Hint IDs must be unique.', section: 'extras' }),
        expect.objectContaining({
          message: 'Hide time must be after the release time.',
          section: 'visibility'
        })
      ])
    );
  });
});
