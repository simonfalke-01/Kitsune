'use client';

import { useState } from 'react';

import { useEvent } from '../../../event-context';
import { useSession } from '../../../session-context';
import { ChallengeEditor } from './challenge-editor';
import { Alert, Badge, Button, ButtonLink, EmptyState } from '@/components/ui';
import { scoreLabel } from '@/lib/admin-challenges';

export function ChallengeAdminView() {
  const { challenges, error, isLoading, refreshChallenges, selectedEvent } = useEvent();
  const { can } = useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const [discardRequested, setDiscardRequested] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(
    challenges[0]?.id ?? null
  );
  const selectedChallenge =
    challenges.find((challenge) => challenge.id === selectedChallengeId) ?? challenges[0] ?? null;
  const nextPosition =
    challenges.reduce((maximum, challenge) => Math.max(maximum, challenge.position), -1) + 1;

  const requestEditorClose = () => {
    if (editorDirty) {
      setDiscardRequested(true);
      return;
    }

    setCreateOpen(false);
  };

  if (!can('challenge_manage')) {
    return <Alert title="Challenge authoring is unavailable for this account." tone="danger" />;
  }

  if (!selectedEvent) {
    return (
      <EmptyState
        description="Choose an event from the event switcher before authoring challenges."
        title="No event selected"
      />
    );
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-accent-border bg-accent-subtle p-4">
        <div className="grid gap-1">
          <span className="font-display text-lg font-semibold text-text">{selectedEvent.name}</span>
          <span className="text-sm text-text-muted">{challenges.length} challenges</span>
        </div>
        <Button
          onPress={() => {
            if (createOpen) {
              requestEditorClose();
              return;
            }

            setDiscardRequested(false);
            setEditorDirty(false);
            setCreateOpen(true);
          }}
          tone={createOpen ? 'secondary' : 'primary'}
        >
          {createOpen ? 'Return to inventory' : 'Create challenge'}
        </Button>
      </section>

      {createOpen ? (
        <section className="grid gap-6 rounded-lg border border-border-subtle bg-surface-raised p-6">
          <div className="grid gap-1">
            <h2 className="m-0 font-display text-xl font-semibold tracking-tight text-text">
              Create challenge
            </h2>
            <p className="m-0 text-sm text-text-muted">Creating in {selectedEvent.name}</p>
          </div>
          <ChallengeEditor
            challenges={challenges}
            discardRequested={discardRequested}
            nextPosition={nextPosition}
            onDiscard={() => {
              setDiscardRequested(false);
              setEditorDirty(false);
              setCreateOpen(false);
            }}
            onDone={() => {
              setDiscardRequested(false);
              setEditorDirty(false);
              setCreateOpen(false);
            }}
            onDirtyChange={setEditorDirty}
            onKeepEditing={() => {
              setDiscardRequested(false);
            }}
            onRequestClose={requestEditorClose}
          />
        </section>
      ) : (
        <>
          {isLoading ? (
            <Alert title="Refreshing challenge inventory." tone="info" />
          ) : error ? (
            <Alert
              actions={
                <Button
                  onPress={() => {
                    void refreshChallenges();
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
          ) : challenges.length === 0 ? (
            <EmptyState
              action={
                <Button
                  onPress={() => {
                    setCreateOpen(true);
                  }}
                  tone="secondary"
                >
                  Create challenge
                </Button>
              }
              description="Create the first challenge for this event."
              title="No challenges"
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <section
                aria-label={`${selectedEvent.name} challenge inventory`}
                className="overflow-hidden rounded-lg border border-border-subtle bg-surface-raised"
              >
                <div className="border-b border-border-subtle px-4 py-3">
                  <span className="text-sm font-semibold text-text">Inventory</span>
                </div>
                <div className="divide-y divide-border-subtle">
                  {challenges.map((challenge) => (
                    <Button
                      aria-pressed={selectedChallenge?.id === challenge.id}
                      className="w-full justify-start rounded-none border-0 px-4 py-3 text-left"
                      key={challenge.id}
                      onPress={() => {
                        setSelectedChallengeId(challenge.id);
                      }}
                      tone={selectedChallenge?.id === challenge.id ? 'secondary' : 'quiet'}
                    >
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="truncate font-medium text-text">{challenge.name}</span>
                        <span className="flex flex-wrap gap-2 text-xs text-text-muted">
                          <span>{challenge.category}</span>
                          <span>{scoreLabel(challenge)}</span>
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </section>

              {selectedChallenge ? (
                <section className="grid content-start gap-6 rounded-lg border border-border-subtle bg-surface-raised p-6 lg:col-span-2">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-l-4 border-accent pl-4">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={selectedChallenge.state === 'published' ? 'success' : 'neutral'}
                        >
                          {selectedChallenge.state}
                        </Badge>
                        <Badge>{selectedChallenge.category}</Badge>
                      </div>
                      <h2 className="m-0 font-display text-xl font-semibold tracking-tight text-text">
                        {selectedChallenge.name}
                      </h2>
                    </div>
                    <strong className="text-lg tabular-nums text-text">
                      {scoreLabel(selectedChallenge)}
                    </strong>
                  </div>

                  <p className="m-0 max-w-prose whitespace-pre-line text-base text-text-muted">
                    {selectedChallenge.description}
                  </p>

                  <dl className="m-0 grid gap-4 border-y border-border-subtle py-4 sm:grid-cols-2">
                    <div className="grid gap-1">
                      <dt className="text-xs font-semibold text-text-muted">Kind</dt>
                      <dd className="m-0 text-sm text-text">{selectedChallenge.kind.type}</dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-xs font-semibold text-text-muted">Position</dt>
                      <dd className="m-0 text-sm tabular-nums text-text">
                        {selectedChallenge.position}
                      </dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-xs font-semibold text-text-muted">Attempts</dt>
                      <dd className="m-0 text-sm tabular-nums text-text">
                        {selectedChallenge.max_attempts ?? 'Unlimited'}
                      </dd>
                    </div>
                    <div className="grid gap-1">
                      <dt className="text-xs font-semibold text-text-muted">Survey questions</dt>
                      <dd className="m-0 text-sm tabular-nums text-text">
                        {selectedChallenge.survey.length}
                      </dd>
                    </div>
                  </dl>

                  {selectedChallenge.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedChallenge.tags.map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    <ButtonLink
                      href={`/challenges?challenge=${encodeURIComponent(selectedChallenge.id)}`}
                      tone="secondary"
                    >
                      Player preview
                    </ButtonLink>
                    <Button isDisabled>Edit</Button>
                    <Button isDisabled tone="danger">
                      Delete
                    </Button>
                    <Badge tone="info">Edit API pending</Badge>
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
