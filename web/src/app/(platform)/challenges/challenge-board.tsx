'use client';

import { useMemo, useState } from 'react';

import { useEvent } from '../../event-context';
import { useSession } from '../../session-context';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  RadioGroup,
  SearchField,
  Skeleton,
  TextField,
  showToast
} from '@/components/ui';
import { api, errorMessage, type ChallengeSummary, type SubmissionReceipt } from '@/lib/api/client';

function challengePoints(challenge: ChallengeSummary): string {
  if (challenge.scoring.kind === 'static') {
    return `${challenge.scoring.points} points`;
  }

  if (challenge.scoring.kind === 'dynamic') {
    return `${challenge.scoring.minimum}–${challenge.scoring.initial} points`;
  }

  return 'Variable points';
}

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

interface ChallengeDialogProps {
  challenge: ChallengeSummary;
}

function ChallengeDialog({ challenge }: ChallengeDialogProps) {
  const { refreshChallenges, selectedEvent } = useEvent();
  const { session } = useSession();
  const [answer, setAnswer] = useState('');
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const choices = challenge.kind.type === 'multiple_choice' ? challenge.kind.choices : null;

  async function submitAnswer() {
    const normalizedAnswer = answer.trim();

    if (!selectedEvent || !session || normalizedAnswer.length === 0) {
      setAnswerError(choices ? 'Select an answer.' : 'Enter a flag.');
      return;
    }

    setAnswerError(null);
    setIsSubmitting(true);

    try {
      const result = await api.POST(
        '/api/v1/events/{event_id}/challenges/{challenge_id}/submissions',
        {
          body: {
            answer: normalizedAnswer,
            idempotency_key: crypto.randomUUID()
          },
          headers: {
            'x-csrf-token': session.csrf_token
          },
          params: {
            path: {
              challenge_id: challenge.id,
              event_id: selectedEvent.id
            }
          }
        }
      );

      if (!result.data) {
        setAnswerError(errorMessage(result.error, 'The answer could not be submitted.'));
        return;
      }

      const message = submissionMessage(result.data);

      if (result.data.outcome === 'incorrect') {
        setAnswerError(message);
        return;
      }

      showToast(
        {
          title: result.data.outcome === 'correct' ? 'Challenge solved' : 'Answer submitted',
          tone: result.data.outcome === 'correct' ? 'success' : 'info'
        },
        {
          timeout: 5000
        }
      );
      await refreshChallenges();
      setIsOpen(false);
      setAnswer('');
    } catch {
      setAnswerError('The answer could not be submitted. Check your connection and retry.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (!open) {
          setAnswerError(null);
        }
      }}
    >
      <Button size="small" tone={challenge.solved ? 'secondary' : 'primary'}>
        {challenge.solved ? 'View' : 'Open'}
      </Button>
      <Dialog title={challenge.name}>
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{challenge.category}</Badge>
            <span className="text-sm tabular-nums text-text-muted">
              {challengePoints(challenge)}
            </span>
            {challenge.solved ? <Badge tone="success">Solved</Badge> : null}
          </div>
          <p className="m-0 whitespace-pre-line text-base text-text-muted">
            {challenge.description}
          </p>
          {challenge.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2" aria-label="Challenge tags">
              {challenge.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          ) : null}
          {!challenge.solved ? (
            <Form
              density="compact"
              onSubmit={(event) => {
                event.preventDefault();
                void submitAnswer();
              }}
              validationBehavior="aria"
            >
              {choices ? (
                <RadioGroup
                  errorMessage={answerError}
                  isInvalid={Boolean(answerError)}
                  label="Answer"
                  onChange={setAnswer}
                  options={choices.map((choice) => ({
                    label: choice,
                    value: choice
                  }))}
                  value={answer}
                />
              ) : (
                <TextField
                  errorMessage={answerError}
                  inputClassName="font-mono"
                  isInvalid={Boolean(answerError)}
                  label={challenge.kind.type === 'manual_verification' ? 'Answer' : 'Flag'}
                  onChange={setAnswer}
                  value={answer}
                />
              )}
              <div className="flex justify-end">
                <Button isLoading={isSubmitting} type="submit">
                  {challenge.kind.type === 'manual_verification'
                    ? 'Submit for review'
                    : 'Submit flag'}
                </Button>
              </div>
            </Form>
          ) : null}
        </div>
      </Dialog>
    </DialogTrigger>
  );
}

function ChallengeCard({ challenge }: ChallengeDialogProps) {
  return (
    <Card className="p-4">
      <div className="grid gap-4">
        <div className="flex items-start justify-between gap-4">
          <h3 className="m-0 font-display text-lg font-semibold tracking-tight text-text">
            {challenge.name}
          </h3>
          <Badge>{challenge.category}</Badge>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm tabular-nums text-text-muted">{challengePoints(challenge)}</span>
          {challenge.solved ? <Badge tone="success">Solved</Badge> : null}
        </div>
        <div className="flex justify-end">
          <ChallengeDialog challenge={challenge} />
        </div>
      </div>
    </Card>
  );
}

function ChallengeSkeletons() {
  return (
    <div
      aria-label="Loading challenges"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      role="status"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="grid gap-4 rounded-lg border border-border-subtle bg-surface-raised p-4"
          key={index}
        >
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-24 justify-self-end" />
        </div>
      ))}
    </div>
  );
}

export function ChallengeBoard() {
  const { challenges, error, isLoading, refresh, selectedEvent } = useEvent();
  const [query, setQuery] = useState('');
  const filteredChallenges = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    if (!normalizedQuery) {
      return challenges;
    }

    return challenges.filter((challenge) => {
      return [challenge.name, challenge.category, ...challenge.tags].some((value) => {
        return value.toLocaleLowerCase().includes(normalizedQuery);
      });
    });
  }, [challenges, query]);

  if (isLoading) {
    return <ChallengeSkeletons />;
  }

  if (error) {
    return (
      <Alert
        actions={
          <Button
            onPress={() => {
              void refresh();
            }}
            size="small"
            tone="secondary"
          >
            Retry
          </Button>
        }
        title={error}
        tone="danger"
      />
    );
  }

  if (!selectedEvent) {
    return (
      <EmptyState description="Choose an event from the navigation." title="No event selected" />
    );
  }

  if (challenges.length === 0) {
    return <EmptyState description="Check again after the event opens." title="No challenges" />;
  }

  return (
    <section className="grid gap-6" aria-labelledby="challenge-list-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="sr-only" id="challenge-list-title">
          Challenge list
        </h2>
        <SearchField
          className="w-full max-w-prose"
          label="Search challenges"
          onChange={setQuery}
          value={query}
        />
        <span className="text-sm tabular-nums text-text-muted">
          {filteredChallenges.length} of {challenges.length}
        </span>
      </div>
      {filteredChallenges.length === 0 ? (
        <EmptyState
          action={
            <Button
              onPress={() => {
                setQuery('');
              }}
              size="small"
              tone="secondary"
            >
              Clear search
            </Button>
          }
          description="Try another name, category, or tag."
          title="No matches"
        />
      ) : (
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredChallenges.map((challenge) => (
            <ChallengeCard challenge={challenge} key={challenge.id} />
          ))}
        </div>
      )}
    </section>
  );
}
