'use client';

import { useMemo } from 'react';

import { useEvent } from '@/app/event-context';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, EmptyState, Link, Progress, Skeleton, WorkspacePlaceholder } from '@/components/ui';
import { challengeProgress, createChallengeExperience, groupChallenges } from '@/lib/challenges';

function formatDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function eventSchedule(startsAt: string | null | undefined, endsAt: string | null | undefined) {
  const starts = formatDate(startsAt);
  const ends = formatDate(endsAt);

  if (starts && ends) {
    return `${starts} to ${ends}`;
  }

  if (starts) {
    return `Starts ${starts}`;
  }

  if (ends) {
    return `Ends ${ends}`;
  }

  return undefined;
}

export function OverviewHome() {
  const { challenges, error, isLoading, selectedEvent } = useEvent();
  const experiences = useMemo(
    () => challenges.map((challenge) => createChallengeExperience(challenge)),
    [challenges]
  );
  const progress = challengeProgress(experiences);
  const groups = groupChallenges(experiences);
  const completion = progress.total === 0 ? 0 : (progress.solved / progress.total) * 100;

  if (isLoading) {
    return (
      <div aria-label="Loading event overview" className="grid gap-8" role="status">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return <Alert title={error} tone="danger" />;
  }

  if (!selectedEvent) {
    return <WorkspacePlaceholder className="flex-1" title="Event unavailable" />;
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        actions={<Link href="/challenges">Challenges</Link>}
        description={eventSchedule(selectedEvent.starts_at, selectedEvent.ends_at)}
        title={selectedEvent.name}
      />

      {selectedEvent.description ? (
        <p className="m-0 max-w-prose whitespace-pre-line text-base text-text-muted">
          {selectedEvent.description}
        </p>
      ) : null}

      <section aria-labelledby="event-progress-title" className="grid gap-4">
        <h2
          className="m-0 font-display text-lg font-semibold tracking-tight text-text"
          id="event-progress-title"
        >
          Progress
        </h2>
        <div className="flex flex-wrap gap-8 rounded-lg bg-surface-raised px-4 py-3">
          <span className="grid gap-1">
            <span className="text-sm text-text-muted">Solved</span>
            <strong className="text-lg tabular-nums text-text">
              {progress.solved} of {progress.total}
            </strong>
          </span>
          <span className="grid gap-1">
            <span className="text-sm text-text-muted">Points</span>
            <strong className="text-lg tabular-nums text-text">
              {progress.earnedPoints} of {progress.availablePoints}
            </strong>
          </span>
        </div>
        <Progress label="Challenges" maxValue={100} value={completion} />
      </section>

      <section aria-labelledby="event-categories-title" className="grid gap-4">
        <h2
          className="m-0 font-display text-lg font-semibold tracking-tight text-text"
          id="event-categories-title"
        >
          Categories
        </h2>
        {groups.length === 0 ? (
          <EmptyState title="No challenges" />
        ) : (
          <ul className="m-0 grid list-none rounded-lg bg-surface-raised p-2 sm:grid-cols-2">
            {groups.map((group) => (
              <li
                className="flex items-center justify-between gap-4 px-3 py-2"
                key={group.category}
              >
                <span className="font-medium text-text">{group.category}</span>
                <span className="text-sm tabular-nums text-text-muted">
                  {group.solved}/{group.challenges.length}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
