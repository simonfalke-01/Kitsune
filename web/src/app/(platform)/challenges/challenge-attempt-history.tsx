'use client';

import type { ChallengeAttemptEntry, ChallengeAttemptOutcome } from './challenge-attempt-stub';
import { Avatar, Button, DialogTrigger, Popover, PopoverDialog } from '@/components/ui';

const outcomeClasses: Record<ChallengeAttemptOutcome, string> = {
  correct: 'text-success-text',
  incorrect: 'text-danger-text',
  pending: 'text-info-text',
  unknown: 'text-text-muted'
};

const outcomeLabels: Record<ChallengeAttemptOutcome, string> = {
  correct: 'Correct',
  incorrect: 'Incorrect',
  pending: 'Pending review',
  unknown: 'Received'
};

function absoluteAttemptTime(value: string): string {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return 'Time unavailable';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
    year: 'numeric'
  }).format(parsed);
}

interface ChallengeAttemptHistoryProps {
  attempts: readonly ChallengeAttemptEntry[];
}

export function ChallengeAttemptHistory({ attempts }: ChallengeAttemptHistoryProps) {
  const latest = attempts[0];

  if (!latest) {
    return null;
  }

  return (
    <section
      aria-label="Team attempt summary"
      className="flex min-h-control flex-wrap items-center justify-between gap-3"
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <strong className="text-sm font-semibold text-text">
          {attempts.length.toLocaleString()} team {attempts.length === 1 ? 'attempt' : 'attempts'}
        </strong>
        <span className="truncate text-sm text-text-muted">
          Last {outcomeLabels[latest.outcome].toLocaleLowerCase()} by {latest.actor.name}
        </span>
      </div>
      <DialogTrigger>
        <Button className="shrink-0" size="small" tone="secondary">
          View attempts
        </Button>
        <Popover isNonModal placement="top end" size="wide">
          <PopoverDialog aria-label="Team attempts" className="grid gap-4" size="wide">
            <h2 className="m-0 font-display text-lg font-semibold tracking-tight text-text">
              Team attempts
            </h2>
            <div className="grid gap-2">
              <div
                aria-hidden
                className="hidden grid-cols-12 gap-3 px-2 text-xs font-medium text-text-subtle sm:grid"
              >
                <span className="col-span-4">Submitted value</span>
                <span className="col-span-3">Teammate</span>
                <span className="col-span-2">Result</span>
                <span className="col-span-3 text-right">Time</span>
              </div>
              <ol
                aria-label="Shared attempt history"
                className="kitsune-scroll-region m-0 grid max-h-chart list-none gap-2 overflow-y-auto p-0"
              >
                {attempts.map((attempt) => (
                  <li
                    className="grid min-h-control grid-cols-2 items-center gap-2 px-2 py-2 sm:grid-cols-12 sm:gap-3"
                    key={attempt.id}
                  >
                    <code
                      className="col-span-2 truncate font-mono text-sm text-text sm:col-span-4"
                      title={attempt.value}
                    >
                      {attempt.value}
                    </code>
                    <span className="col-span-1 flex min-w-0 items-center gap-2 text-sm text-text sm:col-span-3">
                      <Avatar name={attempt.actor.name} size="small" tone="violet" />
                      <span className="truncate">{attempt.actor.name}</span>
                    </span>
                    <span
                      className={`col-span-1 text-right text-sm font-medium sm:col-span-2 sm:text-left ${outcomeClasses[attempt.outcome]}`}
                    >
                      {outcomeLabels[attempt.outcome]}
                    </span>
                    <time
                      className="col-span-2 text-sm tabular-nums text-text-muted sm:col-span-3 sm:text-right"
                      dateTime={attempt.submittedAt}
                    >
                      {absoluteAttemptTime(attempt.submittedAt)}
                    </time>
                  </li>
                ))}
              </ol>
            </div>
          </PopoverDialog>
        </Popover>
      </DialogTrigger>
    </section>
  );
}
