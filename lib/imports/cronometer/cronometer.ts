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

const nullable = <Schema extends z.ZodType>(schema: Schema) =>
  schema.nullish().transform((value) => value ?? null);

const nutrientAmountSchema = z.object({
  id: nullable(z.number()),
  amount: nullable(z.number()),
});

const measureSchema = z.object({
  id: nullable(z.number()),
  name: nullable(z.string()),
  value: nullable(z.number()),
  type: nullable(z.string()),
  hidden: z.boolean().nullish(),
});

const listOf = <Schema extends z.ZodType>(schema: Schema) =>
  z
    .array(schema)
    .nullish()
    .transform((items) => items ?? []);

export const cronometerFoodSchema = z.object({
  id: z.number(),
  name: z.string(),
  source: nullable(z.string()),
  defaultMeasureId: nullable(z.number()),
  measures: listOf(measureSchema),
  nutrients: listOf(nutrientAmountSchema),
});

export type CronometerFood = z.infer<typeof cronometerFoodSchema>;

export type CronometerMeasure = z.infer<typeof measureSchema>;

export type NutrientAmounts = CronometerFood['nutrients'];

export const diaryEntrySchema = z.object({
  type: nullable(z.string()),
  time: nullable(z.string()),
  foodId: nullable(z.coerce.number().int()),
  measureId: nullable(z.coerce.number().int()),
  grams: nullable(z.number()),
  servingId: nullable(z.union([z.string(), z.number()]).transform(String)),
  order: nullable(z.number()),
});

export type DiaryEntry = z.infer<typeof diaryEntrySchema>;

export const cronometerMealGroups = [
  'breakfast',
  'lunch',
  'dinner',
  'snacks',
  'uncategorized',
] as const;

export type CronometerMealGroup = (typeof cronometerMealGroups)[number];

export type CronometerServing = {
  servingId: string;
  day: string;
  time: string | null;
  mealGroup: CronometerMealGroup;
  foodId: number | null;
  measureName: string | null;
  quantityGrams: number | null;
  nutrients: NutrientAmounts;
};

export type Weight = { date: string; kilograms: number };

const mealGroupsByNumber: Record<number, CronometerMealGroup> = {
  1: 'breakfast',
  2: 'lunch',
  3: 'dinner',
  4: 'snacks',
};

const mealGroupBits = 16;

export const mealGroupOf = (order: number | null): CronometerMealGroup =>
  order === null
    ? 'uncategorized'
    : (mealGroupsByNumber[order >> mealGroupBits] ?? 'uncategorized');

const mealOfGroup: Record<CronometerMealGroup, Meal> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snacks: 'snack',
  uncategorized: 'snack',
};

export const mealOf = (group: CronometerMealGroup) => mealOfGroup[group];

const hourAndMinute = /^(\d{1,2}):(\d{1,2})/;
const hoursPerDay = 24;
const minutesPerHour = 60;

export const timeOf = (time: string | null) => {
  const [, hour, minute] = time?.match(hourAndMinute) ?? [];
  if (hour === undefined || minute === undefined) {
    return null;
  }
  return Number(hour) < hoursPerDay && Number(minute) < minutesPerHour
    ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    : null;
};

const roundedTo = 4;

const scaledAmounts = (amounts: NutrientAmounts, scale: number) =>
  amounts.map(({ id, amount }) => ({
    id,
    amount:
      amount === null ? null : Number((amount * scale).toFixed(roundedTo)),
  }));

const measureOf = (food: CronometerFood, measureId: number | null) =>
  food.measures.find(({ id }) => id !== null && id === measureId) ??
  food.measures.find(({ id }) => id !== null && id === food.defaultMeasureId) ??
  null;

const gramsPer100 = 100;

export const servingOf = (
  day: string,
  entry: DiaryEntry,
  position: number,
  food: CronometerFood | undefined,
): CronometerServing => {
  const measure = food ? measureOf(food, entry.measureId) : null;
  const scale =
    entry.grams === null
      ? null
      : measure?.type === 'Recipe'
        ? entry.grams
        : entry.grams / gramsPer100;
  return {
    servingId: entry.servingId ?? `${day}-${position}`,
    day,
    time: entry.time,
    mealGroup: mealGroupOf(entry.order),
    foodId: entry.foodId,
    measureName: measure?.name ?? null,
    quantityGrams: entry.grams,
    nutrients:
      food && scale !== null ? scaledAmounts(food.nutrients, scale) : [],
  };
};

export const cronometerNutrients = (
  amounts: NutrientAmounts,
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
  food.measures.some(isRecipeMeasure);

const recipeGramsMeasure = 'g';

export const recipeServingGrams = (food: CronometerFood) => {
  const grams = food.measures.find(
    (measure) =>
      isRecipeMeasure(measure) && measure.name?.trim() === recipeGramsMeasure,
  )?.value;
  return grams !== null && grams !== undefined && grams > 0 ? grams : null;
};

export const foodNutrientsPer100g = (food: CronometerFood) => {
  if (!isRecipe(food)) {
    return cronometerNutrients(food.nutrients);
  }
  const grams = recipeServingGrams(food);
  return grams === null
    ? null
    : cronometerNutrients(food.nutrients, { per: 'serving', grams });
};

export const servingGrams = (
  serving: CronometerServing,
  food: CronometerFood,
) => {
  if (serving.quantityGrams === null) {
    return null;
  }
  if (!isRecipe(food)) {
    return serving.quantityGrams;
  }
  const grams = recipeServingGrams(food);
  return grams === null ? null : serving.quantityGrams * grams;
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
  for (const measure of food.measures) {
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
