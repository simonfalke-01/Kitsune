import { Skeleton } from '@/components/ui';

export default function ScoreboardLoading() {
  return (
    <div aria-label="Loading scoreboard" className="grid gap-6" role="status">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-px w-full" />
      <div className="flex flex-wrap gap-6 border-y border-border-subtle py-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="h-10 w-24" key={index} />
        ))}
      </div>
      <div className="grid gap-2 rounded-lg border border-border-subtle p-3">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton className="h-12 w-full" key={index} />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
