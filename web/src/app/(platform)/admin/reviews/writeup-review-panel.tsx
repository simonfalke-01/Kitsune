'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Key } from 'react-aria-components';

import { formatEngagementTimestamp, writeupStateDetailsFor } from './engagement-format';
import {
  Alert,
  Badge,
  Button,
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
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  TextArea,
  showToast
} from '@/components/ui';
import { api, errorMessage, type ReviewWriteupInput, type Writeup } from '@/lib/api/client';

const writeupFilters = [
  {
    id: 'submitted',
    label: 'Submitted'
  },
  {
    id: 'changes_requested',
    label: 'Changes requested'
  },
  {
    id: 'approved',
    label: 'Approved'
  },
  {
    id: 'published',
    label: 'Published'
  },
  {
    id: 'draft',
    label: 'Draft'
  },
  {
    id: 'all',
    label: 'All'
  }
] as const;

type WriteupFilter = (typeof writeupFilters)[number]['id'];

interface WriteupReviewPanelProps {
  csrfToken: string;
  eventId: string;
}

interface WriteupReviewActionProps {
  csrfToken: string;
  eventId: string;
  onReviewed: (writeup: Writeup) => void;
  writeup: Writeup;
}

function WriteupBody({ writeup }: { writeup: Writeup }) {
  const state = writeupStateDetailsFor(writeup.state);

  return (
    <div className="grid gap-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="grid gap-1">
          <dt className="text-text-muted">Competitor</dt>
          <dd className="m-0 text-text">{writeup.competitor_name}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-text-muted">State</dt>
          <dd className="m-0">
            <Badge tone={state.tone}>{state.label}</Badge>
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-text-muted">Submitted identity</dt>
          <dd className="m-0 text-text">{writeup.competitor_kind}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-text-muted">Updated</dt>
          <dd className="m-0 text-text">{formatEngagementTimestamp(writeup.updated_at)}</dd>
        </div>
      </dl>
      {writeup.feedback ? (
        <Alert description={writeup.feedback} title="Current feedback" tone="warning" />
      ) : null}
      <div className="grid gap-2">
        <h3 className="m-0 font-display text-lg font-semibold tracking-tight text-text">Writeup</h3>
        <div className="max-h-workspace overflow-y-auto rounded-lg border border-border-subtle bg-surface-sunken p-4">
          <p className="m-0 whitespace-pre-wrap text-sm text-text">{writeup.body}</p>
        </div>
      </div>
    </div>
  );
}

function WriteupReviewAction({
  csrfToken,
  eventId,
  onReviewed,
  writeup
}: WriteupReviewActionProps) {
  const [feedback, setFeedback] = useState(writeup.feedback ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingState, setPendingState] = useState<ReviewWriteupInput['state'] | null>(null);
  const canRequestChanges = writeup.state === 'submitted' || writeup.state === 'approved';
  const primaryState = writeup.state === 'submitted' ? 'approved' : 'published';
  const primaryLabel = writeup.state === 'submitted' ? 'Approve' : 'Publish';

  const review = async (state: ReviewWriteupInput['state']) => {
    const trimmedFeedback = feedback.trim();

    if (state === 'changes_requested' && !trimmedFeedback) {
      setError('Add feedback that tells the competitor what to change.');
      return;
    }

    setPendingState(state);
    setError(null);

    try {
      const result = await api.PATCH('/api/v1/events/{event_id}/writeups/{writeup_id}', {
        body: {
          feedback: trimmedFeedback || null,
          state
        },
        headers: {
          'x-csrf-token': csrfToken
        },
        params: {
          path: {
            event_id: eventId,
            writeup_id: writeup.id
          }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'The writeup decision could not be saved.'));
        return;
      }

      onReviewed(result.data);
      setIsOpen(false);
      showToast({
        title:
          state === 'changes_requested'
            ? 'Changes requested'
            : state === 'approved'
              ? 'Writeup approved'
              : 'Writeup published',
        tone: 'success'
      });
    } catch {
      setError('The writeup decision could not be saved. Check your connection and retry.');
    } finally {
      setPendingState(null);
    }
  };

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);

        if (!open) {
          setError(null);
          setFeedback(writeup.feedback ?? '');
        }
      }}
    >
      <Button size="small" tone="secondary">
        Review
      </Button>
      <Dialog
        actions={
          <>
            <Button isDisabled={pendingState !== null} slot="close" tone="quiet">
              Cancel
            </Button>
            {canRequestChanges ? (
              <Button
                isLoading={pendingState === 'changes_requested'}
                onPress={() => {
                  void review('changes_requested');
                }}
                tone="danger"
              >
                Request changes
              </Button>
            ) : null}
            <Button
              isLoading={pendingState === primaryState}
              onPress={() => {
                void review(primaryState);
              }}
            >
              {primaryLabel}
            </Button>
          </>
        }
        description={`${writeup.competitor_name} on ${writeup.challenge_name}`}
        title={`${primaryLabel} writeup`}
      >
        <Form className="grid gap-6">
          <WriteupBody writeup={writeup} />
          {canRequestChanges ? (
            <TextArea
              description="Required when requesting changes. Included with other decisions when provided."
              isDisabled={pendingState !== null}
              label="Reviewer feedback"
              onChange={setFeedback}
              rows={5}
              value={feedback}
            />
          ) : null}
          {error ? <Alert title={error} tone="danger" /> : null}
        </Form>
      </Dialog>
    </DialogTrigger>
  );
}

