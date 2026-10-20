'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowLeft, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormError, TextField } from '@/components/auth/fields';
import { EntryForm, NutrientPreview } from '@/components/diary/entry-form';
import {
  FoodSearchResults,
  searchDebounceMs,
} from '@/components/diary/food-search-results';
import { foodLoadFailed } from '@/components/diary/food-step';
import { enterAnAmount } from '@/components/diary/quick-add-step';
import {
  emptyRecipe,
  RecipeList,
  recipeLoadFailed,
} from '@/components/diary/recipe-step';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { Food, FoodSummary } from '@/lib/db/food-search';
import type { RecipeDetail, RecipeSummary } from '@/lib/db/recipes';
import {
  maxEntryLabelLength,
  quickEntryNutrients,
} from '@/lib/domain/diary/entries';
import {
  checkedByUser,
  type FoodToDraft,
  foodDraftItem,
  guessDraftItem,
  type MealDraftItem,
  recipeDraftItem,
} from '@/lib/domain/diary/meal-estimate';
import {
  defaultPortion,
  oneGram,
  type Portion,
} from '@/lib/domain/foods/portions';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { servingLabel } from '@/lib/domain/recipes/recipes';
import { useTRPC } from '@/lib/trpc/client';

export type ChosenSource =
  | { kind: 'food'; id: string; name: string }
  | { kind: 'recipe'; id: string; name: string };

export const foodToDraft = ({
  id,
  name,
  nutrients,
  portions,
}: Food): FoodToDraft => ({
  id,
  name,
  nutrients,
  portions,
});

export const recipeToDraft = ({
  id,
  name,
  nutrients,
  portions,
}: RecipeDetail): FoodToDraft => ({
  id,
  name,
  nutrients: nutrients.per100g,
  portions,
});

export const chosenFood = ({ id, name }: FoodSummary): ChosenSource => ({
  kind: 'food',
  id,
  name,
});

export const chosenRecipe = ({ id, name }: RecipeSummary): ChosenSource => ({
  kind: 'recipe',
  id,
  name,
});

const defaultQuantity = 1;

export function StepSection({
  label,
  back,
  onBack,
  children,
}: {
  label: string;
  back: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <Button
        variant="ghost"
        className="-ml-2 h-11 self-start"
        onClick={onBack}
      >
        <IconArrowLeft className="size-5" />
        {back}
      </Button>
      {children}
    </section>
  );
}

function LoadingAmount() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

const placeholderMeal = 'breakfast';

function FoodAmountForm({
  food,
  item,
  onSave,
}: {
  food: Food;
  item: Extract<MealDraftItem, { kind: 'food' }> | null;
  onSave: (item: MealDraftItem) => void;
}) {
  return (
    <EntryForm
      source={food}
      foodId={food.id}
      portions={food.portions}
      amountOnly
      defaultValues={{
        quantity: item?.quantity ?? defaultQuantity,
        portion: item?.portionLabel ?? defaultPortion(food.portions).label,
        meal: placeholderMeal,
        time: '',
      }}
      saving={false}
      onSave={({ quantity, portion }) => {
        const chosen = food.portions.find(({ label }) => label === portion);
        if (chosen !== undefined) {
          onSave(
            foodDraftItem(
              foodToDraft(food),
              chosen,
              quantity,
              checkedByUser(item),
            ),
          );
        }
      }}
    />
  );
}

const recipeAmountOf = (portion: Portion, quantity: number) =>
  portion.label === servingLabel
    ? { servings: quantity }
    : { grams: portion.grams * quantity };

function RecipeAmountForm({
  recipe,
  item,
  onSave,
}: {
  recipe: RecipeDetail;
  item: Extract<MealDraftItem, { kind: 'recipe' }> | null;
  onSave: (item: MealDraftItem) => void;
}) {
  const portions = [...recipe.portions, oneGram];
  const amount = item?.amount ?? { servings: defaultQuantity };
  const [portion, quantity] =
    'servings' in amount
      ? [servingLabel, amount.servings]
      : [oneGram.label, amount.grams];

  if (recipe.ingredients.length === 0) {
    return <FormError>{emptyRecipe}</FormError>;
  }
  return (
    <EntryForm
      source={{ nutrients: recipe.nutrients.per100g }}
      portions={portions}
      amountOnly
      defaultValues={{ quantity, portion, meal: placeholderMeal, time: '' }}
      saving={false}
      onSave={({ quantity, portion }) => {
        const chosen = portions.find(({ label }) => label === portion);
        if (chosen !== undefined) {
          onSave(
            recipeDraftItem(
              recipeToDraft(recipe),
              recipeAmountOf(chosen, quantity),
              checkedByUser(item),
            ),
          );
        }
      }}
    />
  );
}

export function FoodAmount({
  foodId,
  item,
  onSave,
}: {
  foodId: string;
  item: Extract<MealDraftItem, { kind: 'food' }> | null;
  onSave: (item: MealDraftItem) => void;
}) {
  const trpc = useTRPC();
  const food = useQuery(trpc.food.get.queryOptions(foodId));

  if (food.isPending) {
    return <LoadingAmount />;
  }
  if (food.isError) {
    return <FormError>{foodLoadFailed}</FormError>;
  }
  return <FoodAmountForm food={food.data} item={item} onSave={onSave} />;
}

