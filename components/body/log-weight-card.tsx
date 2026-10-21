'use client';

import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { WeightForm } from '@/components/body/weight-form';
import { formatWeight } from '@/lib/domain/body/measurements';
import { formatDay } from '@/lib/domain/dates';
import { useTRPC } from '@/lib/trpc/client';

export function LogWeightCard({ today }: { today: string }) {
  const trpc = useTRPC();
  const headingId = useId();
  const latest = useQuery(
    trpc.body.latest.queryOptions({ metric: 'weight_kg', onOrBefore: today }),
  );

  if (!latest.isSuccess || latest.data?.date === today) {
    return null;
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-lg border px-4 pt-3 pb-1"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-semibold text-sm">
          Log weight
        </h2>
        {latest.data ? (
          <p className="truncate text-muted-foreground text-xs">
            {`Last: ${formatWeight(latest.data.value)} on ${formatDay(latest.data.date)}`}
          </p>
        ) : null}
      </div>
      <WeightForm today={today} pickDate={false} inline />
    </section>
  );
}
