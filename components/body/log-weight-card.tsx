'use client';

import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { WeightForm } from '@/components/body/weight-form';
import { formatWeight } from '@/lib/domain/body';
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
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={headingId} className="font-semibold">
        Log weight
      </h2>
      <WeightForm
        today={today}
        pickDate={false}
        hint={
          latest.data
            ? `Last: ${formatWeight(latest.data.value)} on ${formatDay(latest.data.date)}`
            : undefined
        }
      />
    </section>
  );
}