function InspectWriteupAction({ writeup }: { writeup: Writeup }) {
  return (
    <DialogTrigger>
      <Button size="small" tone="quiet">
        Inspect
      </Button>
      <Dialog
        description={`${writeup.competitor_name} on ${writeup.challenge_name}`}
        title="Writeup details"
      >
        <WriteupBody writeup={writeup} />
      </Dialog>
    </DialogTrigger>
  );
}

export function WriteupReviewPanel({ csrfToken, eventId }: WriteupReviewPanelProps) {
  const [filter, setFilter] = useState<WriteupFilter>('submitted');
  const [writeups, setWriteups] = useState<Writeup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.GET('/api/v1/events/{event_id}/writeups', {
        params: {
          path: {
            event_id: eventId
          },
          query: filter === 'all' ? {} : { state: filter }
        }
      });

      if (!result.data) {
        setError(errorMessage(result.error, 'Writeups could not be loaded.'));
        return;
      }

      setWriteups(result.data);
    } catch {
      setError('Writeups could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, filter]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [load]);

  const handleFilterChange = (key: Key) => {
    setFilter(String(key) as WriteupFilter);
  };

  const handleReviewed = (updated: Writeup) => {
    setWriteups((current) => {
      if (filter !== 'all' && updated.state !== filter) {
        return current.filter((writeup) => writeup.id !== updated.id);
      }

      return current.map((writeup) => (writeup.id === updated.id ? updated : writeup));
    });
  };

  return (
    <div aria-busy={isLoading} className="grid gap-4">
      <Tabs onSelectionChange={handleFilterChange} selectedKey={filter}>
        <TabsList aria-label="Writeup state">
          {writeupFilters.map((option) => (
            <TabsTab id={option.id} key={option.id}>
              {option.label}
            </TabsTab>
          ))}
        </TabsList>
        {writeupFilters.map((option) => (
          <TabsPanel id={option.id} key={option.id}>
            {option.id === filter ? (
              <div className="grid gap-4">
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
                  <div aria-label="Loading writeups" className="grid gap-3" role="status">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : !error && writeups.length === 0 ? (
                  <EmptyState
                    description="New submissions will appear here."
                    title={`No ${option.label.toLocaleLowerCase()} writeups`}
                  />
                ) : !error ? (
                  <Table aria-label={`${option.label} writeups`}>
                    <TableHeader>
                      <TableColumn isRowHeader>Challenge</TableColumn>
                      <TableColumn>Competitor</TableColumn>
                      <TableColumn>State</TableColumn>
                      <TableColumn>Updated</TableColumn>
                      <TableColumn>Actions</TableColumn>
                    </TableHeader>
                    <TableBody emptyState="No writeups.">
                      {writeups.map((writeup) => {
                        const state = writeupStateDetailsFor(writeup.state);
                        const isReviewable =
                          writeup.state === 'submitted' || writeup.state === 'approved';

                        return (
                          <TableRow id={writeup.id} key={writeup.id}>
                            <TableCell>{writeup.challenge_name}</TableCell>
                            <TableCell>
                              <span className="grid gap-1">
                                <span>{writeup.competitor_name}</span>
                                <span className="text-xs text-text-muted">
                                  {writeup.competitor_kind}
                                </span>
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge tone={state.tone}>{state.label}</Badge>
                            </TableCell>
                            <TableCell>{formatEngagementTimestamp(writeup.updated_at)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                <InspectWriteupAction writeup={writeup} />
                                {isReviewable ? (
                                  <WriteupReviewAction
                                    csrfToken={csrfToken}
                                    eventId={eventId}
                                    onReviewed={handleReviewed}
                                    writeup={writeup}
                                  />
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : null}
              </div>
            ) : null}
          </TabsPanel>
        ))}
      </Tabs>
    </div>
  );
}
