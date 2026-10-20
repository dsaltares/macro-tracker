'use client';

import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useId } from 'react';
import { FormError } from '@/components/auth/fields';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { FoodSourceSummary } from '@/lib/db/food-source-preferences';
import type {
  GenericSource,
  ReferenceSource,
} from '@/lib/domain/foods/sources';
import { useTRPC } from '@/lib/trpc/client';

const sourceNames: Record<ReferenceSource, string> = {
  off: 'Open Food Facts',
  ciqual: 'CIQUAL',
  cofid: 'CoFID',
  usda: 'USDA FoodData Central',
};

const sourceDescriptions: Record<ReferenceSource, string> = {
  off: 'Packaged products, by name or barcode',
  ciqual: 'Generic foods, from France',
  cofid: 'Generic foods, from the United Kingdom',
  usda: 'Generic foods, from the United States',
};

export const loadFailed = 'Your food sources could not be loaded.';

export const saveFailed = 'Your change could not be saved. Try again.';

const foodCount = new Intl.NumberFormat('en-GB');

type GenericSummary = FoodSourceSummary & { source: GenericSource };

const isGeneric = (summary: FoodSourceSummary): summary is GenericSummary =>
  !summary.alwaysOn;

const moved = <T,>(items: readonly T[], from: number, to: number) => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    next.splice(to, 0, item);
  }
  return next;
};

function SourceRow({
  summary,
  disabled,
  children,
  onEnabledChange,
}: {
  summary: FoodSourceSummary;
  disabled: boolean;
  children?: ReactNode;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const id = useId();
  const name = sourceNames[summary.source];

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label htmlFor={id} className="font-medium">
          {name}
        </label>
        <span className="text-muted-foreground text-sm">
          {sourceDescriptions[summary.source]}
        </span>
        <span className="text-muted-foreground text-xs">
          {summary.alwaysOn
            ? `Always on · ${foodCount.format(summary.foods)} foods`
            : `${foodCount.format(summary.foods)} foods`}
        </span>
      </div>
      {children}
      <Switch
        id={id}
        checked={summary.enabled}
        disabled={summary.alwaysOn || disabled}
        onCheckedChange={onEnabledChange}
      />
    </li>
  );
}

export function FoodSourcesSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const sources = useQuery(trpc.food.sources.queryOptions());
  const save = useMutation(
    trpc.food.setSourcePreferences.mutationOptions({
      onSuccess: (saved) =>
        queryClient.setQueryData(trpc.food.sources.queryKey(), saved),
    }),
  );

  if (sources.isPending) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (sources.isError) {
    return <FormError>{loadFailed}</FormError>;
  }

  const alwaysOn = sources.data.filter((summary) => !isGeneric(summary));
  const generic = sources.data.filter(isGeneric);
  const saveGeneric = (next: readonly GenericSummary[]) =>
    save.mutate(next.map(({ source, enabled }) => ({ source, enabled })));
  const lastIndex = generic.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Your own foods and Open Food Facts always appear when you search. Choose
        which tables of generic foods appear too, and in what order.
      </p>
      {save.isError ? <FormError>{saveFailed}</FormError> : null}
      <ul className="flex flex-col divide-y rounded-lg border">
        {alwaysOn.map((summary) => (
          <SourceRow key={summary.source} summary={summary} disabled />
        ))}
        {generic.map((summary, index) => (
          <SourceRow
            key={summary.source}
            summary={summary}
            disabled={save.isPending}
            onEnabledChange={(enabled) =>
              saveGeneric(
                generic.map((each) =>
                  each.source === summary.source ? { ...each, enabled } : each,
                ),
              )
            }
          >
            <div className="flex flex-col">
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                disabled={index === 0 || save.isPending}
                onClick={() => saveGeneric(moved(generic, index, index - 1))}
              >
                <IconArrowUp />
                <span className="sr-only">
                  Move {sourceNames[summary.source]} up
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                disabled={index === lastIndex || save.isPending}
                onClick={() => saveGeneric(moved(generic, index, index + 1))}
              >
                <IconArrowDown />
                <span className="sr-only">
                  Move {sourceNames[summary.source]} down
                </span>
              </Button>
            </div>
          </SourceRow>
        ))}
      </ul>
    </div>
  );
}
