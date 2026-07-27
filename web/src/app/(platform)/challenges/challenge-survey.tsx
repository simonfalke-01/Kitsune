'use client';

import { useState } from 'react';

import { Alert, Button, Form, RatingGroup } from '@/components/ui';
import { surveyAnswersAreComplete, surveyRange, type ChallengeExperience } from '@/lib/challenges';

interface ChallengeSurveyProps {
  challenge: ChallengeExperience;
  isGate: boolean;
  onComplete: (answers: Record<string, number>) => Promise<void>;
}

export function ChallengeSurvey({ challenge, isGate, onComplete }: ChallengeSurveyProps) {
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitSurvey() {
    if (!surveyAnswersAreComplete(challenge, answers)) {
      setError('Complete every required question.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const completeAnswers = Object.fromEntries(
        Object.entries(answers).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number'
        )
      );
      await onComplete(completeAnswers);
    } catch {
      setError('The rating could not be submitted. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        void submitSurvey();
      }}
      validationBehavior="aria"
    >
      <div className="grid gap-6">
        {challenge.survey.map((question) => {
          const [minimum, maximum] = surveyRange(question);
          const isMissing = Boolean(error) && question.required && answers[question.key] == null;

          return (
            <RatingGroup
              description={question.required ? 'Required' : 'Optional'}
              errorMessage={isMissing ? 'Choose a rating.' : undefined}
              key={question.key}
              label={question.prompt}
              maximum={maximum}
              minimum={minimum}
              onChange={(value) => {
                setAnswers((current) => ({
                  ...current,
                  [question.key]: value
                }));
                setError(null);
              }}
              value={answers[question.key] ?? null}
            />
          );
        })}
        {error ? <Alert title={error} tone="danger" /> : null}
        <div className="flex justify-end">
          <Button isLoading={isSubmitting} type="submit">
            {isGate ? 'Reveal flag' : 'Submit rating'}
          </Button>
        </div>
      </div>
    </Form>
  );
}
