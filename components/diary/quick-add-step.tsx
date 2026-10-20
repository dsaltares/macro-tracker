'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ComponentProps, useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormError, TextField } from '@/components/auth/fields';
import { mealNames } from '@/components/diary/amounts';
import { NutrientPreview, SelectField } from '@/components/diary/entry-form';
import { addFailed } from '@/components/diary/food-step';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  type Meal,
  maxEntryLabelLength,
  meals,
  type QuickEntryNutrients,
  quickEntryNutrients,
} from '@/lib/domain/diary/entries';
import type { NutrientVector } from '@/lib/domain/nutrition/vector';
import { useTRPC } from '@/lib/trpc/client';

export const enterAnAmount = 'Enter the energy or a macro';

const bases = [
  { value: 'per100g', label: 'Per 100 g' },
  { value: 'totals', label: 'Totals' },
] as const;

type Basis = (typeof bases)[number]['value'];

const amount = z
  .number({ error: 'Enter a number' })
  .nonnegative({ error: 'Enter zero or more' })
  .optional();

const macroFields = ['protein', 'fat', 'carbohydrate'] as const;

const quickAddSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, { error: 'Enter a label' })
      .max(maxEntryLabelLength, {
        error: `Keep it under ${maxEntryLabelLength} characters`,
      }),
    basis: z.enum(['per100g', 'totals']),
    energy: amount,
    protein: amount,
    fat: amount,
    carbohydrate: amount,
    grams: amount,
    meal: z.enum(meals),
    time: z.string(),
    saveAsFood: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.basis === 'totals') {
      if (
        values.energy === undefined &&
        macroFields.every((key) => values[key] === undefined)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['energy'],
          message: enterAnAmount,
        });
      }
      return;
    }
    for (const key of macroFields) {
      if (values[key] === undefined) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Enter an amount',
        });
      }
    }
    if (values.grams === undefined || values.grams === 0) {
      context.addIssue({
        code: 'custom',
        path: ['grams'],
        message: 'Enter the grams eaten',
      });
    }
  });

type QuickAddInput = z.input<typeof quickAddSchema>;

type QuickAddValues = z.output<typeof quickAddSchema>;

type TypedAmounts = Pick<
  QuickAddInput,
  'basis' | 'energy' | 'protein' | 'fat' | 'carbohydrate' | 'grams'
>;

const optionalNumber = (value: string) =>
  value === '' ? undefined : Number(value);

const usable = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) ? value : undefined;

const typedNutrients = ({
  energy,
  protein,
  fat,
  carbohydrate,
}: TypedAmounts): NutrientVector =>
  Object.fromEntries(
    Object.entries({ energy_kcal: energy, protein, fat, carbohydrate }).filter(
      ([, value]) => usable(value) !== undefined,
    ),
  );

const quickNutrients = (amounts: TypedAmounts): QuickEntryNutrients =>
  amounts.basis === 'totals'
    ? { totals: typedNutrients(amounts) }
    : { per100g: typedNutrients(amounts), grams: usable(amounts.grams) ?? 0 };

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

function QuickAddForm({
  label,
  date,
  meal,
  onAdded,
}: {
  label: string;
  date: string;
  meal: Meal;
  onAdded: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const saveAsFoodId = useId();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<QuickAddInput, unknown, QuickAddValues>({
    resolver: zodResolver(quickAddSchema),
    defaultValues: {
      label,
      basis: 'per100g',
      meal,
      time: '',
      saveAsFood: false,
    },
    mode: 'onTouched',
  });
  const [basis, energy, protein, fat, carbohydrate, grams] = useWatch({
    control,
    name: ['basis', 'energy', 'protein', 'fat', 'carbohydrate', 'grams'],
  });
  const typed = { basis, energy, protein, fat, carbohydrate, grams };
  const perHundredGrams = basis === 'per100g';
  const add = useMutation(
    trpc.diary.addQuick.mutationOptions({
      onSuccess: async (_entry, { saveAsFood }) => {
        await queryClient.invalidateQueries({
          queryKey: trpc.diary.day.queryKey(),
        });
        if (saveAsFood) {
          await queryClient.invalidateQueries({
            queryKey: trpc.food.pathKey(),
          });
        }
        onAdded();
      },
    }),
  );
  const amountField = (
    name: 'energy' | 'protein' | 'fat' | 'carbohydrate' | 'grams',
  ) => ({
    error: errors[name]?.message,
    ...register(name, { setValueAs: optionalNumber }),
  });

  return (
    <form
      className="flex flex-col gap-4"
      method="post"
      noValidate
      onSubmit={handleSubmit((values) =>
        add.mutate({
          date,
          meal: values.meal,
          label: values.label,
          time: values.time === '' ? null : values.time,
          nutrients: quickNutrients(values),
          saveAsFood: values.basis === 'per100g' && values.saveAsFood,
        }),
      )}
    >
      {add.isError ? <FormError>{addFailed}</FormError> : null}
      <TextField
        label="Label"
        autoComplete="off"
        error={errors.label?.message}
        {...register('label')}
      />
      <Controller
        control={control}
        name="basis"
        render={({ field }) => (
          <ToggleGroup
            aria-label="Amounts"
            variant="outline"
            spacing={0}
            className="w-full"
            value={[field.value]}
            onValueChange={([value]) => {
              if (value !== undefined) {
                field.onChange(value as Basis);
              }
            }}
          >
            {bases.map(({ value, label }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-11 flex-1 text-sm"
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      />
      {perHundredGrams ? (
        <div className="grid grid-cols-2 gap-x-3">
          <AmountField label="Protein (g)" {...amountField('protein')} />
          <AmountField label="Fat (g)" {...amountField('fat')} />
          <AmountField label="Carbs (g)" {...amountField('carbohydrate')} />
          <AmountField
            label="Energy (kcal)"
            hint="Optional"
            {...amountField('energy')}
          />
          <AmountField label="Grams eaten" {...amountField('grams')} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3">
          <AmountField label="Energy (kcal)" {...amountField('energy')} />
          <AmountField label="Protein (g)" {...amountField('protein')} />
          <AmountField label="Fat (g)" {...amountField('fat')} />
          <AmountField label="Carbs (g)" {...amountField('carbohydrate')} />
        </div>
      )}
      <NutrientPreview
        grams={perHundredGrams ? (usable(grams) ?? 0) : null}
        nutrients={quickEntryNutrients(quickNutrients(typed))}
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
      {perHundredGrams ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={saveAsFoodId}>Save as my food</Label>
            <p className="text-muted-foreground text-xs">
              Find it in search next time.
            </p>
          </div>
          <Controller
            control={control}
            name="saveAsFood"
            render={({ field }) => (
              <Switch
                id={saveAsFoodId}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
      ) : null}
      <Button type="submit" size="lg" className="h-11" disabled={add.isPending}>
        {add.isPending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}

export function QuickAddStep({
  label,
  date,
  meal,
  onBack,
  onAdded,
}: {
  label: string;
  date: string;
  meal: Meal;
  onBack: () => void;
  onAdded: () => void;
}) {
  return (
    <section
      aria-label="Quick add"
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
      <QuickAddForm label={label} date={date} meal={meal} onAdded={onAdded} />
    </section>
  );
}
