'use client';

import { IconBarcode, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { parseAsString, useQueryState } from 'nuqs';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError, TextField } from '@/components/auth/fields';
import { mealNames } from '@/components/diary/amounts';
import { dayLabel } from '@/components/diary/day-navigation';
import {
  energyPer100g,
  FoodRow,
  Message,
  noMatches,
  ResultsSkeleton,
  searchDebounceMs,
  searchFailed,
  searchPrompt,
  useWhenVisible,
} from '@/components/diary/food-search-results';
import {
  AddEntry,
  type FoodHeader,
  headerOf,
} from '@/components/diary/food-step';
import { ScanStep } from '@/components/diary/scan-step';
import { SourceBadge } from '@/components/foods/source-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToday } from '@/components/use-today';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { FoodSummary } from '@/lib/db/food-search';
import { isDate } from '@/lib/domain/dates';
import { mealAtHour } from '@/lib/domain/diary/entries';
import { searchTerms } from '@/lib/domain/foods/search';
import { type DiaryMeal, diaryHref } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';

function SearchResults({
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
    return <FormError>{searchFailed}</FormError>;
  }

  const foods = search.data.pages.flatMap((page) => page.foods);
  if (foods.length === 0) {
    return search.isPlaceholderData ? (
      <ResultsSkeleton />
    ) : (
      <Message>{noMatches(query)}</Message>
    );
  }

  return (
    <div className="flex flex-col">
      <ul className="-mx-4 flex flex-col divide-y">
        {foods.map((food) => (
          <FoodRow
            key={food.id}
            food={food}
            onSelect={() => onSelectFood(food)}
          />
        ))}
      </ul>
      {search.hasNextPage ? (
        <div key={search.data.pages.length} ref={sentinel} className="py-4">
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

const addedMessage = ({ date, meal }: DiaryMeal, today: string) =>
  `Added to ${mealNames[meal].toLowerCase()}, ${dayLabel(date, today)}`;

function AddToDiary({
  food,
  today,
  onAdded,
}: {
  food: FoodHeader;
  today: string;
  onAdded: (added: DiaryMeal) => void;
}) {
  const [date, setDate] = useState(today);
  const [meal] = useState(() => mealAtHour(new Date().getHours()));

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Date"
        type="date"
        required
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      {isDate(date) ? (
        <AddEntry foodId={food.id} date={date} meal={meal} onAdded={onAdded} />
      ) : null}
    </div>
  );
}

function FoodSheet({
  food,
  onClose,
}: {
  food: FoodHeader | null;
  onClose: () => void;
}) {
  const today = useToday();
  const router = useRouter();

  return (
    <Sheet
      open={food !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      {food === null || today === null ? null : (
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] gap-0 rounded-t-xl text-sm md:mx-auto md:max-w-2xl"
        >
          <SheetHeader className="p-4 pr-14">
            <SheetTitle className="text-base">{food.name}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2 tabular-nums">
              {food.brand === null ? null : <span>{food.brand}</span>}
              <span>{energyPer100g(food)}</span>
              <SourceBadge source={food.source} />
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <AddToDiary
              food={food}
              today={today}
              onAdded={(added) => {
                toast.success(addedMessage(added, today), {
                  action: {
                    label: 'View',
                    onClick: () => router.push(diaryHref(added.date)),
                  },
                });
                onClose();
              }}
            />
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}

export function FoodBrowser() {
  const [query, setQuery] = useQueryState('q', parseAsString.withDefault(''));
  const debouncedQuery = useDebouncedValue(query, searchDebounceMs);
  const [chosen, setChosen] = useState<FoodHeader | null>(null);
  const [scanning, setScanning] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {scanning ? (
        <div className="-mx-4">
          <ScanStep
            onBack={() => setScanning(false)}
            onFound={(food) => {
              setScanning(false);
              setChosen(headerOf(food));
            }}
          />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search foods"
                placeholder="Search foods"
                autoComplete="off"
                enterKeyHint="search"
                className="h-11 pl-9 text-base"
                value={query}
                onChange={(event) => setQuery(event.target.value || null)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-11"
              onClick={() => setScanning(true)}
            >
              <IconBarcode className="size-5" />
              <span className="sr-only">Scan a barcode</span>
            </Button>
          </div>
          <SearchResults query={debouncedQuery} onSelectFood={setChosen} />
        </>
      )}
      <FoodSheet food={chosen} onClose={() => setChosen(null)} />
    </div>
  );
}
