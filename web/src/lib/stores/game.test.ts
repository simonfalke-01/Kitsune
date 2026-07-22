import { describe, expect, it } from 'vitest';
import type { SubmissionReceipt } from '$lib/api/client';
import { submissionMessage } from './game.svelte';

function receipt(overrides: Partial<SubmissionReceipt>): SubmissionReceipt {
  return {
    id: crypto.randomUUID(),
    challenge_id: crypto.randomUUID(),
    outcome: 'incorrect',
    awarded_points: 0,
    first_blood: false,
    attempts_remaining: null,
    submitted_at: new Date(0).toISOString(),
    replayed: false,
    ...overrides
  };
}

describe('submissionMessage', () => {
  it('makes first blood and attempt feedback explicit', () => {
    expect(
      submissionMessage(receipt({ outcome: 'correct', awarded_points: 550, first_blood: true }))
    ).toContain('First blood');
    expect(submissionMessage(receipt({ attempts_remaining: 2 }))).toContain('2 attempts remain');
  });

  it('identifies asynchronous review without claiming a solve', () => {
    expect(submissionMessage(receipt({ outcome: 'pending' }))).toBe(
      'Queued for an organizer’s review.'
    );
  });
});
