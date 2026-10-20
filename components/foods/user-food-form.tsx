'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { IconChevronDown, IconPlus, IconTrash } from '@tabler/icons-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import {
  Controller,
  type FieldPath,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
import { z } from 'zod';
import { submitButtonClass } from '@/components/auth/auth-form';
import { FormError, TextField } from '@/components/auth/fields';
import {
  nutrientGroupNames,
  nutrientNames,
} from '@/components/foods/nutrient-names';
import { type Choice, ChoiceField } from '@/components/profile/choice-field';
import { Button } from '@/components/ui/button';
import type { Food } from '@/lib/db/food-search';
import { normaliseBarcode } from '@/lib/domain/foods/barcode';
import type { LabelFood } from '@/lib/domain/foods/label-reading';
import {
  aboveMaxPer100g,
  invalidBarcode,
  maxBrandLength,
  maxQuantityLabelLength,
  maxUserFoodPortions,
  nutrientsAboveMax,
  per100gOfEntered,
  portionLabelTaken,
  roundEntered,
  roundedVector,
  takenPortionLabels,
  type UserFoodPortion,
  userFoodPortionSchema,
  userFoodSchema,
} from '@/lib/domain/foods/user-food';
import {
  euLabelKeys,
  type NutrientKey,
  nutrientByKey,
  nutrientGroups,
  nutrients,
} from '@/lib/domain/nutrition/nutrients';
import {
  type NutrientVector,
  salt,
  sodium,
} from '@/lib/domain/nutrition/vector';
import { cn } from '@/lib/utils';

export const barcodeTaken = 'You already have a food with this barcode.';

export const saveFailed = 'The food could not be saved. Try again.';

const labelFields = [
  'energy_kcal',
  'fat',
  'saturated_fat',
  'carbohydrate',
  'sugars',
  'protein',
] as const satisfies readonly NutrientKey[];

const euLabel: ReadonlySet<NutrientKey> = new Set(euLabelKeys);

const otherNutrients = nutrients.filter(({ key }) => !euLabel.has(key));

const otherGroups = nutrientGroups.flatMap((group) => {
  const members = otherNutrients.filter((nutrient) => nutrient.group === group);
  return members.length === 0 ? [] : [{ group, members }];
});

type EnteredKey = Exclude<NutrientKey, 'sodium'>;

const enteredKeys = nutrients
  .map(({ key }) => key)
  .filter((key): key is EnteredKey => key !== 'sodium');

const optionalAmount = z
  .number({ error: 'Enter a number' })
  .nonnegative('Enter zero or more')
  .optional();

const bases = ['per_100g', 'per_serving'] as const;

type Basis = (typeof bases)[number];

const basisChoices: readonly Choice<Basis>[] = [
  { value: 'per_100g', label: 'Per 100 g' },
  { value: 'per_serving', label: 'Per serving' },
];

const formSchema = z
  .object({
    name: userFoodSchema.shape.name,
    brand: z
      .string()
      .trim()
      .max(maxBrandLength, `Keep it under ${maxBrandLength} characters`),
    barcode: z
      .string()
      .refine(
        (code) => code.trim() === '' || normaliseBarcode(code) !== null,
        invalidBarcode,
      ),
    quantityLabel: z
      .string()
      .trim()
      .max(
        maxQuantityLabelLength,
        `Keep it under ${maxQuantityLabelLength} characters`,
      ),
    basis: z.enum(bases),
    servingGrams: z
      .number({ error: 'Enter the serving size' })
      .positive('Enter a serving size above zero')
      .optional(),
    salt: optionalAmount,
    nutrients: z.object(
      Object.fromEntries(enteredKeys.map((key) => [key, optionalAmount])) as {
        [key in EnteredKey]: typeof optionalAmount;
      },
    ),
    portions: z.array(userFoodPortionSchema).max(maxUserFoodPortions),
  })
  .superRefine((values, context) => {
    if (values.basis === 'per_serving' && values.servingGrams === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Enter the serving size',
        path: ['servingGrams'],
      });
    } else {
      for (const key of nutrientsAboveMax(per100gOf(values))) {
        context.addIssue({
          code: 'custom',
          message: aboveMaxPer100g(key),
          path: key === 'sodium' ? ['salt'] : ['nutrients', key],
        });
      }
    }
    for (const index of takenPortionLabels(values.portions)) {
      context.addIssue({
        code: 'custom',
        message: portionLabelTaken,
        path: ['portions', index, 'label'],
      });
    }
  });

export type UserFoodFormValues = z.infer<typeof formSchema>;

const enteredVector = ({
  nutrients: entered,
  salt: saltG,
}: Pick<UserFoodFormValues, 'nutrients' | 'salt'>): NutrientVector => ({
  ...Object.fromEntries(
    Object.entries(entered).filter(([, amount]) => amount !== undefined),
  ),
  ...(saltG === undefined ? {} : { sodium: sodium(saltG) }),
});

