'use client';

import { type RefObject, useId, useRef, useState } from 'react';

import type { ChallengeWorkspaceActions } from './challenge-types';
import { Button, Form, RadioGroup, showToast, TextField } from '@/components/ui';
import type { SubmissionReceipt } from '@/lib/api/client';
import type { ChallengeExperience } from '@/lib/challenges';

interface ChallengeSubmissionProps {
  answerInputRef?: RefObject<HTMLInputElement | null>;
  challenge: ChallengeExperience;
  onCorrectOrigin?: (origin: DOMRect, value: string, isFirstBlood: boolean) => void;
  onIncorrectOrigin?: (origin: DOMRect) => void;
  onReceipt: (receipt: SubmissionReceipt, submittedValue: string) => Promise<void>;
  submitAnswer: ChallengeWorkspaceActions['submitAnswer'];
}

export function ChallengeSubmission({
  answerInputRef,
  challenge,
  onCorrectOrigin,
  onIncorrectOrigin,
  onReceipt,
  submitAnswer
}: ChallengeSubmissionProps) {
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const flagFieldRef = useRef<HTMLDivElement>(null);
  const flagInputId = useId();
  const choices = challenge.kind.type === 'multiple_choice' ? challenge.kind.choices : null;
  const answerLabel = challenge.kind.type === 'manual_verification' ? 'Answer' : 'Flag';

  async function submit() {
    const normalizedAnswer = answer.trim();

    if (!normalizedAnswer) {
      setError(choices ? 'Select an answer.' : 'Enter a flag.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const receipt = await submitAnswer(challenge.id, normalizedAnswer);

      if (receipt.outcome === 'correct') {
        const input = flagFieldRef.current?.querySelector('input');

        if (input) {
          onCorrectOrigin?.(input.getBoundingClientRect(), normalizedAnswer, receipt.first_blood);
        }
      }

      if (receipt.outcome === 'incorrect') {
        const input = flagFieldRef.current?.querySelector('input');

        if (input) {
          onIncorrectOrigin?.(input.getBoundingClientRect());
        }

        showToast({
          description:
            typeof receipt.attempts_remaining === 'number'
              ? `${receipt.attempts_remaining} attempts remain.`
              : undefined,
          title:
            challenge.kind.type === 'manual_verification' ? 'Incorrect answer' : 'Incorrect flag',
          tone: 'danger'
        });
      } else {
        setAnswer('');
      }

      await onReceipt(receipt, normalizedAnswer);
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
        <div className="grid gap-2">
          <label aria-hidden className="text-sm font-medium text-text" htmlFor={flagInputId}>
            {answerLabel}
          </label>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1" ref={flagFieldRef}>
              <TextField
                className="min-w-0"
                errorMessage={error}
                inputClassName="h-control bg-surface-sunken font-mono"
                inputId={flagInputId}
                inputRef={answerInputRef}
                isInvalid={Boolean(error)}
                label={answerLabel}
                labelHidden
                onChange={setAnswer}
                value={answer}
              />
            </div>
            <Button className="h-control w-full sm:w-auto" isLoading={isSubmitting} type="submit">
              {challenge.kind.type === 'manual_verification' ? 'Submit for review' : 'Submit flag'}
            </Button>
          </div>
        </div>
      )}
    </Form>
  );
}
