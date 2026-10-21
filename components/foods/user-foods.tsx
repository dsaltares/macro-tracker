'use client';

import { IconArchive, IconPlus, IconSearch } from '@tabler/icons-react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/auth/fields';
import {
  FoodRowContent,
  foodRowClass,
  ResultsSkeleton,
  searchDebounceMs,
  useWhenVisible,
} from '@/components/diary/food-search-results';
import { ArchiveFoodDialog } from '@/components/foods/archive-food-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { FoodSummary } from '@/lib/db/food-search';
import { searchTerms } from '@/lib/domain/foods/search';
import { foodRoute, routes } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

export const loadFailed = 'Your foods could not be loaded. Try again.';

export const noFoodsYet =
  'Foods you create appear here, and above every other food in search.';

export const archived = (name: string) => `Archived ${name}`;

export const noOwnMatches = (query: string) =>
  `None of your foods match “${query}”.`;

function Message({ children }: { children: string }) {
  return (
    <p className="px-4 py-6 text-center text-muted-foreground text-sm">
      {children}
    </p>
  );
}

function FoodList({ query }: { query: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [archiving, setArchiving] = useState<FoodSummary | null>(null);
  const foods = useInfiniteQuery(
    trpc.food.mine.infiniteQueryOptions(
      { query },
      {
        getNextPageParam: (page) => page.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const loadMore = () => {
    if (foods.hasNextPage && !foods.isFetchingNextPage) {
      foods.fetchNextPage();
    }
  };
  const sentinel = useWhenVisible(loadMore);

  if (foods.isPending) {
    return <ResultsSkeleton />;
  }
  if (foods.isError) {
    return <FormError>{loadFailed}</FormError>;
  }

  const listed = foods.data.pages.flatMap((page) => page.foods);
  if (listed.length === 0) {
    return (
      <Message>
        {searchTerms(query).length === 0 ? noFoodsYet : noOwnMatches(query)}
      </Message>
    );
  }

  return (
    <div className="flex flex-col">
      <ul className="-mx-4 flex flex-col divide-y">
        {listed.map((food) => (
          <li key={food.id} className="flex items-center">
            <Link
              href={foodRoute(food.id)}
              className={cn(foodRowClass, 'min-w-0 flex-1')}
            >
              <FoodRowContent food={food} />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="mr-2 size-11 shrink-0 text-muted-foreground"
              onClick={() => setArchiving(food)}
            >
              <IconArchive className="size-5" />
              <span className="sr-only">Archive {food.name}</span>
            </Button>
          </li>
        ))}
      </ul>
      {archiving === null ? null : (
        <ArchiveFoodDialog
          key={archiving.id}
          food={archiving}
          open
          onOpenChange={(open) => {
            if (!open) {
              setArchiving(null);
            }
          }}
          onArchived={async () => {
            await queryClient.invalidateQueries({
              queryKey: trpc.food.pathKey(),
            });
            toast.success(archived(archiving.name));
            setArchiving(null);
          }}
        />
      )}
      {foods.hasNextPage ? (
        <div key={foods.data.pages.length} ref={sentinel} className="py-4">
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={foods.isFetchingNextPage}
            onClick={loadMore}
          >
            {foods.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function UserFoods() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, searchDebounceMs);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search your foods"
            placeholder="Search your foods"
            autoComplete="off"
            enterKeyHint="search"
            className="h-11 pl-9 text-base"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Link
          href={routes.newFood}
          className={cn(buttonVariants({ size: 'lg' }), 'h-11')}
        >
          <IconPlus className="size-5" />
          New food
        </Link>
      </div>
      <FoodList query={debouncedQuery} />
    </div>
  );
}