function per100gOf(values: UserFoodFormValues): NutrientVector {
  return per100gOfEntered(
    enteredVector(values),
    values.basis === 'per_serving' && values.servingGrams !== undefined
      ? { per: 'serving', grams: values.servingGrams }
      : { per: '100g' },
  );
}

export type UserFoodSubmission = {
  name: string;
  brand: string;
  barcode: string;
  quantityLabel: string;
  nutrients: NutrientVector;
  portions: UserFoodPortion[];
};

const submissionOf = (
  values: UserFoodFormValues,
  untouched: NutrientVector,
): UserFoodSubmission => ({
  name: values.name,
  brand: values.brand,
  barcode: values.barcode,
  quantityLabel: values.quantityLabel,
  nutrients: { ...per100gOf(values), ...untouched },
  portions: values.portions,
});

type DirtyFields = {
  basis?: boolean;
  salt?: boolean;
  nutrients?: Partial<Record<EnteredKey, boolean>>;
};

const untouchedNutrients = (
  food: Food | null,
  dirty: DirtyFields,
): NutrientVector =>
  food === null || dirty.basis
    ? {}
    : Object.fromEntries(
        Object.entries(food.nutrients).filter(([key]) =>
          key === 'sodium'
            ? !dirty.salt
            : !dirty.nutrients?.[key as EnteredKey],
        ),
      );

const emptyValues = (barcode: string): UserFoodFormValues => ({
  name: '',
  brand: '',
  barcode,
  quantityLabel: '',
  basis: 'per_100g',
  servingGrams: undefined,
  salt: undefined,
  nutrients: {} as UserFoodFormValues['nutrients'],
  portions: [],
});

const per100gValues = (
  nutrients: NutrientVector,
): Pick<
  UserFoodFormValues,
  'basis' | 'servingGrams' | 'salt' | 'nutrients'
> => {
  const { sodium: _sodium, ...per100g } = roundedVector(nutrients);
  return {
    basis: 'per_100g',
    servingGrams: undefined,
    salt:
      nutrients.sodium === undefined
        ? undefined
        : roundEntered(salt(nutrients.sodium)),
    nutrients: per100g as UserFoodFormValues['nutrients'],
  };
};

const valuesOf = (food: Food): UserFoodFormValues => ({
  name: food.name,
  brand: food.brand ?? '',
  barcode: food.barcode ?? '',
  quantityLabel: food.quantityLabel ?? '',
  ...per100gValues(food.nutrients),
  portions: food.portions.flatMap((portion) =>
    'source' in portion ? [{ label: portion.label, grams: portion.grams }] : [],
  ),
});

const valuesOfLabel = (
  label: LabelFood,
  barcode: string,
): UserFoodFormValues => ({
  name: label.name ?? '',
  brand: label.brand ?? '',
  barcode,
  quantityLabel: label.quantityLabel ?? '',
  ...per100gValues(label.nutrients),
  portions: label.portions,
});

const defaultValuesOf = (
  food: Food | null,
  label: LabelFood | null,
  barcode: string,
) => {
  if (food !== null) {
    return valuesOf(food);
  }
  return label === null ? emptyValues(barcode) : valuesOfLabel(label, barcode);
};

const hasOtherNutrients = (nutrients: NutrientVector | undefined) =>
  nutrients !== undefined &&
  otherNutrients.some(({ key }) => nutrients[key] !== undefined);

const optionalNumber = (value: unknown) =>
  value === '' || value === null || value === undefined
    ? undefined
    : Number(value);

const amountProps = {
  type: 'number',
  inputMode: 'decimal',
  min: 0,
  step: 'any',
} as const;

const labelOf = (key: NutrientKey) =>
  `${nutrientNames[key]} (${nutrientByKey[key].unit})`;