export function RecipeAmount({
  recipeId,
  item,
  onSave,
}: {
  recipeId: string;
  item: Extract<MealDraftItem, { kind: 'recipe' }> | null;
  onSave: (item: MealDraftItem) => void;
}) {
  const trpc = useTRPC();
  const recipe = useQuery(trpc.recipe.get.queryOptions(recipeId));

  if (recipe.isPending) {
    return <LoadingAmount />;
  }
  if (recipe.isError) {
    return <FormError>{recipeLoadFailed}</FormError>;
  }
  return <RecipeAmountForm recipe={recipe.data} item={item} onSave={onSave} />;
}

const amount = z
  .number({ error: 'Enter a number' })
  .nonnegative({ error: 'Enter zero or more' })
  .optional();

const guessMacros = ['protein', 'carbohydrate', 'fat'] as const;

const guessSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Enter a name' })
      .max(maxEntryLabelLength, {
        error: `Keep it under ${maxEntryLabelLength} characters`,
      }),
    grams: z
      .number({ error: 'Enter the grams' })
      .positive({ error: 'Enter the grams' }),
    energy: amount,
    protein: amount,
    carbohydrate: amount,
    fat: amount,
  })
  .superRefine((values, context) => {
    if (
      values.energy === undefined &&
      guessMacros.every((key) => values[key] === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['energy'],
        message: enterAnAmount,
      });
    }
  });

type GuessInput = z.input<typeof guessSchema>;

type GuessValues = z.output<typeof guessSchema>;

type GuessAmounts = Pick<
  GuessInput,
  'energy' | 'protein' | 'carbohydrate' | 'fat'
>;

const optionalNumber = (value: string) =>
  value === '' ? undefined : Number(value);

const guessedNutrients = ({
  energy,
  protein,
  carbohydrate,
  fat,
}: GuessAmounts): NutrientVector =>
  Object.fromEntries(
    Object.entries({ energy_kcal: energy, protein, carbohydrate, fat }).filter(
      (entry): entry is [string, number] =>
        entry[1] !== undefined && Number.isFinite(entry[1]),
    ),
  );

function AmountField(props: ComponentProps<typeof TextField>) {
  return (
    <TextField
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      {...props}
    />
  );
}

export function GuessAmountForm({
  item,
  onSave,
}: {
  item: Extract<MealDraftItem, { kind: 'guess' }>;
  onSave: (item: MealDraftItem) => void;
}) {
  const { nutrients } = item;
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<GuessInput, unknown, GuessValues>({
    resolver: zodResolver(guessSchema),
    defaultValues: {
      name: item.name,
      grams: item.grams,
      energy: nutrients.energy_kcal,
      protein: nutrients.protein,
      carbohydrate: nutrients.carbohydrate,
      fat: nutrients.fat,
    },
    mode: 'onTouched',
  });
  const [energy, protein, carbohydrate, fat, grams] = useWatch({
    control,
    name: ['energy', 'protein', 'carbohydrate', 'fat', 'grams'],
  });
  const amountField = (
    name: 'energy' | 'protein' | 'carbohydrate' | 'fat',
  ) => ({
    error: errors[name]?.message,
    ...register(name, { setValueAs: optionalNumber }),
  });

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      noValidate
      onSubmit={handleSubmit(({ name, grams, ...amounts }) =>
        onSave(
          guessDraftItem(
            { name, grams, nutrients: guessedNutrients(amounts) },
            checkedByUser(item),
          ),
        ),
      )}
    >
      <TextField
        label="Name"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <div className="grid grid-cols-2 gap-x-3">
        <AmountField
          label="Grams"
          error={errors.grams?.message}
          {...register('grams', { setValueAs: optionalNumber })}
        />
        <AmountField label="Energy (kcal)" {...amountField('energy')} />
        <AmountField label="Protein (g)" {...amountField('protein')} />
        <AmountField label="Carbs (g)" {...amountField('carbohydrate')} />
        <AmountField label="Fat (g)" {...amountField('fat')} />
      </div>
      <NutrientPreview
        grams={grams !== undefined && Number.isFinite(grams) ? grams : null}
        nutrients={quickEntryNutrients({
          totals: guessedNutrients({ energy, protein, carbohydrate, fat }),
        })}
      />
      <Button type="submit" size="lg" className="h-11">
        Save
      </Button>
    </form>
  );
}

type SourceList = 'foods' | 'recipes';

export function SourceSearch({
  label,
  initialQuery,
  back,
  onBack,
  onChoose,
}: {
  label: string;
  initialQuery: string;
  back: string;
  onBack: () => void;
  onChoose: (chosen: ChosenSource) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [list, setList] = useState<SourceList>('foods');
  const debouncedQuery = useDebouncedValue(query, searchDebounceMs);

  return (
    <>
      <div className="px-4">
        <Button variant="ghost" className="-ml-2 h-11" onClick={onBack}>
          <IconArrowLeft className="size-5" />
          {back}
        </Button>
      </div>
      <div className="relative px-4">
        <IconSearch className="pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={label}
          placeholder={label}
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
            onSelectFood={(food) => onChoose(chosenFood(food))}
          />
        </TabsContent>
        <TabsContent value="recipes" className="min-h-0 overflow-y-auto">
          <RecipeList
            query={query}
            onSelectRecipe={(recipe) => onChoose(chosenRecipe(recipe))}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
