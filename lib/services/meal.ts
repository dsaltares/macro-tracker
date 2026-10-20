import { z } from 'zod';
import { logMealEntries, type MealEntryToLog } from '../db/diary.ts';
import { type Meal, quickEntryNutrients } from '../domain/diary/entries.ts';
import type { MealEntryToAdd } from '../domain/diary/meal-estimate.ts';
import type { ServiceContext } from './context.ts';
import {
  dateSchema,
  entryLabelSchema,
  mealSchema,
  portionSchema,
  quantitySchema,
  quickNutrientsSchema,
  timeSchema,
} from './diary.ts';

export const maxMealItems = 50;

export const mealEntrySchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('food'),
    foodId: z.string().min(1),
    portion: portionSchema,
    quantity: quantitySchema,
  }),
  z.strictObject({
    kind: z.literal('recipe'),
    recipeId: z.string().min(1),
    amount: z.union([
      z.strictObject({ servings: quantitySchema }),
      z.strictObject({ grams: quantitySchema }),
    ]),
  }),
  z.strictObject({
    kind: z.literal('quick'),
    label: entryLabelSchema,
    nutrients: quickNutrientsSchema,
  }),
]);

export const mealToLogSchema = z.object({
  date: dateSchema,
  meal: mealSchema,
  time: timeSchema.default(null),
  items: z.array(mealEntrySchema).min(1).max(maxMealItems),
});

export type MealToLog = {
  date: string;
  meal: Meal;
  time: string | null;
  items: MealEntryToAdd[];
};

const entryToLog = (item: MealEntryToAdd): MealEntryToLog =>
  item.kind === 'quick'
    ? { ...item, nutrients: quickEntryNutrients(item.nutrients) }
    : item;

export const logMeal = (
  context: ServiceContext,
  { items, ...when }: MealToLog,
) =>
  logMealEntries(
    context.db,
    context.caller.userId,
    { ...when, entries: items.map(entryToLog) },
    context,
  );
