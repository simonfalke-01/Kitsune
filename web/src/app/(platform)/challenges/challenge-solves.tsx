import { Check, Trophy } from 'lucide-react';

import type { FirstBloodHighlightColor } from './challenge-presentation';
import {
  formatSolveDelta,
  formatSolveElapsedTime,
  formatSolveTimestamp,
  type ChallengeSolveContext,
  type ChallengeSolveEntry
} from './challenge-solve-stub';
import { Alert, Avatar, type AvatarTone, EmptyState, Skeleton } from '@/components/ui';
import { cx } from '@/components/ui/styles';

type SolveViewState = 'error' | 'hidden' | 'loading' | 'ready';

const placementTextClasses = {
  1: 'text-podium-first',
  2: 'text-podium-second',
  3: 'text-podium-third'
} as const;

function ordinal(value: number): string {
  const remainder = value % 100;

  if (remainder >= 11 && remainder <= 13) {
    return `${value}th`;
  }

  const suffix = value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th';
  return `${value}${suffix}`;
}

function placement(entry: ChallengeSolveEntry): 1 | 2 | 3 | null {
  return entry.rank <= 3 ? (entry.rank as 1 | 2 | 3) : null;
}

const avatarTones: readonly AvatarTone[] = [
  'blue',
  'cyan',
  'teal',
  'lime',
  'orange',
  'pink',
  'violet'
];

function avatarTone(value: string): AvatarTone {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }

  return avatarTones[hash % avatarTones.length] ?? 'blue';
}

interface SolveIdentityProps {
  avatarUrl?: string | null;
  caption: string;
  competitorId: string;
  competitorName: string;
}

function SolveIdentity({ avatarUrl, caption, competitorId, competitorName }: SolveIdentityProps) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar name={competitorName} src={avatarUrl} tone={avatarTone(competitorId)} />
      <span className="kitsune-optical-center grid min-w-0 gap-0">
        <strong className="truncate text-sm font-semibold text-text">{competitorName}</strong>
        <span className="truncate text-xs font-normal tabular-nums text-text-muted">{caption}</span>
      </span>
    </span>
  );
}

interface SolveRowProps {
  entry: ChallengeSolveEntry;
  eventStartedAt: string;
}

function SolveRow({ entry, eventStartedAt }: SolveRowProps) {
  const entryPlacement = placement(entry);

  return (
    <li
      aria-current={entry.isSelf ? 'true' : undefined}
      className={cx(
        'flex min-h-16 items-center gap-3 px-3 py-2',
        entry.isSelf
          ? 'sticky bottom-0 z-10 border-l-2 border-accent bg-accent-subtle shadow-md'
          : null
      )}
    >
      <strong
        className={cx(
          'kitsune-optical-center w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-text-muted',
          entryPlacement ? placementTextClasses[entryPlacement] : null,
          entry.isSelf ? 'text-accent-text' : null
        )}
      >
        #{entry.rank}
      </strong>
      <SolveIdentity
        avatarUrl={entry.avatarUrl}
        caption={entry.isSelf ? 'You' : `#${entry.globalRank} overall`}
        competitorId={entry.competitorId}
        competitorName={entry.competitorName}
      />
      <div className="kitsune-optical-center grid shrink-0 justify-items-end gap-1 text-right tabular-nums">
        <strong className="text-sm font-medium text-text">
          {entry.rank === 1
            ? `First blood (${formatSolveElapsedTime(entry.solvedAt, eventStartedAt)})`
            : formatSolveDelta(entry.deltaMs)}
        </strong>
        <span className="text-xs text-text-muted">{formatSolveTimestamp(entry.solvedAt)}</span>
      </div>
    </li>
  );
}

interface ChallengeSolvesProps {
  context: ChallengeSolveContext;
  state?: SolveViewState;
}

export function ChallengeSolves({ context, state = 'ready' }: ChallengeSolvesProps) {
  if (state === 'loading') {
    return (
      <div aria-label="Loading solve standings" className="grid gap-2" role="status">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-16 w-full" key={index} />
        ))}
      </div>
    );
  }

  if (state === 'error') {
    return <Alert title="Solve standings could not be loaded" tone="danger" />;
  }

  if (state === 'hidden') {
    return <EmptyState title="Solve standings are hidden" />;
  }

  if (context.entries.length === 0) {
    return <EmptyState title="No solves yet" />;
  }

  return (
    <ol aria-label="Solve standings" className="m-0 grid list-none gap-0 p-0">
      {context.entries.map((entry) => (
        <SolveRow entry={entry} eventStartedAt={context.eventStartedAt} key={entry.id} />
      ))}
    </ol>
  );
}

