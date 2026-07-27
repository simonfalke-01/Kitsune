'use client';

import { useRef, useState } from 'react';

import type { ChallengeWorkspaceActions } from './challenge-types';
import { Alert, Button, Form, RadioGroup, TextField } from '@/components/ui';
import type { SubmissionReceipt } from '@/lib/api/client';
import type { ChallengeExperience } from '@/lib/challenges';

function submissionMessage(receipt: SubmissionReceipt): string {
  if (receipt.outcome === 'correct') {
    return receipt.first_blood
      ? `Correct. First blood and ${receipt.awarded_points} points.`
      : `Correct. ${receipt.awarded_points} points.`;
  }

  if (receipt.outcome === 'pending') {
    return 'Submitted for review.';
  }

  if (typeof receipt.attempts_remaining === 'number') {
    return `Incorrect. ${receipt.attempts_remaining} attempts remain.`;
  }

  return 'Incorrect flag.';
}

interface ChallengeSubmissionProps {
  challenge: ChallengeExperience;
  onCorrectOrigin?: (origin: DOMRect, value: string) => void;
  onReceipt: (receipt: SubmissionReceipt) => Promise<void>;
  submitAnswer: ChallengeWorkspaceActions['submitAnswer'];
}

export function ChallengeSubmission({
  challenge,
  onCorrectOrigin,
  onReceipt,
  submitAnswer
}: ChallengeSubmissionProps) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState<string | null>(null);
  const flagFieldRef = useRef<HTMLDivElement>(null);
  const choices = challenge.kind.type === 'multiple_choice' ? challenge.kind.choices : null;

  async function submit() {
    const normalizedAnswer = answer.trim();

    if (!normalizedAnswer) {
      setError(choices ? 'Select an answer.' : 'Enter a flag.');
      return;
    }

    setError(null);
    setReceiptMessage(null);
    setIsSubmitting(true);

    try {
      const receipt = await submitAnswer(challenge.id, normalizedAnswer);
      const message = submissionMessage(receipt);

      if (receipt.outcome === 'correct') {
        const input = flagFieldRef.current?.querySelector('input');

        if (input) {
          onCorrectOrigin?.(input.getBoundingClientRect(), normalizedAnswer);
        }
      }

      if (receipt.outcome === 'incorrect') {
        setError(message);
      } else {
        setReceiptMessage(message);
        setAnswer('');
      }

      await onReceipt(receipt);
    } catch {
      setError(
        challenge.kind.type === 'manual_verification'
          ? 'The answer could not be submitted. Check your connection and retry.'
          : 'The flag could not be submitted. Check your connection and retry.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      density="compact"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      validationBehavior="aria"
    >
      {choices ? (
        <>
          <RadioGroup
            errorMessage={error}
            isInvalid={Boolean(error)}
            label="Answer"
            onChange={setAnswer}
            options={choices.map((choice) => ({
              label: choice,
              value: choice
            }))}
            value={answer}
          />
          <div className="flex justify-end">
            <Button isLoading={isSubmitting} type="submit">
              Submit flag
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1" ref={flagFieldRef}>
            <TextField
              className="min-w-0"
              errorMessage={error}
              inputClassName="h-control bg-surface-sunken font-mono"
              isInvalid={Boolean(error)}
              label={challenge.kind.type === 'manual_verification' ? 'Answer' : 'Flag'}
              onChange={setAnswer}
              value={answer}
            />
          </div>
          <Button className="h-control w-full sm:w-auto" isLoading={isSubmitting} type="submit">
            {challenge.kind.type === 'manual_verification' ? 'Submit for review' : 'Submit flag'}
          </Button>
        </div>
      )}
      {receiptMessage ? <Alert title={receiptMessage} tone="info" /> : null}
    </Form>
  );
}
