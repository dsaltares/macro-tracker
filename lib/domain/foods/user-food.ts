import { z } from 'zod';
import {
  type NutrientKey,
  type NutrientUnit,
  nutrientByKey,
  nutrientKeys,
} from '../nutrition/nutrients.ts';
import { type NutrientVector, per100gFrom } from '../nutrition/vector.ts';
import { normaliseBarcode } from './barcode.ts';
import { isStandardLabel, maxPortionLabelLength } from './portions.ts';
import type { NutrientBasis } from './source-food.ts';

export const maxFoodNameLength = 120;
export const maxBrandLength = 120;
export const maxQuantityLabelLength = 60;
export const maxUserFoodPortions = 30;

export const maxPer100g = {
  kcal: 900,
  g: 100,
  mg: 100_000,
  µg: 100_000_000,
} as const satisfies Record<NutrientUnit, number>;

export const aboveMaxPer100g = (key: NutrientKey) => {
  const { unit } = nutrientByKey[key];
  return `More than ${new Intl.NumberFormat('en').format(maxPer100g[unit])} ${unit} per 100 g`;
};

export const invalidBarcode = 'Enter an EAN-8, EAN-13 or UPC-A barcode';

export const portionLabelTaken =
  'The food already has a portion with this label';

const enteredDecimals = 2;

export const roundEntered = (amount: number) => {
  const factor = 10 ** enteredDecimals;
  return Math.round(amount * factor) / factor;
};

export const roundedVector = (vector: NutrientVector): NutrientVector =>
  Object.fromEntries(
    Object.entries(vector).map(([key, amount]) => [key, roundEntered(amount)]),
  );

export const per100gOfEntered = (
  entered: NutrientVector,
  basis: NutrientBasis,
): NutrientVector =>
  roundedVector(
    basis.per === 'serving' ? per100gFrom(entered, basis.grams) : entered,
  );

export const nutrientsAboveMax = (vector: NutrientVector): NutrientKey[] =>
  nutrientKeys.filter(
    (key) => (vector[key] ?? 0) > maxPer100g[nutrientByKey[key].unit],
  );

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .nullable()
    .transform((text) => (text === '' ? null : text));

export const barcodeSchema = z
  .string()
  .nullable()
  .transform((code, context) => {
    if (code === null || code.trim() === '') {
      return null;
    }
    const barcode = normaliseBarcode(code);
    if (barcode === null) {
      context.addIssue({ code: 'custom', message: invalidBarcode });
      return z.NEVER;
    }
    return barcode;
  });

export const userFoodPortionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Enter a label')
    .max(
      maxPortionLabelLength,
      `Keep it under ${maxPortionLabelLength} characters`,
    ),
  grams: z
    .number({ error: 'Enter a weight' })
    .positive('Enter a weight above zero')
    .finite(),
});

export type UserFoodPortion = z.infer<typeof userFoodPortionSchema>;

export const takenPortionLabels = (
  portions: readonly { label: string }[],
): number[] =>
  portions.flatMap(({ label }, index) => {
    const trimmed = label.trim();
    return isStandardLabel(trimmed) ||
      portions
        .slice(0, index)
        .some((earlier) => earlier.label.trim() === trimmed)
      ? [index]
      : [];
  });

const per100gSchema = z
  .partialRecord(z.enum(nutrientKeys), z.number().nonnegative().finite())
  .superRefine((vector, context) => {
    for (const key of nutrientsAboveMax(vector)) {
      context.addIssue({
        code: 'custom',
        message: aboveMaxPer100g(key),
        path: [key],
      });
    }
  });

export const userFoodSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    .max(maxFoodNameLength, `Keep it under ${maxFoodNameLength} characters`),
  brand: optionalText(maxBrandLength),
  barcode: barcodeSchema,
  quantityLabel: optionalText(maxQuantityLabelLength),
  nutrients: per100gSchema,
  portions: z
    .array(userFoodPortionSchema)
    .max(maxUserFoodPortions)
    .superRefine((portions, context) => {
      for (const index of takenPortionLabels(portions)) {
        context.addIssue({
          code: 'custom',
          message: portionLabelTaken,
          path: [index, 'label'],
        });
      }
    }),
});

export type UserFoodFields = z.output<typeof userFoodSchema>;
