import { describe, expect, it } from 'vitest';

import type { ChallengeSummary } from './api/client';
import {
  challengeAttempts,
  challengeCategoryTone,
  challengeProgress,
  challengeSelection,
  createChallengeExperience,
  filterChallenges,
  groupChallenges,
  surveyAnswersAreComplete,
  surveyRange
} from './challenges';

function challenge(
  id: string,
  category: string,
  overrides: Partial<ChallengeSummary> = {}
): ChallengeSummary {
  return {
    category,
    description: `${id} description`,
    event_id: 'event',
    id,
    kind: {
      type: 'static_flag'
    },
    max_attempts: 5,
    name: id,
    position: 0,
    scoring: {
      kind: 'static',
      points: 100
    },
    solved: false,
    state: 'published',
    survey: [],
    tags: [],
    visibility: {
      division_ids: [],
      prerequisites: [],
      visible_from: null,
      visible_until: null
    },
    writeups_enabled: false,
    ...overrides
  };
}

describe('challenge workspace helpers', () => {
  it('filters and groups challenges while retaining solved totals', () => {
    const challenges = [
      createChallengeExperience(
        challenge('Cipher trail', 'Crypto', {
          solved: true,
          tags: ['beginner']
        })
      ),
      createChallengeExperience(challenge('Packet shrine', 'Web')),
      createChallengeExperience(challenge('Nonce garden', 'Crypto'))
    ];

    expect(filterChallenges(challenges, 'beginner').map((item) => item.id)).toEqual([
      'Cipher trail'
    ]);
    expect(groupChallenges(challenges)).toEqual([
      {
        category: 'Web',
        challenges: [challenges[1]],
        solved: 0
      },
      {
        category: 'Crypto',
        challenges: [challenges[0], challenges[2]],
        solved: 1
      }
    ]);
  });

  it('summarizes points and attempts for the event overview', () => {
    const challenges = [
      createChallengeExperience(challenge('Static', 'Web', { solved: true })),
      createChallengeExperience(
        challenge('Dynamic', 'Pwn', {
          max_attempts: null,
          scoring: {
            decay: 20,
            initial: 500,
            kind: 'dynamic',
            minimum: 100
          }
        }),
        {
          attemptsRemaining: 3
        }
      )
    ];

    expect(challengeProgress(challenges)).toEqual({
      availablePoints: 600,
      earnedPoints: 100,
      solved: 1,
      total: 2
    });
    expect(challengeAttempts(challenges[1]!)).toBe('3 attempts left');
  });

  it('maps categories and URL selections deterministically', () => {
    expect(challengeCategoryTone('Web')).toBe(challengeCategoryTone('web'));
    expect(challengeCategoryTone('Web')).toBe(challengeCategoryTone('Web'));
    expect(challengeSelection(new URLSearchParams('challenge=challenge-1'))).toBe('challenge-1');
    expect(challengeSelection(new URLSearchParams('challenge='))).toBeNull();
  });

  it('validates required survey answers and applies the rating default', () => {
    const experience = createChallengeExperience(
      challenge('Survey gate', 'Welcome', {
        survey: [
          {
            key: 'clarity',
            prompt: 'How clear was the brief?',
            range: null,
            required: true
          },
          {
            key: 'pace',
            prompt: 'How was the pace?',
            range: [1, 7],
            required: false
          }
        ]
      }),
      {
        surveyMode: 'gate'
      }
    );

    expect(surveyAnswersAreComplete(experience, {})).toBe(false);
    expect(surveyAnswersAreComplete(experience, { clarity: 4 })).toBe(true);
    expect(surveyRange(experience.survey[0]!)).toEqual([1, 5]);
    expect(surveyRange(experience.survey[1]!)).toEqual([1, 7]);
  });
});
