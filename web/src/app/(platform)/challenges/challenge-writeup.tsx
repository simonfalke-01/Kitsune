'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  Alert,
  AlertDialog,
  Button,
  DialogTrigger,
  Form,
  Skeleton,
  TextArea,
  showToast
} from '@/components/ui';
import type { SaveWriteupInput, Writeup } from '@/lib/api/client';

interface ChallengeWriteupProps {
  challengeId: string;
  loadWriteup: (challengeId: string) => Promise<Writeup | null>;
  saveWriteup: (challengeId: string, input: SaveWriteupInput) => Promise<Writeup>;
  showTitle?: boolean;
}

export function ChallengeWriteup({
  challengeId,
  loadWriteup,
  saveWriteup,
  showTitle = true
}: ChallengeWriteupProps) {
  const [writeup, setWriteup] = useState<Writeup | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<'draft' | 'submit' | null>(null);
  const [isConfirmingSubmit, setIsConfirmingSubmit] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const loaded = await loadWriteup(challengeId);
      setWriteup(loaded);
      setBody(loaded?.body ?? '');
    } catch {
      setError('Your writeup could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, [challengeId, loadWriteup]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [load]);

  const save = async (submit: boolean) => {
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return;
    }

    if (submit && trimmedBody.length < 20) {
      setError('Add at least 20 characters before submitting the writeup.');
      setIsConfirmingSubmit(false);
      return;
    }

    setPendingAction(submit ? 'submit' : 'draft');
    setError(null);

    try {
      const saved = await saveWriteup(challengeId, {
        body: trimmedBody,
        submit
      });
      setWriteup(saved);
      setBody(saved.body);
      setIsConfirmingSubmit(false);
      showToast({
        title: submit ? 'Writeup submitted' : 'Draft saved',
        tone: 'success'
      });
    } catch {
      setError('Your writeup could not be saved. Check your connection and retry.');
    } finally {
      setPendingAction(null);
    }
  };

  if (isLoading) {
    return (
      <div aria-label="Loading writeup" className="grid gap-4" role="status">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error && !writeup && !body) {
    return (
      <Alert
        actions={
          <Button
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
    );
  }

  const isEditable = !writeup || writeup.state === 'draft' || writeup.state === 'changes_requested';

  return (
    <div className="grid gap-4">
      {showTitle ? (
        <h3 className="m-0 font-display text-lg font-semibold tracking-tight text-text">
          Solution writeup
        </h3>
      ) : null}

      {writeup?.state === 'changes_requested' && writeup.feedback ? (
        <Alert description={writeup.feedback} title="Organizer feedback" tone="warning" />
      ) : null}
      {writeup?.state === 'submitted' ? (
        <Alert title="Your writeup is waiting for organizer review" tone="info" />
      ) : null}
      {writeup?.state === 'approved' ? (
        <Alert title="Your writeup was approved" tone="success" />
      ) : null}
      {writeup?.state === 'published' ? (
        <Alert title="Your writeup is published" tone="success" />
      ) : null}
      {error ? <Alert title={error} tone="danger" /> : null}

      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
      >
        <TextArea
          description={
            isEditable
              ? 'Markdown supported. At least 20 characters are required for review.'
              : 'This writeup is locked during review.'
          }
          isDisabled={!isEditable || pendingAction !== null}
          label="Writeup"
          onChange={setBody}
          rows={6}
          value={body}
        />
        {isEditable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              isDisabled={pendingAction !== null || body.trim().length === 0}
              isLoading={pendingAction === 'draft'}
              tone="secondary"
              type="submit"
            >
              Save draft
            </Button>
            <DialogTrigger
              isOpen={isConfirmingSubmit}
              onOpenChange={(open) => {
                setIsConfirmingSubmit(open);
              }}
            >
              <Button
                isDisabled={pendingAction !== null || body.trim().length < 20}
                onPress={() => {
                  setIsConfirmingSubmit(true);
                }}
              >
                Submit for review
              </Button>
              <AlertDialog
                actions={
                  <>
                    <Button isDisabled={pendingAction !== null} slot="close" tone="quiet">
                      Keep editing
                    </Button>
                    <Button
                      isDisabled={pendingAction !== null || body.trim().length < 20}
                      isLoading={pendingAction === 'submit'}
                      onPress={() => {
                        void save(true);
                      }}
                    >
                      Submit for review
                    </Button>
                  </>
                }
                description="You cannot edit this writeup again unless an organizer requests changes."
                title="Submit this writeup?"
              />
            </DialogTrigger>
          </div>
        ) : null}
      </Form>
    </div>
  );
}
