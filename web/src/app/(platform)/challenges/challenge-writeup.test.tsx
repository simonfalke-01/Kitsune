import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChallengeWriteup } from './challenge-writeup';
import type { Writeup } from '@/lib/api/client';

function writeup(overrides: Partial<Writeup> = {}): Writeup {
  return {
    body: 'Trace the request and normalize the final endpoint.',
    challenge_id: 'challenge',
    challenge_name: 'Shrine gate',
    competitor_id: 'competitor',
    competitor_kind: 'user',
    competitor_name: 'River',
    created_at: '2026-07-27T10:00:00Z',
    feedback: null,
    id: 'writeup',
    reviewer_id: null,
    state: 'draft',
    updated_at: '2026-07-27T10:00:00Z',
    ...overrides
  };
}

describe('ChallengeWriteup', () => {
  it('does not allow an empty draft to be saved', async () => {
    const saveWriteup = vi.fn();

    render(
      <ChallengeWriteup
        challengeId="challenge"
        loadWriteup={vi.fn().mockResolvedValue(null)}
        saveWriteup={saveWriteup}
      />
    );

    await screen.findByLabelText('Writeup');
    const saveButton = screen.getByRole('button', { name: 'Save draft' });

    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(saveWriteup).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads an empty editor and saves a draft', async () => {
    const loadWriteup = vi.fn().mockResolvedValue(null);
    const saveWriteup = vi.fn().mockResolvedValue(writeup());

    render(
      <ChallengeWriteup
        challengeId="challenge"
        loadWriteup={loadWriteup}
        saveWriteup={saveWriteup}
      />
    );

    const editor = await screen.findByLabelText('Writeup');
    fireEvent.change(editor, {
      target: {
        value: 'Trace the request and normalize the final endpoint.'
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(saveWriteup).toHaveBeenCalledWith('challenge', {
        body: 'Trace the request and normalize the final endpoint.',
        submit: false
      });
    });
    expect(screen.getByLabelText('Writeup')).toHaveValue(
      'Trace the request and normalize the final endpoint.'
    );
  });

  it('confirms submission before locking the writeup for review', async () => {
    const draft = writeup();
    const loadWriteup = vi.fn().mockResolvedValue(draft);
    const saveWriteup = vi.fn().mockResolvedValue({
      ...draft,
      state: 'submitted'
    });

    render(
      <ChallengeWriteup
        challengeId="challenge"
        loadWriteup={loadWriteup}
        saveWriteup={saveWriteup}
      />
    );

    await screen.findByDisplayValue(draft.body);
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Submit for review' }));

    await waitFor(() => {
      expect(saveWriteup).toHaveBeenCalledWith('challenge', {
        body: draft.body,
        submit: true
      });
    });
    expect(await screen.findByText('Your writeup is waiting for organizer review.')).toBeVisible();
    expect(screen.getByLabelText('Writeup')).toBeDisabled();
  });

  it('surfaces organizer feedback and restores editing after changes are requested', async () => {
    render(
      <ChallengeWriteup
        challengeId="challenge"
        loadWriteup={vi.fn().mockResolvedValue(
          writeup({
            feedback: 'Explain how the final endpoint was normalized.',
            state: 'changes_requested'
          })
        )}
        saveWriteup={vi.fn()}
      />
    );

    expect(await screen.findByText('Organizer feedback')).toBeVisible();
    expect(screen.getByText('Explain how the final endpoint was normalized.')).toBeVisible();
    expect(screen.getByLabelText('Writeup')).toBeEnabled();
  });
});
