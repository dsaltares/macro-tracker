'use client';

import { IconBarcode, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { mealNames } from '@/components/diary/amounts';
import {
  FavouriteFoods,
  FrequentFoods,
  RecentFoods,
} from '@/components/diary/food-lists';
import { FoodSearchResults } from '@/components/diary/food-search-results';
import { FoodStep } from '@/components/diary/food-step';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { FoodSummary } from '@/lib/db/food-search';
import type { Meal } from '@/lib/domain/diary/entries';

export const searchDebounceMs = 300;

const foodLists = [
  {
    value: 'recent',
    label: 'Recent',
    empty: 'Foods you log appear here.',
    List: RecentFoods,
  },
  {
    value: 'frequent',
    label: 'Frequent',
    empty: 'The foods you log most often appear here.',
    List: FrequentFoods,
  },
  {
    value: 'favourites',
    label: 'Favourites',
    empty: 'Foods you mark as favourites appear here.',
    List: FavouriteFoods,
  },
] as const;

type FoodList = (typeof foodLists)[number]['value'] | 'all';

function SearchStep({
  date,
  meal,
  query,
  onQueryChange,
  list,
  onListChange,
  onSelectFood,
}: {
  date: string;
  meal: Meal;
  query: string;
  onQueryChange: (query: string) => void;
  list: FoodList;
  onListChange: (list: FoodList) => void;
  onSelectFood: (food: FoodSummary) => void;
}) {
  const debouncedQuery = useDebouncedValue(query, searchDebounceMs);

  return (
    <>
      <div className="flex items-center gap-2 px-4">
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
            onChange={(event) => {
              onQueryChange(event.target.value);
              if (event.target.value.trim() !== '') {
                onListChange('all');
              }
            }}
          />
        </div>
        <Button variant="outline" size="icon" className="size-11" disabled>
          <IconBarcode className="size-5" />
          <span className="sr-only">Scan a barcode</span>
        </Button>
      </div>
      <Tabs
        value={list}
        onValueChange={onListChange}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList className="mx-4 mb-2 h-9! w-auto">
          {foodLists.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="text-sm">
              {label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="all" className="text-sm">
            All
          </TabsTrigger>
        </TabsList>
        {foodLists.map(({ value, empty, List }) => (
          <TabsContent
            key={value}
            value={value}
            className="min-h-0 overflow-y-auto"
          >
            <List
              date={date}
              meal={meal}
              empty={empty}
              onSelectFood={onSelectFood}
            />
          </TabsContent>
        ))}
        <TabsContent value="all" className="min-h-0 overflow-y-auto">
          <FoodSearchResults
            query={debouncedQuery}
            onSelectFood={onSelectFood}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function FoodSearch({
  date,
  meal,
  onAdded,
}: {
  date: string;
  meal: Meal;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<FoodList>('recent');
  const [chosen, setChosen] = useState<FoodSummary | null>(null);

  if (chosen !== null) {
    return (
      <FoodStep
        food={chosen}
        date={date}
        meal={meal}
        onBack={() => setChosen(null)}
        onAdded={onAdded}
      />
    );
  }

  return (
    <>
      <SearchStep
        date={date}
        meal={meal}
        query={query}
        onQueryChange={setQuery}
        list={list}
        onListChange={setList}
        onSelectFood={setChosen}
      />
      <div className="grid grid-cols-2 gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="outline" size="lg" className="h-11" disabled>
          Create food
        </Button>
        <Button variant="outline" size="lg" className="h-11" disabled>
          Quick add
        </Button>
      </div>
    </>
  );
}

export function FoodSearchSheet({
  date,
  meal,
  onClose,
}: {
  date: string;
  meal: Meal | null;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={meal !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      {meal === null ? null : (
        <SheetContent
          side="bottom"
          className="gap-0 rounded-t-xl text-sm data-[side=bottom]:h-[90dvh] md:mx-auto md:max-w-2xl"
        >
          <SheetHeader className="p-4 pr-14">
            <SheetTitle className="text-base">
              Add to {mealNames[meal].toLowerCase()}
            </SheetTitle>
          </SheetHeader>
          <FoodSearch date={date} meal={meal} onAdded={onClose} />
        </SheetContent>
      )}
    </Sheet>
  );
}
