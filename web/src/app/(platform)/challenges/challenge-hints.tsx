'use client';

import { useEffect, useState } from 'react';

import type { ChallengeWorkspaceActions } from './challenge-types';
import { Alert, AlertDialog, Button, DialogTrigger, Skeleton, showToast } from '@/components/ui';
import type { ChallengeHint } from '@/lib/api/client';
import type { ChallengeExperience } from '@/lib/challenges';

interface HintUnlockActionProps {
  challenge: ChallengeExperience;
  hint: ChallengeHint;
  isLoading: boolean;
  onUnlock: () => Promise<boolean>;
}

function HintUnlockAction({ challenge, hint, isLoading, onUnlock }: HintUnlockActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const label = hint.cost > 0 ? `Unlock for ${hint.cost} points` : 'Reveal hint';

  if (hint.cost === 0) {
    return (
      <Button
        isLoading={isLoading}
        onPress={() => {
          void onUnlock();
        }}
        size="small"
        tone="secondary"
      >
        {label}
      </Button>
    );
  }

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button isDisabled={isLoading} size="small" tone="secondary">
        {label}
      </Button>
      <AlertDialog
        actions={
          <>
            <Button isDisabled={isLoading} slot="close" tone="quiet">
              Cancel
            </Button>
            <Button
              isLoading={isLoading}
              onPress={() => {
                void onUnlock().then((unlocked) => {
                  if (unlocked) {
                    setIsOpen(false);
                  }
                });
              }}
            >
              Unlock hint
            </Button>
          </>
        }
        description={`${hint.cost} points will be deducted from your score for ${challenge.name}.`}
        title="Unlock hint?"
      />
    </DialogTrigger>
  );
}

interface ChallengeHintsProps {
  challenge: ChallengeExperience;
  loadHints: ChallengeWorkspaceActions['loadHints'];
  unlockHint: ChallengeWorkspaceActions['unlockHint'];
}

export function ChallengeHints({ challenge, loadHints, unlockHint }: ChallengeHintsProps) {
  const [hints, setHints] = useState<ChallengeHint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingHint, setPendingHint] = useState<number | null>(null);

  async function refreshHints() {
    setError(null);
    setIsLoading(true);

    try {
      setHints(await loadHints(challenge.id));
    } catch {
      setError('Hints could not be loaded. Check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void loadHints(challenge.id)
      .then((result) => {
        if (active) {
          setHints(result);
        }
      })
      .catch(() => {
        if (active) {
          setError('Hints could not be loaded. Check your connection and retry.');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [challenge.id, loadHints]);

  async function unlock(hint: ChallengeHint): Promise<boolean> {
    setPendingHint(hint.id);
    setError(null);

    try {
      const receipt = await unlockHint(challenge.id, hint.id);
      setHints((current) => {
        return current.map((item) => {
          return item.id === hint.id ? receipt.hint : item;
        });
      });
      showToast({
        description: receipt.charged > 0 ? `${receipt.charged} points deducted.` : undefined,
        title: 'Hint revealed',
        tone: 'info'
      });
      return true;
    } catch {
      setError('The hint could not be revealed. Check your connection and retry.');
      return false;
    } finally {
      setPendingHint(null);
    }
  }

  if (isLoading) {
    return (
      <div aria-label="Loading hints" className="grid gap-3" role="status">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error && hints.length === 0) {
    return (
      <Alert
        actions={
          <Button
            onPress={() => {
              void refreshHints();
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

  if (hints.length === 0) {
    return <p className="m-0 text-base text-text-muted">No hints are available</p>;
  }

  return (
    <div className="grid gap-4">
      {error ? <Alert title={error} tone="danger" /> : null}
      <ol className="m-0 grid list-none divide-y divide-border-subtle p-0">
        {hints.map((hint, index) => (
          <li className="grid gap-3 py-4 first:pt-0 last:pb-0" key={hint.id}>
            <div className="flex items-center justify-between gap-4">
              <strong className="text-base text-text">Hint {index + 1}</strong>
              <span className="text-sm tabular-nums text-text-muted">
                {hint.cost > 0 ? `${hint.cost} points` : 'Free'}
              </span>
            </div>
            {hint.unlocked && hint.content ? (
              <p className="m-0 whitespace-pre-line text-base text-text-muted">{hint.content}</p>
            ) : (
              <div className="grid justify-items-start gap-2">
                <span className="text-sm text-text-muted">Locked</span>
                <HintUnlockAction
                  challenge={challenge}
                  hint={hint}
                  isLoading={pendingHint === hint.id}
                  onUnlock={() => unlock(hint)}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
