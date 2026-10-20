'use client';

import { IconArrowLeft, IconStar, IconStarFilled } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { energyPer100g } from '@/components/diary/food-search-results';
import { SourceBadge } from '@/components/foods/source-badge';
import { Button } from '@/components/ui/button';
import type { FoodSummary } from '@/lib/db/food-search';
import { useTRPC } from '@/lib/trpc/client';

function FavouriteToggle({ foodId }: { foodId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const favourites = useQuery(trpc.food.favourites.queryOptions());
  const toggle = useMutation(
    trpc.food.toggleFavourite.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.food.favourites.queryKey(),
        }),
    }),
  );
  const favourite = favourites.data?.some(({ id }) => id === foodId) ?? false;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-11 shrink-0"
      aria-pressed={favourite}
      disabled={favourites.isPending || toggle.isPending}
      onClick={() => toggle.mutate(foodId)}
    >
      {favourite ? (
        <IconStarFilled className="size-5 text-primary" />
      ) : (
        <IconStar className="size-5" />
      )}
      <span className="sr-only">Favourite</span>
    </Button>
  );
}

export function FoodStep({
  food,
  onBack,
}: {
  food: FoodSummary;
  onBack: () => void;
}) {
  return (
    <section
      aria-label={food.name}
      className="flex flex-col gap-3 overflow-y-auto px-4 pb-4"
    >
      <Button
        variant="ghost"
        className="-ml-2 h-11 self-start"
        onClick={onBack}
      >
        <IconArrowLeft className="size-5" />
        Back to search
      </Button>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="font-semibold text-base">{food.name}</h3>
          {food.brand === null ? null : (
            <p className="text-muted-foreground text-sm">{food.brand}</p>
          )}
        </div>
        <FavouriteToggle foodId={food.id} />
      </div>
      <div className="flex items-center gap-2 text-sm tabular-nums">
        {energyPer100g(food)}
        <SourceBadge source={food.source} />
      </div>
    </section>
  );
}