export function UserFoodForm({
  food = null,
  label = null,
  barcode = '',
  submit,
  onSave,
  saving,
  failed,
  conflict,
  children,
}: {
  food?: Food | null;
  label?: LabelFood | null;
  barcode?: string;
  submit: string;
  saving: boolean;
  failed: boolean;
  conflict: boolean;
  onSave: (food: UserFoodSubmission) => void;
  children?: ReactNode;
}) {
  const [interactive, setInteractive] = useState(false);
  const [expanded, setExpanded] = useState(() =>
    hasOtherNutrients((food ?? label)?.nutrients),
  );
  const allNutrientsId = useId();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, dirtyFields },
  } = useForm<UserFoodFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValuesOf(food, label, barcode),
    mode: 'onTouched',
  });
  const portions = useFieldArray({ control, name: 'portions' });
  const basis = useWatch({ control, name: 'basis' });

  useEffect(() => {
    setInteractive(true);
  }, []);

  useEffect(() => {
    if (conflict) {
      setError('barcode', { message: barcodeTaken });
    }
  }, [conflict, setError]);

  const amountField = (key: EnteredKey) => {
    const name: FieldPath<UserFoodFormValues> = `nutrients.${key}`;
    return (
      <TextField
        key={key}
        label={labelOf(key)}
        {...amountProps}
        error={errors.nutrients?.[key]?.message}
        {...register(name, { setValueAs: optionalNumber })}
      />
    );
  };

  const onSubmit = handleSubmit(
    (values) =>
      onSave(submissionOf(values, untouchedNutrients(food, dirtyFields))),
    (invalid) => {
      if (
        otherNutrients.some(
          ({ key }) => key !== 'sodium' && invalid.nutrients?.[key],
        )
      ) {
        setExpanded(true);
      }
    },
  );

  return (
    <form
      className="flex flex-col gap-6"
      method="post"
      onSubmit={onSubmit}
      noValidate
    >
      {failed ? <FormError>{saveFailed}</FormError> : null}
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">Details</legend>
        <TextField
          label="Name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Brand"
          autoComplete="off"
          hint="Optional"
          error={errors.brand?.message}
          {...register('brand')}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Barcode"
            inputMode="numeric"
            autoComplete="off"
            error={errors.barcode?.message}
            {...register('barcode')}
          />
          <TextField
            label="Pack size"
            placeholder="400 g"
            autoComplete="off"
            error={errors.quantityLabel?.message}
            {...register('quantityLabel')}
          />
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 font-semibold text-base">Nutrition</legend>
        <Controller
          control={control}
          name="basis"
          render={({ field }) => (
            <ChoiceField
              label="Amounts are"
              choices={basisChoices}
              columns={2}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        {basis === 'per_serving' ? (
          <TextField
            label="Serving size (g)"
            {...amountProps}
            hint="Saved per 100 g"
            error={errors.servingGrams?.message}
            {...register('servingGrams', { setValueAs: optionalNumber })}
          />
        ) : null}
        <div className="grid grid-cols-2 gap-x-3">
          {labelFields.map(amountField)}
          <TextField
            label="Salt (g)"
            {...amountProps}
            error={errors.salt?.message}
            {...register('salt', { setValueAs: optionalNumber })}
          />
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={allNutrientsId}
          onClick={() => setExpanded(!expanded)}
          className="-mx-2 flex min-h-11 items-center gap-1 self-start rounded-md px-2 font-medium text-sm hover:text-foreground"
        >
          All nutrients
          <IconChevronDown
            className={cn(
              'size-4 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
        <div
          id={allNutrientsId}
          hidden={!expanded}
          className="flex flex-col gap-4"
        >
          {otherGroups.map(({ group, members }) => (
            <fieldset key={group} className="flex flex-col gap-2">
              <legend className="mb-2 font-medium text-muted-foreground text-xs">
                {nutrientGroupNames[group]}
              </legend>
              <div className="grid grid-cols-2 gap-x-3">
                {members.map(({ key }) =>
                  key === 'sodium' ? null : amountField(key),
                )}
              </div>
            </fieldset>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold text-base">Portions</legend>
        <p className="text-muted-foreground text-sm">
          100 g, 1 g and 1 ml are always there.
        </p>
        {portions.fields.map((portion, index) => (
          <div key={portion.id} className="flex items-start gap-2">
            <div className="grid flex-1 grid-cols-2 gap-3">
              <TextField
                label={`Portion ${index + 1} label`}
                placeholder="1 slice"
                autoComplete="off"
                error={errors.portions?.[index]?.label?.message}
                {...register(`portions.${index}.label`)}
              />
              <TextField
                label={`Portion ${index + 1} grams`}
                {...amountProps}
                error={errors.portions?.[index]?.grams?.message}
                {...register(`portions.${index}.grams`, {
                  setValueAs: optionalNumber,
                })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-6 size-11 text-muted-foreground"
              onClick={() => portions.remove(index)}
            >
              <IconTrash />
              <span className="sr-only">Remove portion {index + 1}</span>
            </Button>
          </div>
        ))}
        {portions.fields.length < maxUserFoodPortions ? (
          <Button
            type="button"
            variant="ghost"
            className="-ml-2 h-11 self-start"
            onClick={() =>
              portions.append(
                { label: '', grams: undefined as unknown as number },
                { shouldFocus: true },
              )
            }
          >
            <IconPlus className="size-5" />
            Add portion
          </Button>
        ) : null}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={!interactive || saving}
          className={submitButtonClass}
        >
          {saving ? 'Saving…' : submit}
        </Button>
        {children}
      </div>
    </form>
  );
}
