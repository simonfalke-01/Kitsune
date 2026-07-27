import type { ChallengeNearbyStandingStub } from './challenge-solve-stub';

interface ChallengeNearbyStandingsProps {
  entries: readonly ChallengeNearbyStandingStub[];
}

export function ChallengeNearbyStandings({ entries }: ChallengeNearbyStandingsProps) {
  return (
    <aside
      aria-label="Teams around your rank"
      className="relative h-chart-compact min-w-0 overflow-hidden lg:h-chart"
    >
      {entries.length === 0 ? (
        <p className="m-0 flex h-full items-center px-3 text-sm text-text-muted">No nearby teams</p>
      ) : (
        <ol className="m-0 grid h-full list-none grid-rows-5 p-0">
          {entries.map((entry) => (
            <li
              aria-current={entry.isSelf ? 'true' : undefined}
              className="grid min-h-0 grid-cols-12 items-center gap-2 px-3 text-sm tabular-nums"
              key={entry.id}
            >
              <span className="col-span-2 text-text-subtle">#{entry.rank}</span>
              <span
                className={`col-span-6 min-w-0 break-words ${
                  entry.isSelf ? 'font-semibold text-accent-text' : 'font-medium text-text-muted'
                }`}
              >
                {entry.name}
              </span>
              <span className="col-span-4 whitespace-nowrap text-right text-text-subtle">
                {entry.points.toLocaleString()} pts
              </span>
            </li>
          ))}
        </ol>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-surface-raised/80 via-transparent to-surface-raised/80"
      />
    </aside>
  );
}
