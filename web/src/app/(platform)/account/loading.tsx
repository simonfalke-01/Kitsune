import { Skeleton } from '@/components/ui';

export default function AccountLoading() {
  return (
    <div aria-label="Loading account security" className="grid gap-8" role="status">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-2 rounded-lg border border-border-subtle p-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="h-12 w-full" key={index} />
        ))}
      </div>
      <div className="grid gap-2 rounded-lg border border-border-subtle p-3">
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton className="h-12 w-full" key={index} />
        ))}
      </div>
    </div>
  );
}
