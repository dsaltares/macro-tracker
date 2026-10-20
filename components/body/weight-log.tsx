'use client';

import { IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormError } from '@/components/auth/fields';
import { WeightForm } from '@/components/body/weight-form';
import { Button } from '@/components/ui/button';
import { formatWeight } from '@/lib/domain/body';
import { formatDay, localDateOf } from '@/lib/domain/dates';
import { useTRPC } from '@/lib/trpc/client';

export const loadFailed = 'Your weights could not be loaded.';

export const removeFailed = 'That weight could not be removed. Try again.';

export function WeightLog() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const today = localDateOf(new Date());
  const weights = useQuery(
    trpc.body.list.queryOptions({ metric: 'weight_kg' }),
  );
  const remove = useMutation(
    trpc.body.remove.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.body.pathKey() }),
    }),
  );

  const log = () => {
    if (weights.isPending) {
      return <p className="text-muted-foreground text-sm">Loading…</p>;
    }
    if (weights.isError) {
      return <FormError>{loadFailed}</FormError>;
    }
    if (weights.data.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">No weights logged yet.</p>
      );
    }
    return (
      <ul className="flex flex-col divide-y rounded-lg border">
        {weights.data.map(({ id, date, value }) => (
          <li key={id} className="flex items-center gap-3 py-1 pr-1 pl-4">
            <span className="flex-1">{formatDay(date)}</span>
            <span className="font-medium tabular-nums">
              {formatWeight(value)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground"
              disabled={remove.isPending}
              onClick={() => remove.mutate(id)}
            >
              <IconTrash />
              <span className="sr-only">
                Remove the weight of {formatDay(date)}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <WeightForm today={today} pickDate />
      <section className="flex flex-col gap-3" aria-label="Weight log">
        {remove.isError ? <FormError>{removeFailed}</FormError> : null}
        {log()}
      </section>
    </div>
  );
}
