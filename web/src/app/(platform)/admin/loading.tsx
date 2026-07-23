import { Skeleton } from '@/components/ui';

export default function AdminLoading() {
  return (
    <div aria-label="Loading live operations" className="grid gap-8" role="status">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="h-16 w-full" key={index} />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
