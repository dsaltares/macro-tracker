'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconPlus, IconStar, IconStarFilled } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useState,
} from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormError, TextField } from '@/components/auth/fields';
import { knownAmountOf, mealNames, saltOf } from '@/components/diary/amounts';
import { Amount } from '@/components/diary/day-totals';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Food } from '@/lib/db/food-search';
import { meals, resolveEntry } from '@/lib/domain/diary/entries';
import {
  maxPortionLabelLength,
  type Portion,
} from '@/lib/domain/foods/portions';
import { formatAmount } from '@/lib/domain/nutrition/format';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { useTRPC } from '@/lib/trpc/client';
import { isConflict } from '@/lib/trpc/failure';
import { cn } from '@/lib/utils';

export const portionTaken = 'This food already has a portion with that label.';

export const addPortionFailed = 'The portion could not be added. Try again.';

export const favouriteFailed = 'The favourite could not be changed. Try again.';

const entrySchema = z.object({
  quantity: z
    .number({ error: 'Enter a quantity' })
    .positive({ error: 'Enter a quantity above zero' }),
  portion: z.string(),
  meal: z.enum(meals),
  time: z.string(),
});

export type EntryValues = z.infer<typeof entrySchema>;

const portionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, { error: 'Enter a label' })
    .max(maxPortionLabelLength, {
      error: `Keep it under ${maxPortionLabelLength} characters`,
    }),
  grams: z
    .number({ error: 'Enter a weight' })
    .positive({ error: 'Enter a weight above zero' }),
});

type PortionValues = z.infer<typeof portionSchema>;

export type LoggedAmount = {
  grams: number | null;
  nutrients: NutrientVector;
};

const noQuantity = 0;

const usableQuantity = (quantity: number) =>
  Number.isFinite(quantity) && quantity > 0 ? quantity : noQuantity;

export function SelectField({
  label,
  className,
  children,
  ...select
}: ComponentProps<'select'> & { label: string }) {
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={cn(
          'h-11 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          className,
        )}
        {...select}
      >
        {children}
      </select>
    </div>
  );
}

export function NutrientPreview({ grams, nutrients }: LoggedAmount) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h4 id={headingId} className="font-medium text-muted-foreground text-xs">
        {grams === null
          ? 'Nutrients'
          : `Nutrients in ${formatAmount(grams, 'g')}`}
      </h4>
      <dl className="grid grid-cols-4 gap-2">
        <Amount
          label="Energy"
          value={knownAmountOf(nutrients, 'energy_kcal')}
        />
        <Amount label="Protein" value={knownAmountOf(nutrients, 'protein')} />
        <Amount
          label="Carbs"
          value={knownAmountOf(nutrients, 'carbohydrate')}
        />
        <Amount label="Fat" value={knownAmountOf(nutrients, 'fat')} />
      </dl>
      <dl className="grid grid-cols-4 gap-2">
        <Amount
          label="Saturates"
          value={knownAmountOf(nutrients, 'saturated_fat')}
        />
        <Amount label="Sugars" value={knownAmountOf(nutrients, 'sugars')} />
        <Amount label="Fibre" value={knownAmountOf(nutrients, 'fibre')} />
        <Amount label="Salt" value={saltOf(nutrients)} />
      </dl>
    </section>
  );
}

function PortionFields({
  foodId,
  onAdded,
  onCancel,
}: {
  foodId: string;
  onAdded: (label: string) => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PortionValues>({
    resolver: zodResolver(portionSchema),
    mode: 'onTouched',
  });
  const add = useMutation(
    trpc.food.addPortion.mutationOptions({
      onSuccess: async ({ label }) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.food.get.queryKey(foodId),
        });
        onAdded(label);
      },
    }),
  );
  const submit = handleSubmit((values) => add.mutate({ foodId, ...values }));
  const submitOnEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-4">
      <legend className="px-1 font-medium text-sm">Add portion</legend>
      {add.isError ? (
        <FormError>
          {isConflict(add.error) ? portionTaken : addPortionFailed}
        </FormError>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Label"
          placeholder="1 slice"
          autoComplete="off"
          error={errors.label?.message}
          onKeyDown={submitOnEnter}
          {...register('label')}
        />
        <TextField
          label="Grams"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          error={errors.grams?.message}
          onKeyDown={submitOnEnter}
          {...register('grams', { valueAsNumber: true })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11"
          disabled={add.isPending}
          onClick={() => void submit()}
        >
          {add.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </fieldset>
  );
}

function PortionAdder({
  foodId,
  onAdded,
}: {
  foodId: string;
  onAdded: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="-ml-2 h-11 self-start"
        onClick={() => setOpen(true)}
      >
        <IconPlus className="size-5" />
        Add portion
      </Button>
    );
  }

  return (
    <PortionFields
      foodId={foodId}
      onAdded={(label) => {
        onAdded(label);
        setOpen(false);
      }}
      onCancel={() => setOpen(false)}
    />
  );
}

function FavouriteToggle({ foodId }: { foodId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const favourites = useQuery(trpc.food.favourites.queryOptions());
  const favourite = favourites.data?.some(({ id }) => id === foodId) ?? false;
  const set = useMutation(
    trpc.food.setFavourite.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.food.favourites.queryKey(),
        }),
    }),
  );
  const Icon = favourite ? IconStarFilled : IconStar;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 self-start"
        aria-pressed={favourite}
        disabled={favourites.isPending || set.isPending}
        onClick={() => set.mutate({ foodId, favourite: !favourite })}
      >
        <Icon className={cn('size-5', favourite && 'text-amber-500')} />
        Favourite
      </Button>
      {set.isError ? <FormError>{favouriteFailed}</FormError> : null}
    </div>
  );
}

export function EntryForm({
  food,
  portions,
  logged,
  defaultValues,
  saving,
  onSave,
  children,
}: {
  food: Food | null;
  portions: readonly Portion[];
  logged?: LoggedAmount;
  defaultValues: EntryValues;
  saving: boolean;
  onSave: (values: EntryValues) => void;
  children?: ReactNode;
}) {
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues,
    mode: 'onTouched',
  });
  const [quantity, portionLabel] = useWatch({
    control,
    name: ['quantity', 'portion'],
  });
  const portion = portions.find(({ label }) => label === portionLabel);
  const amountUnchanged =
    quantity === defaultValues.quantity &&
    portionLabel === defaultValues.portion;
  const preview =
    logged !== undefined && (food === null || amountUnchanged)
      ? logged
      : food !== null && portion !== undefined
        ? resolveEntry(food, portion, usableQuantity(quantity))
        : null;

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      onSubmit={handleSubmit(onSave)}
      noValidate
    >
      {food === null ? null : (
        <div className="flex flex-col gap-1">
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
                  {portions.map(({ label }) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </SelectField>
              )}
            />
          </div>
          <PortionAdder
            foodId={food.id}
            onAdded={(label) => setValue('portion', label)}
          />
        </div>
      )}
      {preview === null ? null : <NutrientPreview {...preview} />}
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
      {food === null ? null : <FavouriteToggle foodId={food.id} />}
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" className="h-11" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        {children}
      </div>
    </form>
  );
}
