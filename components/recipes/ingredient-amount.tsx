'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { skipToken, useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormError, TextField } from '@/components/auth/fields';
import { NutrientPreview, SelectField } from '@/components/diary/entry-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { IngredientRef } from '@/lib/db/recipes';
import { resolveEntry } from '@/lib/domain/diary/entries';
import type { Portion } from '@/lib/domain/foods/portions';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { useTRPC } from '@/lib/trpc/client';

export const ingredientLoadFailed = 'This ingredient could not be loaded.';

const amountSchema = z.object({
  quantity: z
    .number({ error: 'Enter a quantity' })
    .positive({ error: 'Enter a quantity above zero' }),
  portion: z.string(),
});

export type AmountValues = z.infer<typeof amountSchema>;

export type IngredientSource = {
  nutrients: NutrientVector;
  portions: readonly Portion[];
};

export function useIngredientSource(ref: IngredientRef) {
  const trpc = useTRPC();
  const food = useQuery(
    trpc.food.get.queryOptions(ref.kind === 'food' ? ref.foodId : skipToken),
  );
  const recipe = useQuery(
    trpc.recipe.get.queryOptions(
      ref.kind === 'recipe' ? ref.recipeId : skipToken,
    ),
  );
  if (ref.kind === 'food') {
    return {
      isPending: food.isPending,
      isError: food.isError,
      source: food.data,
    };
  }
  return {
    isPending: recipe.isPending,
    isError: recipe.isError,
    source:
      recipe.data === undefined
        ? undefined
        : {
            nutrients: recipe.data.nutrients.per100g,
            portions: recipe.data.portions,
          },
  };
}

export function AmountSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

const noQuantity = 0;

const usableQuantity = (quantity: number) =>
  Number.isFinite(quantity) && quantity > 0 ? quantity : noQuantity;

export function IngredientAmountForm({
  source,
  defaultValues,
  submit,
  saving,
  failure,
  onSave,
}: {
  source: IngredientSource;
  defaultValues: AmountValues;
  submit: string;
  saving: boolean;
  failure: string | null;
  onSave: (values: AmountValues) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AmountValues>({
    resolver: zodResolver(amountSchema),
    defaultValues,
    mode: 'onTouched',
  });
  const [quantity, portionLabel] = useWatch({
    control,
    name: ['quantity', 'portion'],
  });
  const portion = source.portions.find(({ label }) => label === portionLabel);

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      onSubmit={handleSubmit(onSave)}
      noValidate
    >
      {failure === null ? null : <FormError>{failure}</FormError>}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Quantity"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          error={errors.quantity?.message}
          {...register('quantity', { valueAsNumber: true })}
        />
        <Controller
          control={control}
          name="portion"
          render={({ field }) => (
            <SelectField label="Portion" {...field}>
              {source.portions.map(({ label }) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </SelectField>
          )}
        />
      </div>
      {portion === undefined ? null : (
        <NutrientPreview
          {...resolveEntry(source, portion, usableQuantity(quantity))}
        />
      )}
      <Button type="submit" size="lg" className="h-11" disabled={saving}>
        {saving ? 'Saving…' : submit}
      </Button>
    </form>
  );
}