interface ChallengeSolveStripProps {
  context: ChallengeSolveContext;
}

export function ChallengeSolveStrip({ context }: ChallengeSolveStripProps) {
  const leaders = [1, 2, 3].map(
    (rank) => context.entries.find((entry) => entry.rank === rank) ?? null
  );

  return (
    <section aria-label="Challenge solve context" className="@container">
      <ul className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-2 p-0 @xl:grid-flow-col @xl:grid-cols-2 @xl:grid-rows-2 @5xl:grid-flow-row @5xl:grid-cols-4 @5xl:grid-rows-1">
        {leaders.map((entry, index) => {
          const entryPlacement = (index + 1) as 1 | 2 | 3;

          return (
            <li className="flex min-h-16 min-w-0 items-center gap-3 px-3 py-2" key={entryPlacement}>
              <span
                className={cx(
                  'kitsune-optical-center flex w-8 shrink-0 items-center justify-end gap-1 text-xs font-semibold',
                  entry ? placementTextClasses[entryPlacement] : 'text-text-muted'
                )}
              >
                {entryPlacement === 1 ? (
                  <Trophy aria-hidden className="size-3 -translate-y-optical" />
                ) : null}
                {ordinal(entryPlacement)}
              </span>
              {entry ? (
                <SolveIdentity
                  avatarUrl={entry.avatarUrl}
                  caption={
                    entryPlacement === 1
                      ? `First blood (${formatSolveElapsedTime(entry.solvedAt, context.eventStartedAt)})`
                      : formatSolveDelta(entry.deltaMs)
                  }
                  competitorId={entry.competitorId}
                  competitorName={entry.competitorName}
                />
              ) : (
                <strong className="kitsune-optical-center text-sm font-medium text-text-muted">
                  Open
                </strong>
              )}
            </li>
          );
        })}
        <li className="flex min-h-16 min-w-0 items-center gap-3 border-l-2 border-accent bg-accent-subtle px-3 py-2 text-accent-text">
          <span className="kitsune-optical-center flex w-8 shrink-0 items-center justify-end gap-1 text-xs font-semibold">
            {context.selfEntry ? <Check aria-hidden className="size-3" /> : null}
            {context.selfEntry ? ordinal(context.selfEntry.rank) : 'You'}
          </span>
          <SolveIdentity
            avatarUrl={context.currentCompetitor.avatarUrl}
            caption={
              context.selfEntry
                ? context.selfEntry.rank === 1
                  ? `First blood (${formatSolveElapsedTime(context.selfEntry.solvedAt, context.eventStartedAt)})`
                  : formatSolveDelta(context.selfEntry.deltaMs)
                : 'Unsolved'
            }
            competitorId={context.currentCompetitor.id}
            competitorName={context.currentCompetitor.name}
          />
        </li>
      </ul>
    </section>
  );
}

interface ChallengeSolvedSummaryProps {
  firstBloodHighlightColor: FirstBloodHighlightColor;
  isFirstBlood?: boolean;
  label: string;
}

export function ChallengeSolvedSummary({
  firstBloodHighlightColor,
  isFirstBlood = false,
  label
}: ChallengeSolvedSummaryProps) {
  return (
    <div className="grid gap-2" data-first-blood={isFirstBlood || undefined}>
      <span className="text-sm font-medium text-text">{label}</span>
      <span
        data-first-blood-color={isFirstBlood ? firstBloodHighlightColor : undefined}
        className={cx(
          'flex h-control items-center rounded-md border border-transparent px-3',
          isFirstBlood ? 'kitsune-first-blood-copy' : 'text-success-text'
        )}
      >
        <span className="kitsune-optical-center inline-flex items-center gap-2 text-base font-medium">
          Challenge solved
          {isFirstBlood ? (
            <Trophy aria-hidden className="size-4 -translate-y-optical" />
          ) : (
            <Check aria-hidden className="size-4" />
          )}
        </span>
      </span>
    </div>
  );
}
