'use client';

import { useCallback, useEffect, useState } from 'react';

import { formatEngagementTimestamp } from './engagement-format';
import {
  Alert,
  Button,
  CodeBlock,
  Dialog,
  DialogTrigger,
  EmptyState,
  Form,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TextArea,
  showToast
} from '@/components/ui';
import { api, errorMessage, type ManualReview } from '@/lib/api/client';

interface ManualReviewPanelProps {
  csrfToken: string;
  eventId: string;
}

interface ManualDecisionActionProps extends ManualReviewPanelProps {
  onDecided: (submissionId: string) => void;
  submission: ManualReview;
}

function ManualDecisionAction({
  csrfToken,
  eventId,
  onDecided,
  submission
}: ManualDecisionActionProps) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingReject, setIsConfirmingReject] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'accept' | 'reject' | null>(null);

  const decide = async (accepted: boolean) => {
    const trimmedNote = note.trim();

    if (trimmedNote.length > 10000) {
      setError('Use no more than 10,000 characters for the reviewer note.');
      return;
    }

    setPendingDecision(accepted ? 'accept' : 'reject');
    setError(null);

    try {
      const result = await api.PATCH('/api/v1/events/{event_id}/manual-reviews/{submission_id}', {
        body: {
          accepted,
          note: trimmedNote || null
        },
        headers: {
          'x-csrf-token': csrfToken
        },
        params: {
          path: {
            event_id: eventId,
            submission_id: submission.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The submission decision could not be saved.'));
        return;
      }

      onDecided(submission.id);
      setIsOpen(false);
      showToast({
        description: accepted ? `${result.data.awarded_points} points awarded.` : undefined,
        title: accepted ? 'Submission accepted' : 'Submission rejected',
        tone: accepted ? 'success' : 'info'
      });
    } catch {
      setError('The submission decision could not be saved. Check your connection and retry.');
    } finally {
      setPendingDecision(null);
    }
  };

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (!open) {
          setError(null);
          setIsConfirmingReject(false);
          setNote('');
        }
      }}
    >
      <Button size="small" tone="secondary">
        Review
      </Button>
      <Dialog
        actions={
          isConfirmingReject ? (
            <>
              <Button
                isDisabled={pendingDecision !== null}
                onPress={() => {
                  setIsConfirmingReject(false);
                }}
                tone="quiet"
              >
                Keep reviewing
              </Button>
              <Button
                isLoading={pendingDecision === 'reject'}
                onPress={() => {
                  void decide(false);
                }}
                tone="danger"
              >
                Confirm rejection
              </Button>
            </>
          ) : (
            <>
              <Button isDisabled={pendingDecision !== null} slot="close" tone="quiet">
                Cancel
              </Button>
              <Button
                isDisabled={pendingDecision !== null}
                onPress={() => {
                  setIsConfirmingReject(true);
                }}
                tone="danger"
              >
                Reject submission
              </Button>
              <Button
                isLoading={pendingDecision === 'accept'}
                onPress={() => {
                  void decide(true);
                }}
              >
                Accept submission
              </Button>
            </>
          )
        }
        description={
          isConfirmingReject
            ? 'This records an incorrect outcome and removes the submission from the review queue.'
            : `${submission.competitor_name} on ${submission.challenge_name}`
        }
        title={isConfirmingReject ? 'Reject this submission?' : 'Review manual submission'}
      >
        <Form>
          <CodeBlock code={submission.answer} label="Submitted answer" />
          <TextArea
            description="Stored with the organizer decision."
            isDisabled={pendingDecision !== null}
            label="Reviewer note"
            onChange={setNote}
            rows={5}
            value={note}
          />
          {error ? <Alert title={error} tone="danger" /> : null}
        </Form>
      </Dialog>
    </DialogTrigger>
  );
}

export function ManualReviewPanel({ csrfToken, eventId }: ManualReviewPanelProps) {
  const [submissions, setSubmissions] = useState<ManualReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.GET('/api/v1/events/{event_id}/manual-reviews', {
        params: {
          path: {
            event_id: eventId
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'Manual submissions could not be loaded.'));
        return;
      }

      setSubmissions(result.data);
    } catch {
      setError('Manual submissions could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [load]);

  return (
    <div aria-busy={isLoading} className="grid gap-4">
      {error ? (
        <Alert
          actions={
            <Button
              isLoading={isLoading}
              onPress={() => {
                void load();
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
      ) : null}
      {isLoading ? (
        <div aria-label="Loading manual submissions" className="grid gap-3" role="status">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !error && submissions.length === 0 ? (
        <EmptyState
          description="Manual-verification submissions will appear here."
          title="No submissions awaiting review"
        />
      ) : !error ? (
        <Table aria-label="Manual submission review queue">
          <TableHeader>
            <TableColumn isRowHeader>Challenge</TableColumn>
            <TableColumn>Competitor</TableColumn>
            <TableColumn>Submitted</TableColumn>
            <TableColumn>Action</TableColumn>
          </TableHeader>
          <TableBody emptyState="No manual submissions.">
            {submissions.map((submission) => (
              <TableRow id={submission.id} key={submission.id}>
                <TableCell>{submission.challenge_name}</TableCell>
                <TableCell>
                  <span className="grid gap-1">
                    <span>{submission.competitor_name}</span>
                    <span className="text-xs text-text-muted">{submission.competitor_kind}</span>
                  </span>
                </TableCell>
                <TableCell>{formatEngagementTimestamp(submission.submitted_at)}</TableCell>
                <TableCell>
                  <ManualDecisionAction
                    csrfToken={csrfToken}
                    eventId={eventId}
                    onDecided={(submissionId) => {
                      setSubmissions((current) =>
                        current.filter((item) => item.id !== submissionId)
                      );
                    }}
                    submission={submission}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
