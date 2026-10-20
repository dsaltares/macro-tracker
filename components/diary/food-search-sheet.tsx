'use client';

import { IconArrowLeft, IconBarcode, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { FormError } from '@/components/auth/fields';
import { mealNames } from '@/components/diary/amounts';
import {
  FavouriteFoods,
  FrequentFoods,
  RecentFoods,
} from '@/components/diary/food-lists';
import { FoodSearchResults } from '@/components/diary/food-search-results';
import {
  type FoodHeader,
  FoodStep,
  foodLoadFailed,
} from '@/components/diary/food-step';
import { QuickAddStep } from '@/components/diary/quick-add-step';
import { RecipeList, RecipeStep } from '@/components/diary/recipe-step';
import { ScanStep } from '@/components/diary/scan-step';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { Food, FoodSummary } from '@/lib/db/food-search';
import type { RecipeSummary } from '@/lib/db/recipes';
import type { Meal } from '@/lib/domain/diary/entries';
import { newFoodHref } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

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

type FoodList = (typeof foodLists)[number]['value'] | 'all' | 'recipes';

function SearchStep({
  date,
  meal,
  query,
  onQueryChange,
  list,
  onListChange,
  onSelectFood,
  onSelectRecipe,
  onScan,
}: {
  date: string;
  meal: Meal;
  query: string;
  onQueryChange: (query: string) => void;
  list: FoodList;
  onListChange: (list: FoodList) => void;
  onSelectFood: (food: FoodSummary) => void;
  onSelectRecipe: (recipe: RecipeSummary) => void;
  onScan: () => void;
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
              if (event.target.value.trim() !== '' && list !== 'recipes') {
                onListChange('all');
              }
            }}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11"
          onClick={onScan}
        >
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
          <TabsTrigger value="recipes" className="text-sm">
            Recipes
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
        <TabsContent value="recipes" className="min-h-0 overflow-y-auto">
          <RecipeList query={query} onSelectRecipe={onSelectRecipe} />
        </TabsContent>
      </Tabs>
    </>
  );
}

const headerOf = ({
  id,
  name,
  brand,
  source,
  nutrients,
}: Food): FoodHeader => ({
  id,
  name,
  brand,
  source,
  energyKcal: nutrients.energy_kcal ?? null,
});

function CreatedFoodStep({
  foodId,
  date,
  meal,
  onBack,
  onAdded,
}: {
  foodId: string;
  date: string;
  meal: Meal;
  onBack: () => void;
  onAdded: () => void;
}) {
  const trpc = useTRPC();
  const food = useQuery(trpc.food.get.queryOptions(foodId, { retry: false }));

  if (food.isSuccess) {
    return (
      <FoodStep
        food={headerOf(food.data)}
        date={date}
        meal={meal}
        onBack={onBack}
        onAdded={onAdded}
      />
    );
  }
  return (
    <section className="flex flex-col gap-3 px-4">
      <Button
        variant="ghost"
        className="-ml-2 h-11 self-start"
        onClick={onBack}
      >
        <IconArrowLeft className="size-5" />
        Back to search
      </Button>
      {food.isError ? (
        <FormError>{foodLoadFailed}</FormError>
      ) : (
        <div role="status" aria-label="Loading" className="flex flex-col gap-4">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      )}
    </section>
  );
}

function FoodSearch({
  date,
  meal,
  createdFoodId,
  onAdded,
}: {
  date: string;
  meal: Meal;
  createdFoodId: string | null;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<FoodList>('recent');
  const [scanning, setScanning] = useState(false);
  const [chosen, setChosen] = useState<FoodHeader | null>(null);
  const [chosenRecipe, setChosenRecipe] = useState<RecipeSummary | null>(null);
  const [created, setCreated] = useState(createdFoodId);
  const [quickAdding, setQuickAdding] = useState(false);

  if (created !== null) {
    return (
      <CreatedFoodStep
        foodId={created}
        date={date}
        meal={meal}
        onBack={() => setCreated(null)}
        onAdded={onAdded}
      />
    );
  }

  if (quickAdding) {
    return (
      <QuickAddStep
        label={query.trim()}
        date={date}
        meal={meal}
        onBack={() => setQuickAdding(false)}
        onAdded={onAdded}
      />
    );
  }
  if (chosenRecipe !== null) {
    return (
      <RecipeStep
        recipe={chosenRecipe}
        date={date}
        meal={meal}
        onBack={() => setChosenRecipe(null)}
        onAdded={onAdded}
      />
    );
  }
  if (chosen !== null) {
    return (
      <FoodStep
        food={chosen}
        date={date}
        meal={meal}
        onBack={() => {
          setChosen(null);
          setScanning(false);
        }}
        onAdded={onAdded}
      />
    );
  }

  if (scanning) {
    return (
      <ScanStep
        diary={{ date, meal }}
        onBack={() => setScanning(false)}
        onFound={(food) => setChosen(headerOf(food))}
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
        onSelectRecipe={setChosenRecipe}
        onScan={() => setScanning(true)}
      />
      <div className="grid grid-cols-2 gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link
          href={newFoodHref({ diary: { date, meal } })}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'lg' }),
            'h-11',
          )}
        >
          Create food
        </Link>
        <Button
          variant="outline"
          size="lg"
          className="h-11"
          onClick={() => setQuickAdding(true)}
        >
          Quick add
        </Button>
      </div>
    </>
  );
}

export function FoodSearchSheet({
  date,
  meal,
  createdFoodId = null,
  onClose,
}: {
  date: string;
  meal: Meal | null;
  createdFoodId?: string | null;
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
          <FoodSearch
            date={date}
            meal={meal}
            createdFoodId={createdFoodId}
            onAdded={onClose}
          />
        </SheetContent>
      )}
    </Sheet>
  );
}
