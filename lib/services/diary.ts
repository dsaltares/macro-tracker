import { z } from 'zod';
import {
  copyDiaryMeal,
  type DiaryEntryChanges,
  diaryDay,
  type FoodToLog,
  logFood,
  logQuickEntry,
  logRecipe,
  type MealCopy,
  type RecipeToLog,
  removeDiaryEntry,
  updateDiaryEntry,
} from '../db/diary.ts';
import { isDate } from '../domain/dates.ts';
import {
  dayTotals,
  type Meal,
  maxEntryLabelLength,
  meals,
  mealTotals,
  type QuickEntryNutrients,
  quickEntryNutrients,
} from '../domain/diary/entries.ts';
import { nutrientVectorSchema } from '../domain/foods/source-food.ts';
import type { ServiceContext } from './context.ts';

export const dateSchema = z.string().refine(isDate, { message: 'Not a date' });
export const mealSchema = z.enum(meals);
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Not a time' })
  .nullable();
export const quantitySchema = z.number().positive();
export const portionSchema = z.string().min(1);
export const entryLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(maxEntryLabelLength);
export const quickNutrientsSchema = z.union([
  z.strictObject({
    per100g: nutrientVectorSchema,
    grams: z.number().positive(),
  }),
  z.strictObject({ totals: nutrientVectorSchema }),
]);

type SavableQuickEntry = {
  saveAsFood: boolean;
  nutrients: QuickEntryNutrients;
};

export const savingOnlyPer100g = <Schema extends z.ZodType<SavableQuickEntry>>(
  schema: Schema,
) =>
  schema.refine(
    ({ saveAsFood, nutrients }) => !saveAsFood || 'per100g' in nutrients,
    {
      message: 'Only amounts per 100 g can be saved as a food',
      path: ['saveAsFood'],
    },
  );

export type QuickEntryToAdd = {
  date: string;
  meal: Meal;
  time: string | null;
  label: string;
  nutrients: QuickEntryNutrients;
  saveAsFood: boolean;
};

export const findDiaryDay = async (
  { db, caller }: Pick<ServiceContext, 'db' | 'caller'>,
  date: string,
) => {
  const entries = await diaryDay(db, caller.userId, date);
  const totals = mealTotals(entries);
  return {
    date,
    meals: meals.map((meal) => ({
      meal,
      entries: entries.filter((entry) => entry.meal === meal),
      totals: totals[meal],
    })),
    totals: dayTotals(entries),
  };
};

export const addFoodEntry = (context: ServiceContext, food: FoodToLog) =>
  logFood(context.db, context.caller.userId, food, context);

export const addRecipeEntry = (context: ServiceContext, recipe: RecipeToLog) =>
  logRecipe(context.db, context.caller.userId, recipe, context);

export const addQuickEntry = (
  context: ServiceContext,
  { saveAsFood, nutrients, ...entry }: QuickEntryToAdd,
) =>
  logQuickEntry(
    context.db,
    context.caller.userId,
    {
      ...entry,
      nutrients: quickEntryNutrients(nutrients),
      foodPer100g:
        saveAsFood && 'per100g' in nutrients ? nutrients.per100g : null,
    },
    context,
  );

export const updateEntry = (
  { db, caller, now }: ServiceContext,
  entryId: string,
  changes: DiaryEntryChanges,
) => updateDiaryEntry(db, caller.userId, entryId, changes, now);

export const removeEntry = (
  { db, caller }: Pick<ServiceContext, 'db' | 'caller'>,
  entryId: string,
) => removeDiaryEntry(db, caller.userId, entryId);

export const copyMeal = (context: ServiceContext, copy: MealCopy) =>
  copyDiaryMeal(context.db, context.caller.userId, copy, context);
