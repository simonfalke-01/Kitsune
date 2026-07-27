import { Check, Trophy } from 'lucide-react';

import {
  formatSolveDelta,
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

interface SolveRowProps {
  entry: ChallengeSolveEntry;
  isPinned?: boolean;
}

function SolveRow({ entry, isPinned = false }: SolveRowProps) {
  const entryPlacement = placement(entry);

  return (
    <li
      className={cx(
        'flex min-h-16 items-center gap-3 px-3 py-2',
        entry.isSelf ? 'border-l-2 border-accent bg-accent-subtle' : null,
        isPinned ? 'sticky bottom-0 z-10 bg-accent-subtle shadow-md' : null
      )}
    >
      <span className="flex shrink-0 items-center gap-4">
        <strong
          className={cx(
            'w-8 text-right text-sm font-semibold tabular-nums text-text-muted',
            entryPlacement ? placementTextClasses[entryPlacement] : null,
            entry.isSelf ? 'text-accent-text' : null
          )}
        >
          #{entry.rank}
        </strong>
        <Avatar name={entry.competitorName} size="small" tone={avatarTone(entry.competitorId)} />
      </span>
      <div className="grid min-w-0 flex-1 gap-1">
        <strong
          className={cx(
            'truncate text-base font-medium text-text',
            entryPlacement ? placementTextClasses[entryPlacement] : null,
            entry.isSelf ? 'text-accent-text' : null
          )}
        >
          {entry.competitorName}
        </strong>
        <span className="text-xs tabular-nums text-text-muted">
          {entry.isSelf ? 'You' : `#${entry.globalRank} overall`}
        </span>
      </div>
      <div className="grid shrink-0 justify-items-end gap-1 text-right tabular-nums">
        <strong className="text-sm font-medium text-text">{formatSolveDelta(entry.deltaMs)}</strong>
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

  const pinSelf = context.selfEntry ? context.selfEntry.rank > 6 : false;
  const leadingEntries = context.entries.slice(0, 6);
  const trailingEntries = context.entries
    .slice(6)
    .filter((entry) => !pinSelf || entry.id !== context.selfEntry?.id);

  return (
    <ol aria-label="Solve standings" className="m-0 grid list-none gap-0 p-0">
      {leadingEntries.map((entry) => (
        <SolveRow entry={entry} key={entry.id} />
      ))}
      {context.selfEntry && pinSelf ? (
        <SolveRow entry={context.selfEntry} isPinned key={`pinned-${context.selfEntry.id}`} />
      ) : null}
      {trailingEntries.map((entry) => (
        <SolveRow entry={entry} key={entry.id} />
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
    <section aria-label="Challenge solve context">
      <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 p-0 lg:grid-cols-4">
        {leaders.map((entry, index) => {
          const entryPlacement = (index + 1) as 1 | 2 | 3;

          return (
            <li className="grid min-w-0 gap-1 px-3 py-2" key={entryPlacement}>
              <span
                className={cx(
                  'flex items-center gap-1 text-xs font-semibold',
                  placementTextClasses[entryPlacement]
                )}
              >
                {entryPlacement === 1 ? <Trophy aria-hidden className="size-3" /> : null}
                {ordinal(entryPlacement)}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                {entry ? (
                  <Avatar
                    name={entry.competitorName}
                    size="small"
                    tone={avatarTone(entry.competitorId)}
                  />
                ) : null}
                <strong className="truncate text-sm font-medium text-text">
                  {entry?.competitorName ?? 'Open'}
                </strong>
              </span>
              <span className="text-xs tabular-nums text-text-muted">
                {entry ? formatSolveDelta(entry.deltaMs) : 'No solve'}
              </span>
            </li>
          );
        })}
        <li className="grid min-w-0 gap-1 border-l-2 border-accent bg-accent-subtle px-3 py-2 text-accent-text">
          <span className="flex items-center gap-1 text-xs font-semibold">
            {context.selfEntry ? <Check aria-hidden className="size-3" /> : null}
            {context.selfEntry ? ordinal(context.selfEntry.rank) : 'You'}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <Avatar
              name={context.currentCompetitor.name}
              size="small"
              tone={avatarTone(context.currentCompetitor.id)}
            />
            <strong className="truncate text-sm font-medium">
              {context.currentCompetitor.name}
            </strong>
          </span>
          <span className="text-xs tabular-nums">
            {context.selfEntry ? formatSolveDelta(context.selfEntry.deltaMs) : 'Unsolved'}
          </span>
        </li>
      </ul>
    </section>
  );
}

export function ChallengeSolvedSummary() {
  return (
    <div className="flex items-center px-3 py-2 text-success-text">
      <span className="inline-flex items-center gap-2 text-sm font-medium">
        <Check aria-hidden className="size-4" />
        Challenge solved
      </span>
    </div>
  );
}
