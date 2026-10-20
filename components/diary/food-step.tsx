'use client';

import { IconArrowLeft } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormError } from '@/components/auth/fields';
import { EntryForm } from '@/components/diary/entry-form';
import { energyPer100g } from '@/components/diary/food-search-results';
import { SourceBadge } from '@/components/foods/source-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { FoodSummary } from '@/lib/db/food-search';
import type { Meal } from '@/lib/domain/diary/entries';
import { defaultPortion } from '@/lib/domain/foods/portions';
import { useTRPC } from '@/lib/trpc/client';

export const foodLoadFailed = 'This food could not be loaded.';

export const addFailed = 'The entry could not be saved. Try again.';

const defaultQuantity = 1;

function AddEntry({
  foodId,
  date,
  meal,
  onAdded,
}: {
  foodId: string;
  date: string;
  meal: Meal;
  onAdded: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const food = useQuery(trpc.food.get.queryOptions(foodId));
  const add = useMutation(
    trpc.diary.addFood.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.diary.day.queryKey(),
        });
        onAdded();
      },
    }),
  );

  if (food.isPending) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }
  if (food.isError) {
    return <FormError>{foodLoadFailed}</FormError>;
  }

  return (
    <>
      {add.isError ? <FormError>{addFailed}</FormError> : null}
      <EntryForm
        food={food.data}
        portions={food.data.portions}
        defaultValues={{
          quantity: defaultQuantity,
          portion: defaultPortion(food.data.portions).label,
          meal,
          time: '',
        }}
        saving={add.isPending}
        onSave={({ quantity, portion, meal, time }) =>
          add.mutate({
            date,
            meal,
            foodId,
            portion,
            quantity,
            time: time === '' ? null : time,
          })
        }
      />
    </>
  );
}

export type FoodHeader = Pick<
  FoodSummary,
  'id' | 'name' | 'brand' | 'source' | 'energyKcal'
>;

export function FoodStep({
  food,
  date,
  meal,
  onBack,
  onAdded,
}: {
  food: FoodHeader;
  date: string;
  meal: Meal;
  onBack: () => void;
  onAdded: () => void;
}) {
  return (
    <section
      aria-label={food.name}
      className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <Button
        variant="ghost"
        className="-ml-2 h-11 self-start"
        onClick={onBack}
      >
        <IconArrowLeft className="size-5" />
        Back to search
      </Button>
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-base">{food.name}</h3>
        {food.brand === null ? null : (
          <p className="text-muted-foreground text-sm">{food.brand}</p>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm tabular-nums">
        {energyPer100g(food)}
        <SourceBadge source={food.source} />
      </div>
      <AddEntry foodId={food.id} date={date} meal={meal} onAdded={onAdded} />
    </section>
  );
}
