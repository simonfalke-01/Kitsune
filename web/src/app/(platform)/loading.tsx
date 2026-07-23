import { Skeleton } from '@/components/ui';

export default function PlatformLoading() {
  return (
    <main
      aria-label="Loading Kitsune"
      className="mx-auto grid min-h-screen w-full max-w-shell content-start gap-6 px-4 py-8 sm:px-6 lg:px-8"
      role="status"
    >
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-px w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-24 w-full" key={index} />
        ))}
      </div>
    </main>
  );
}
