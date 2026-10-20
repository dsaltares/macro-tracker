import { gramsFor, type Portion } from '../foods/portions.ts';
import {
  forGrams,
  type NutrientVector,
  sum,
  withEnergy,
} from '../nutrition/vector.ts';

export const meals = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type Meal = (typeof meals)[number];

export const entryKinds = ['food', 'recipe', 'quick'] as const;

export type EntryKind = (typeof entryKinds)[number];

export const maxEntryLabelLength = 100;

export type ResolvedEntry = {
  grams: number;
  nutrients: NutrientVector;
};

export const resolveEntry = (
  food: { nutrients: NutrientVector },
  portion: Portion,
  quantity: number,
): ResolvedEntry => {
  const grams = gramsFor(portion, quantity);
  return { grams, nutrients: forGrams(withEnergy(food.nutrients), grams) };
};

export type QuickEntryNutrients =
  | { per100g: NutrientVector; grams: number }
  | { totals: NutrientVector };

export const quickEntryNutrients = (input: QuickEntryNutrients) =>
  withEnergy(
    'totals' in input ? input.totals : forGrams(input.per100g, input.grams),
  );

type Snapshotted = { nutrients: NutrientVector };

export const dayTotals = (entries: readonly Snapshotted[]) =>
  sum(entries.map(({ nutrients }) => nutrients));

export const mealTotals = (
  entries: readonly (Snapshotted & { meal: Meal })[],
) =>
  Object.fromEntries(
    meals.map((meal) => [
      meal,
      dayTotals(entries.filter((entry) => entry.meal === meal)),
    ]),
  ) as Record<Meal, NutrientVector>;
