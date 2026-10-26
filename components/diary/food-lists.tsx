'use client';

import { IconCheck, IconPlus } from '@tabler/icons-react';
import {
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { FormError } from '@/components/auth/fields';
import { formatQuantity } from '@/components/diary/amounts';
import {
  FoodRow,
  Message,
  ResultsSkeleton,
} from '@/components/diary/food-search-results';
import { Button } from '@/components/ui/button';
import type {
  FoodSummary,
  FoodWithLastLoggedAmount,
} from '@/lib/db/food-search';
import type { Meal } from '@/lib/domain/diary/entries';
import { useTRPC } from '@/lib/trpc/client';

export const foodListFailed = 'These foods could not be loaded.';

export const addAgainFailed = 'Could not add. Try again.';

export const foodMatches = (
  { name, brand }: Pick<FoodSummary, 'name' | 'brand'>,
  query: string,
) => {
  const text = `${name} ${brand ?? ''}`.toLocaleLowerCase('en');
  return query
    .toLocaleLowerCase('en')
    .split(/\s+/)
    .every((word) => text.includes(word));
};

export const lastLoggedAmountOf = ({
  quantity,
  portion,
}: FoodWithLastLoggedAmount) =>
  `${formatQuantity(quantity)} × ${portion.label}`;

type ListProps = {
  date: string;
  meal: Meal;
  empty: string;
  query: string;
  onNoMatches: () => void;
  onSelectFood: (food: FoodSummary) => void;
};

function AddAgain({
  food,
  date,
  meal,
}: {
  food: FoodWithLastLoggedAmount;
  date: string;
  meal: Meal;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const add = useMutation(
    trpc.diary.addFood.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: trpc.diary.pathKey() }),
    }),
  );
  const amount = lastLoggedAmountOf(food);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1 pr-4">
      <Button
        variant="outline"
        className="h-11 max-w-36"
        aria-label={`Add ${amount} of ${food.name}`}
        disabled={add.isPending}
        onClick={() =>
          add.mutate({
            date,
            meal,
            foodId: food.id,
            portion: food.portion.label,
            quantity: food.quantity,
          })
        }
      >
        {add.isSuccess ? (
          <IconCheck className="size-4" />
        ) : (
          <IconPlus className="size-4" />
        )}
        <span className="truncate">{amount}</span>
      </Button>
      {add.isError ? (
        <p role="alert" className="text-destructive text-xs">
          {addAgainFailed}
        </p>
      ) : null}
    </div>
  );
}

function FoodListItems({
  foods,
  date,
  meal,
  empty,
  query,
  onNoMatches,
  onSelectFood,
}: ListProps & { foods: UseQueryResult<FoodWithLastLoggedAmount[], unknown> }) {
  const searching = query.trim() !== '';
  const matching =
    foods.data?.filter(
      (food) => !searching || foodMatches(food, query.trim()),
    ) ?? [];
  const noMatches = searching && foods.isSuccess && matching.length === 0;

  useEffect(() => {
    if (noMatches) {
      onNoMatches();
    }
  }, [noMatches, onNoMatches]);

  if (foods.isPending) {
    return <ResultsSkeleton />;
  }
  if (foods.isError) {
    return (
      <div className="p-4">
        <FormError>{foodListFailed}</FormError>
      </div>
    );
  }
  if (noMatches) {
    return null;
  }
  if (matching.length === 0) {
    return <Message>{empty}</Message>;
  }

  return (
    <ul className="flex flex-col divide-y">
      {matching.map((food) => (
        <FoodRow
          key={food.id}
          food={food}
          onSelect={() => onSelectFood(food)}
          action={<AddAgain food={food} date={date} meal={meal} />}
        />
      ))}
    </ul>
  );
}

export function RecentFoods(props: ListProps) {
  const trpc = useTRPC();
  const foods = useQuery(trpc.diary.recentFoods.queryOptions());
  return <FoodListItems foods={foods} {...props} />;
}

export function FrequentFoods(props: ListProps) {
  const trpc = useTRPC();
  const foods = useQuery(trpc.diary.frequentFoods.queryOptions(props.date));
  return <FoodListItems foods={foods} {...props} />;
}

export function FavouriteFoods(props: ListProps) {
  const trpc = useTRPC();
  const foods = useQuery(trpc.food.favourites.queryOptions());
  return <FoodListItems foods={foods} {...props} />;
}
