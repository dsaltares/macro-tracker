import { TopBarFrame } from '@/components/app-shell/top-bar';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-1 flex-col">
      <TopBarFrame>
        <Skeleton className="h-6 w-32" />
      </TopBarFrame>
      <div className="flex flex-col gap-4 px-4 py-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
