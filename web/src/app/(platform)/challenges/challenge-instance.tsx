'use client';

import { useState } from 'react';

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
  template: string;
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
  template,
  unavailableReason
}: ChallengeInstanceProps) {
  const [pendingAction, setPendingAction] = useState<'extend' | 'start' | 'stop' | null>(null);
  const isTransitioning = state === 'starting' || state === 'stopping';

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
      <CodeBlock code={template} label="Instance template" />
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
        <p className="m-0 text-sm text-text-muted">
          Expires {new Date(expiresAt).toLocaleString()}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {state === 'stopped' || state === 'error' || state === 'unavailable' ? (
          <Button
            isDisabled={!onStart || state === 'unavailable'}
            isLoading={pendingAction === 'start'}
            onPress={() => {
              void run('start', onStart);
            }}
          >
            Deploy
          </Button>
        ) : null}
        {state === 'running' ? (
          <>
            <Button
              isDisabled={!onExtend}
              isLoading={pendingAction === 'extend'}
              onPress={() => {
                void run('extend', onExtend);
              }}
              tone="secondary"
            >
              Extend
            </Button>
            <Button
              isDisabled={!onStop}
              isLoading={pendingAction === 'stop'}
              onPress={() => {
                void run('stop', onStop);
              }}
              tone="danger"
            >
              Stop
            </Button>
          </>
        ) : null}
        {isTransitioning ? (
          <span className="self-center text-sm text-text-muted">Provider action in progress</span>
        ) : null}
      </div>
    </section>
  );
}
