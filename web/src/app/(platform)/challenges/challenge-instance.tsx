'use client';

import { useState } from 'react';

import { formatSolveTimestamp } from './challenge-solve-stub';
import { Alert, Button, CodeBlock, StatusIndicator } from '@/components/ui';

export type ChallengeInstanceState =
  'error' | 'running' | 'starting' | 'stopped' | 'stopping' | 'unavailable';

export interface ChallengeInstanceEndpoint {
  label: string;
  value: string;
}

interface ChallengeInstanceProps {
  endpoints?: readonly ChallengeInstanceEndpoint[];
  expiresAt?: string | null;
  onExtend?: () => Promise<void>;
  onStart?: () => Promise<void>;
  onStop?: () => Promise<void>;
  state: ChallengeInstanceState;
  unavailableReason?: string;
}

const stateLabels: Record<ChallengeInstanceState, string> = {
  error: 'Instance error',
  running: 'Running',
  starting: 'Starting',
  stopped: 'Stopped',
  stopping: 'Stopping',
  unavailable: 'Unavailable'
};

export function ChallengeInstance({
  endpoints = [],
  expiresAt,
  onExtend,
  onStart,
  onStop,
  state,
  unavailableReason
}: ChallengeInstanceProps) {
  const [pendingAction, setPendingAction] = useState<'extend' | 'start' | 'stop' | null>(null);

  async function run(
    action: 'extend' | 'start' | 'stop',
    handler: (() => Promise<void>) | undefined
  ) {
    if (!handler) {
      return;
    }

    setPendingAction(action);

    try {
      await handler();
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section aria-labelledby="challenge-instance-title" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-base font-semibold text-text" id="challenge-instance-title">
          Challenge instance
        </h3>
        <StatusIndicator
          label={stateLabels[state]}
          tone={
            state === 'running'
              ? 'success'
              : state === 'error'
                ? 'danger'
                : state === 'starting' || state === 'stopping'
                  ? 'warning'
                  : 'neutral'
          }
        />
      </div>
      {state === 'unavailable' ? (
        <Alert
          description={
            unavailableReason ??
            'Instance lifecycle endpoints are not available in this Kitsune deployment.'
          }
          title="Instance controls unavailable"
          tone="info"
        />
      ) : null}
      {state === 'error' ? (
        <Alert
          description="Retry the instance after the provider recovers."
          title="The instance could not be prepared"
          tone="danger"
        />
      ) : null}
      {endpoints.length > 0 ? (
        <div className="grid gap-3">
          {endpoints.map((endpoint) => (
            <CodeBlock code={endpoint.value} key={endpoint.label} label={endpoint.label} />
          ))}
        </div>
      ) : null}
      {state === 'running' && expiresAt ? (
        <p className="m-0 text-sm text-text-muted">Expires {formatSolveTimestamp(expiresAt)}</p>
      ) : null}
      {(state === 'stopped' || state === 'error') && onStart ? (
        <div className="flex flex-wrap gap-2">
          <Button
            isLoading={pendingAction === 'start'}
            onPress={() => {
              void run('start', onStart);
            }}
          >
            Deploy
          </Button>
        </div>
      ) : null}
      {state === 'running' && (onExtend || onStop) ? (
        <div className="flex flex-wrap gap-2">
          {onExtend ? (
            <Button
              isLoading={pendingAction === 'extend'}
              onPress={() => {
                void run('extend', onExtend);
              }}
              tone="secondary"
            >
              Extend
            </Button>
          ) : null}
          {onStop ? (
            <Button
              isLoading={pendingAction === 'stop'}
              onPress={() => {
                void run('stop', onStop);
              }}
              tone="danger"
            >
              Stop
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
