'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormError, TextField } from '@/components/auth/fields';
import { amountOf, mealNames } from '@/components/diary/amounts';
import { NutrientPreview, SelectField } from '@/components/diary/entry-form';
import {
  foodRowClass,
  Message,
  ResultsSkeleton,
} from '@/components/diary/food-search-results';
import { addFailed } from '@/components/diary/food-step';
import {
  noRecipeMatches,
  noRecipesYet,
  RecipeRowContent,
  recipeMatches,
  recipesFailed,
  servingsOf,
} from '@/components/recipes/recipes';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RecipeDetail, RecipeSummary } from '@/lib/db/recipes';
import { type Meal, meals, resolveEntry } from '@/lib/domain/diary/entries';
import { defaultPortion } from '@/lib/domain/foods/portions';
import { recipeRoute } from '@/lib/routes';
import { useTRPC } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

export const recipeLoadFailed = 'This recipe could not be loaded.';

export const emptyRecipe =
  'This recipe has no ingredients yet. Add some before logging it.';

const recipeUnits = ['servings', 'grams'] as const;

const unitNames: Record<(typeof recipeUnits)[number], string> = {
  servings: 'Servings',
  grams: 'Grams',
};

const recipeEntrySchema = z.object({
  amount: z
    .number({ error: 'Enter an amount' })
    .positive({ error: 'Enter an amount above zero' }),
  unit: z.enum(recipeUnits),
  meal: z.enum(meals),
  time: z.string(),
});

type RecipeEntryValues = z.infer<typeof recipeEntrySchema>;

const defaultServings = 1;

const oneGram = { label: '1 g', grams: 1 };

const noAmount = 0;

const usableAmount = (amount: number) =>
  Number.isFinite(amount) && amount > 0 ? amount : noAmount;

export function RecipeList({
  query,
  onSelectRecipe,
}: {
  query: string;
  onSelectRecipe: (recipe: RecipeSummary) => void;
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

  const matching = recipes.data.filter(({ name }) =>
    recipeMatches(name, query),
  );
  if (matching.length === 0) {
    return (
      <Message>
        {recipes.data.length === 0
          ? noRecipesYet
          : noRecipeMatches(query.trim())}
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
            onClick={() => onSelectRecipe(recipe)}
          >
            <RecipeRowContent recipe={recipe} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecipeEntryForm({
  recipe,
  date,
  meal,
  onAdded,
}: {
  recipe: RecipeDetail;
  date: string;
  meal: Meal;
  onAdded: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RecipeEntryValues>({
    resolver: zodResolver(recipeEntrySchema),
    defaultValues: {
      amount: defaultServings,
      unit: 'servings',
      meal,
      time: '',
    },
    mode: 'onTouched',
  });
  const [amount, unit] = useWatch({ control, name: ['amount', 'unit'] });
  const add = useMutation(
    trpc.diary.addRecipe.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.diary.day.queryKey(),
        });
        onAdded();
      },
    }),
  );
  const portion =
    unit === 'servings' ? defaultPortion(recipe.portions) : oneGram;

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      noValidate
      onSubmit={handleSubmit(({ amount, unit, meal, time }) =>
        add.mutate({
          date,
          meal,
          recipeId: recipe.id,
          ...(unit === 'servings' ? { servings: amount } : { grams: amount }),
          time: time === '' ? null : time,
        }),
      )}
    >
      {add.isError ? <FormError>{addFailed}</FormError> : null}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Amount"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          error={errors.amount?.message}
          {...register('amount', { valueAsNumber: true })}
        />
        <SelectField label="Unit" {...register('unit')}>
          {recipeUnits.map((unit) => (
            <option key={unit} value={unit}>
              {unitNames[unit]}
            </option>
          ))}
        </SelectField>
      </div>
      <NutrientPreview
        {...resolveEntry(
          { nutrients: recipe.nutrients.per100g },
          portion,
          usableAmount(amount),
        )}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Meal" {...register('meal')}>
          {meals.map((meal) => (
            <option key={meal} value={meal}>
              {mealNames[meal]}
            </option>
          ))}
        </SelectField>
        <TextField label="Time" type="time" {...register('time')} />
      </div>
      <Button type="submit" size="lg" className="h-11" disabled={add.isPending}>
        {add.isPending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}

function RecipeEntry({
  recipeId,
  date,
  meal,
  onAdded,
}: {
  recipeId: string;
  date: string;
  meal: Meal;
  onAdded: () => void;
}) {
  const trpc = useTRPC();
  const recipe = useQuery(trpc.recipe.get.queryOptions(recipeId));

  if (recipe.isPending) {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }
  if (recipe.isError) {
    return <FormError>{recipeLoadFailed}</FormError>;
  }
  if (recipe.data.ingredients.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">{emptyRecipe}</p>
        <Link
          href={recipeRoute(recipeId)}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'lg' }),
            'h-11',
          )}
        >
          Open recipe
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm tabular-nums">
        {amountOf(recipe.data.nutrients.perServing, 'energy_kcal')} per serving
      </p>
      <RecipeEntryForm
        recipe={recipe.data}
        date={date}
        meal={meal}
        onAdded={onAdded}
      />
    </>
  );
}

export function RecipeStep({
  recipe,
  date,
  meal,
  onBack,
  onAdded,
}: {
  recipe: RecipeSummary;
  date: string;
  meal: Meal;
  onBack: () => void;
  onAdded: () => void;
}) {
  return (
    <section
      aria-label={recipe.name}
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
        <h3 className="font-semibold text-base">{recipe.name}</h3>
        <p className="text-muted-foreground text-sm">{servingsOf(recipe)}</p>
      </div>
      <RecipeEntry
        recipeId={recipe.id}
        date={date}
        meal={meal}
        onAdded={onAdded}
      />
    </section>
  );
}
