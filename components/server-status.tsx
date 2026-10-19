'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/client';

export function ServerStatus() {
  const trpc = useTRPC();
  const { isPending, isError } = useQuery(trpc.health.check.queryOptions());
  const status = isPending
    ? 'Connecting…'
    : isError
      ? 'Server unreachable'
      : 'Server connected';
  return (
    <p role="status" className="text-muted-foreground text-sm">
      {status}
    </p>
  );
}
