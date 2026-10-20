'use client';

import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useRef } from 'react';
import { FormError } from '@/components/auth/fields';
import { SourceBadge } from '@/components/foods/source-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { FoodSummary } from '@/lib/db/food-search';
import { searchTerms } from '@/lib/domain/foods/search';
import { formatAmount } from '@/lib/domain/nutrition/format';
import { useTRPC } from '@/lib/trpc/client';

export const searchFailed = 'Foods could not be searched. Try again.';

export const searchPrompt = 'Search foods by name or brand.';

export const noMatches = (query: string) => `No foods match “${query}”.`;

const unknownEnergy = '—';

export const energyPer100g = ({ energyKcal }: FoodSummary) =>
  `${energyKcal === null ? unknownEnergy : formatAmount(energyKcal, 'kcal')} / 100 g`;

const detailsOf = ({ brand, quantityLabel }: FoodSummary) =>
  [brand, quantityLabel].filter((detail) => detail !== null).join(' · ');

export function FoodRow({
  food,
  onSelect,
  action,
}: {
  food: FoodSummary;
  onSelect: () => void;
  action?: ReactNode;
}) {
  const details = detailsOf(food);

  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left hover:bg-muted"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{food.name}</span>
          {details === '' ? null : (
            <span className="truncate text-muted-foreground text-xs">
              {details}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-medium text-sm tabular-nums">
            {energyPer100g(food)}
          </span>
          <SourceBadge source={food.source} />
        </span>
      </button>
      {action}
    </li>
  );
}

export function ResultsSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2 p-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function useWhenVisible(onVisible: () => void) {
  const latest = useRef(onVisible);
  latest.current = onVisible;

  return useCallback((element: HTMLElement | null) => {
    if (element === null || !('IntersectionObserver' in window)) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        latest.current();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
}

export function Message({ children }: { children: string }) {
  return (
    <p className="px-4 py-6 text-center text-muted-foreground text-sm">
      {children}
    </p>
  );
}

export function FoodSearchResults({
  query,
  onSelectFood,
}: {
  query: string;
  onSelectFood: (food: FoodSummary) => void;
}) {
  const trpc = useTRPC();
  const searching = searchTerms(query).length > 0;
  const search = useInfiniteQuery(
    trpc.food.search.infiniteQueryOptions(
      { query },
      {
        enabled: searching,
        getNextPageParam: (page) => page.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const loadMore = () => {
    if (search.hasNextPage && !search.isFetchingNextPage) {
      search.fetchNextPage();
    }
  };
  const sentinel = useWhenVisible(loadMore);

  if (!searching) {
    return <Message>{searchPrompt}</Message>;
  }
  if (search.isPending) {
    return <ResultsSkeleton />;
  }
  if (search.isError) {
    return (
      <div className="p-4">
        <FormError>{searchFailed}</FormError>
      </div>
    );
  }

  const foods = search.data.pages.flatMap((page) => page.foods);
  if (foods.length === 0 && search.isPlaceholderData) {
    return <ResultsSkeleton />;
  }
  if (foods.length === 0) {
    return (
      <div className="flex flex-col gap-1 px-4 py-6 text-center text-muted-foreground text-sm">
        <p>{noMatches(query)}</p>
        <p>Create it as your own food, or quick add what you ate.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y">
        {foods.map((food) => (
          <FoodRow
            key={food.id}
            food={food}
            onSelect={() => onSelectFood(food)}
          />
        ))}
      </ul>
      {search.hasNextPage ? (
        <div key={search.data.pages.length} ref={sentinel} className="p-4">
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={search.isFetchingNextPage}
            onClick={loadMore}
          >
            {search.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
