'use client';

import { IconArrowLeft, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/components/auth/fields';
import {
  FoodSearchResults,
  foodRowClass,
  Message,
  ResultsSkeleton,
  searchDebounceMs,
} from '@/components/diary/food-search-results';
import {
  AmountSkeleton,
  IngredientAmountForm,
  ingredientLoadFailed,
  useIngredientSource,
} from '@/components/recipes/ingredient-amount';
import {
  noRecipeMatches,
  RecipeRowContent,
  recipeMatches,
  recipesFailed,
} from '@/components/recipes/recipes';
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
import type { IngredientRef } from '@/lib/db/recipes';
import { defaultPortion } from '@/lib/domain/foods/portions';
import { useTRPC } from '@/lib/trpc/client';
import { failureOf } from '@/lib/trpc/failure';

export const noOtherRecipes = 'Your other recipes appear here.';

type Chosen = { ref: IngredientRef; name: string };

type IngredientList = 'foods' | 'recipes';

const defaultQuantity = 1;

function RecipeChoices({
  recipeId,
  query,
  onChoose,
}: {
  recipeId: string;
  query: string;
  onChoose: (chosen: Chosen) => void;
}) {
  const trpc = useTRPC();
  const recipes = useQuery(trpc.recipe.list.queryOptions());

  if (recipes.isPending) {
    return <ResultsSkeleton />;
  }
  if (recipes.isError) {
    return (
      <div className="p-4">
        <FormError>{recipesFailed}</FormError>
      </div>
    );
  }

  const others = recipes.data.filter(({ id }) => id !== recipeId);
  const matching = others.filter(({ name }) => recipeMatches(name, query));
  if (matching.length === 0) {
    return (
      <Message>
        {others.length === 0 ? noOtherRecipes : noRecipeMatches(query.trim())}
      </Message>
    );
  }

  return (
    <ul className="flex flex-col divide-y">
      {matching.map((recipe) => (
        <li key={recipe.id}>
          <button
            type="button"
            className={foodRowClass}
            onClick={() =>
              onChoose({
                ref: { kind: 'recipe', recipeId: recipe.id },
                name: recipe.name,
              })
            }
          >
            <RecipeRowContent recipe={recipe} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChooseStep({
  recipeId,
  onChoose,
}: {
  recipeId: string;
  onChoose: (chosen: Chosen) => void;
}) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<IngredientList>('foods');
  const debouncedQuery = useDebouncedValue(query, searchDebounceMs);

  return (
    <>
      <div className="relative px-4">
        <IconSearch className="pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search ingredients"
          placeholder="Search ingredients"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 pl-9 text-base"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <Tabs
        value={list}
        onValueChange={setList}
        className="mt-2 min-h-0 flex-1 gap-0"
      >
        <TabsList className="mx-4 mb-2 h-9! w-auto">
          <TabsTrigger value="foods" className="text-sm">
            Foods
          </TabsTrigger>
          <TabsTrigger value="recipes" className="text-sm">
            Recipes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="foods" className="flex min-h-0 flex-col">
          <FoodSearchResults
            query={debouncedQuery}
            onSelectFood={(food) =>
              onChoose({
                ref: { kind: 'food', foodId: food.id },
                name: food.name,
              })
            }
          />
        </TabsContent>
        <TabsContent value="recipes" className="min-h-0 overflow-y-auto">
          <RecipeChoices
            recipeId={recipeId}
            query={query}
            onChoose={onChoose}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function AmountStep({
  recipeId,
  chosen,
  onBack,
  onAdded,
}: {
  recipeId: string;
  chosen: Chosen;
  onBack: () => void;
  onAdded: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isPending, isError, source } = useIngredientSource(chosen.ref);
  const add = useMutation(
    trpc.recipe.addIngredient.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.recipe.pathKey(),
        });
        onAdded();
      },
    }),
  );

  return (
    <section
      aria-label={chosen.name}
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
      <h3 className="font-semibold text-base">{chosen.name}</h3>
      {isPending ? (
        <AmountSkeleton />
      ) : isError || source === undefined ? (
        <FormError>{ingredientLoadFailed}</FormError>
      ) : (
        <IngredientAmountForm
          source={source}
          defaultValues={{
            quantity: defaultQuantity,
            portion: defaultPortion(source.portions).label,
          }}
          submit="Add to recipe"
          saving={add.isPending}
          failure={add.isError ? failureOf(add.error) : null}
          onSave={({ quantity, portion }) =>
            add.mutate({
              recipeId,
              ingredient: chosen.ref,
              portion,
              quantity,
            })
          }
        />
      )}
    </section>
  );
}

function AddIngredient({
  recipeId,
  onAdded,
}: {
  recipeId: string;
  onAdded: () => void;
}) {
  const [chosen, setChosen] = useState<Chosen | null>(null);

  if (chosen !== null) {
    return (
      <AmountStep
        recipeId={recipeId}
        chosen={chosen}
        onBack={() => setChosen(null)}
        onAdded={onAdded}
      />
    );
  }
  return <ChooseStep recipeId={recipeId} onChoose={setChosen} />;
}

export function IngredientSheet({
  recipeId,
  open,
  onClose,
}: {
  recipeId: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      {open ? (
        <SheetContent
          side="bottom"
          className="gap-0 rounded-t-xl text-sm data-[side=bottom]:h-[90dvh] md:mx-auto md:max-w-2xl"
        >
          <SheetHeader className="p-4 pr-14">
            <SheetTitle className="text-base">Add ingredient</SheetTitle>
          </SheetHeader>
          <AddIngredient recipeId={recipeId} onAdded={onClose} />
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
