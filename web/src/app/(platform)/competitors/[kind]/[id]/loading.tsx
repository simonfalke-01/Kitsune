import { Skeleton } from '@/components/ui/skeleton';

export default function CompetitorProfileLoading() {
  return (
    <div aria-label="Loading competitor profile" className="grid gap-8" role="status">
      <div className="grid gap-4 border-b border-border-subtle pb-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid gap-4 border-y border-border-subtle py-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="grid gap-2" key={index}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
