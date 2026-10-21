import { z } from 'zod';
import { declaredFromUsda } from '../../data/sources/usda/mapping.ts';
import type { Meal } from '../../domain/diary/entries.ts';
import {
  isStandardLabel,
  maxPortionLabelLength,
  type Portion,
} from '../../domain/foods/portions.ts';
import {
  type NutrientBasis,
  normaliseNutrients,
} from '../../domain/foods/source-food.ts';
import type { ReferenceSource } from '../../domain/foods/sources.ts';
import {
  maxFoodNameLength,
  maxUserFoodPortions,
  type UserFoodFields,
  userFoodSchema,
} from '../../domain/foods/user-food.ts';
import type { NutrientVector } from '../../domain/nutrition/vector.ts';

const nutrientAmountsSchema = z.array(
  z.object({ id: z.number().nullable(), amount: z.number().nullable() }),
);

const measureSchema = z.object({
  name: z.string().nullable(),
  value: z.number().nullable(),
  type: z.string().nullable(),
  hidden: z.boolean().nullish(),
});

const jsonOf = <Schema extends z.ZodType>(schema: Schema) =>
  z
    .string()
    .nullable()
    .transform((json) => (json === null ? [] : JSON.parse(json)))
    .pipe(schema);

export const cronometerFoodSchema = z.object({
  food_id: z.number(),
  name: z.string(),
  source: z.string().nullable(),
  measures_json: jsonOf(z.array(measureSchema)),
  nutrients_json: jsonOf(nutrientAmountsSchema),
});

export type CronometerFood = z.infer<typeof cronometerFoodSchema>;

export type CronometerMeasure = z.infer<typeof measureSchema>;

export const cronometerMealGroups = [
  'breakfast',
  'lunch',
  'dinner',
  'snacks',
  'uncategorized',
] as const;

export const cronometerServingSchema = z.object({
  serving_id: z.string(),
  day: z.string(),
  time: z.string().nullable(),
  meal_group: z.enum(cronometerMealGroups),
  food_id: z.number().nullable(),
  measure_name: z.string().nullable(),
  quantity_grams: z.number().nullable(),
  energy_kcal: z.number().nullable(),
  nutrients_json: jsonOf(nutrientAmountsSchema),
});

export type CronometerServing = z.infer<typeof cronometerServingSchema>;

export const weighInSchema = z.object({
  measured_at: z.string(),
  weight: z.number(),
});

export type WeighIn = z.infer<typeof weighInSchema>;

const mealOfGroup: Record<CronometerServing['meal_group'], Meal> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snacks: 'snack',
  uncategorized: 'snack',
};

export const mealOf = (group: CronometerServing['meal_group']) =>
  mealOfGroup[group];

const hourAndMinute = /^([01]\d|2[0-3]):[0-5]\d/;

export const timeOf = (time: string | null) =>
  time?.match(hourAndMinute)?.[0] ?? null;

export const cronometerNutrients = (
  amounts: CronometerFood['nutrients_json'],
  basis: NutrientBasis = { per: '100g' },
): NutrientVector => {
  const byNumber = new Map<string, number>();
  for (const { id, amount } of amounts) {
    if (id !== null && amount !== null) {
      byNumber.set(String(id), amount);
    }
  }
  return normaliseNutrients(declaredFromUsda(byNumber), basis).nutrients;
};

export type ReferenceId = { source: ReferenceSource; sourceId: string };

const usdaSrLegacy = /^USDAsr:(\d+)$/;
const cofidCode = /^CoFID:(\d+-\d+)$/;

export const referenceIdOf = (source: string | null): ReferenceId | null => {
  const usda = source?.match(usdaSrLegacy);
  if (usda) {
    return { source: 'usda', sourceId: `ndb:${Number(usda[1])}` };
  }
  const code = source?.match(cofidCode)?.[1];
  return code === undefined ? null : { source: 'cofid', sourceId: code };
};

const brandedSource = 'CRDB';

const quickAddPrefix = /^quick add\b/i;

export const isQuickAdd = (food: CronometerFood) =>
  quickAddPrefix.test(food.name.trim());

export const productNameOf = (food: CronometerFood) => {
  const [, ...product] = food.name.split(',');
  return food.source === brandedSource && product.length > 0
    ? product.join(',').trim()
    : food.name.trim();
};

const isRecipeMeasure = (measure: CronometerMeasure) =>
  measure.type === 'Recipe';

export const isRecipe = (food: CronometerFood) =>
  food.measures_json.some(isRecipeMeasure);

const recipeGramsMeasure = 'g';

export const recipeServingGrams = (food: CronometerFood) => {
  const grams = food.measures_json.find(
    (measure) =>
      isRecipeMeasure(measure) && measure.name?.trim() === recipeGramsMeasure,
  )?.value;
  return grams !== null && grams !== undefined && grams > 0 ? grams : null;
};

export const foodNutrientsPer100g = (food: CronometerFood) => {
  if (!isRecipe(food)) {
    return cronometerNutrients(food.nutrients_json);
  }
  const grams = recipeServingGrams(food);
  return grams === null
    ? null
    : cronometerNutrients(food.nutrients_json, { per: 'serving', grams });
};

export const servingGrams = (
  serving: CronometerServing,
  food: CronometerFood,
) => {
  if (serving.quantity_grams === null) {
    return null;
  }
  if (!isRecipe(food)) {
    return serving.quantity_grams;
  }
  const grams = recipeServingGrams(food);
  return grams === null ? null : serving.quantity_grams * grams;
};

const portionLabel = (name: string | null) => {
  const label = name?.trim() ?? '';
  return label === '' ||
    label.length > maxPortionLabelLength ||
    isStandardLabel(label)
    ? null
    : label;
};

export const portionsOf = (food: CronometerFood): Portion[] => {
  const recipeGrams = recipeServingGrams(food);
  const portions: Portion[] = [];
  for (const measure of food.measures_json) {
    const label = portionLabel(measure.name);
    const grams = isRecipeMeasure(measure)
      ? measure.name?.trim() === recipeGramsMeasure || recipeGrams === null
        ? null
        : (measure.value ?? 0) * recipeGrams
      : measure.value;
    if (
      label === null ||
      measure.hidden ||
      grams === null ||
      grams <= 0 ||
      (label === recipeGramsMeasure && grams === 1) ||
      portions.some((portion) => portion.label === label)
    ) {
      continue;
    }
    portions.push({ label, grams });
  }
  return portions.slice(0, maxUserFoodPortions);
};

export const userFoodOf = (food: CronometerFood): UserFoodFields | null => {
  const nutrients = foodNutrientsPer100g(food);
  if (nutrients === null) {
    return null;
  }
  const parsed = userFoodSchema.safeParse({
    name: food.name.trim().slice(0, maxFoodNameLength),
    brand: null,
    barcode: null,
    quantityLabel: null,
    nutrients,
    portions: portionsOf(food),
  });
  return parsed.success ? parsed.data : null;
};
