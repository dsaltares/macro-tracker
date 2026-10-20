import { z } from 'zod';
import type { DiaryEntry } from '../../db/diary.ts';
import {
  addFoodEntry,
  addQuickEntry,
  addRecipeEntry,
  copyMeal,
  dateSchema,
  entryLabelSchema,
  findDiaryDay,
  mealSchema,
  portionSchema,
  quantitySchema,
  quickNutrientsSchema,
  removeEntry,
  savingOnlyPer100g,
  timeSchema,
  updateEntry,
} from '../../services/diary.ts';
import { apiError } from '../errors.ts';
import { apiHandler } from '../handler.ts';

const entryOf = (entry: DiaryEntry) => ({
  id: entry.id,
  kind: entry.kind,
  date: entry.date,
  meal: entry.meal,
  time: entry.time,
  label: entry.label,
  foodId: entry.foodId,
  recipeId: entry.recipeId,
  quantity: entry.quantity,
  portion: entry.portionLabel,
  grams: entry.grams,
  nutrients: entry.nutrients,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const entryParams = z.object({ id: z.string().min(1) });

const entryNotFound = () =>
  apiError('NOT_FOUND', 'There is no such diary entry.');

const portionNotFound = () =>
  apiError('INVALID_REQUEST', 'The food has no portion with this label.');

const when = {
  date: dateSchema,
  meal: mealSchema,
  time: timeSchema.default(null),
};

const foodEntrySchema = z.strictObject({
  kind: z.literal('food'),
  ...when,
  foodId: z.string().min(1),
  portion: portionSchema,
  quantity: quantitySchema,
});

const recipeEntrySchema = z
  .strictObject({
    kind: z.literal('recipe'),
    ...when,
    recipeId: z.string().min(1),
    servings: quantitySchema.optional(),
    grams: quantitySchema.optional(),
  })
  .refine(
    ({ servings, grams }) => (servings === undefined) !== (grams === undefined),
    { message: 'Give either servings or grams', path: ['servings'] },
  );

const quickEntrySchema = savingOnlyPer100g(
  z.strictObject({
    kind: z.literal('quick'),
    ...when,
    label: entryLabelSchema,
    nutrients: quickNutrientsSchema,
    saveAsFood: z.boolean().default(false),
  }),
);

export const diaryDayRoute = apiHandler({
  scope: 'read',
  params: z.object({ date: dateSchema }),
  handle: async ({ context, params }) => {
    const day = await findDiaryDay(context, params.date);
    return {
      date: day.date,
      meals: day.meals.map(({ meal, entries, totals }) => ({
        meal,
        entries: entries.map(entryOf),
        totals,
      })),
      totals: day.totals,
    };
  },
});

export const addEntryRoute = apiHandler({
  scope: 'write',
  status: 201,
  input: z.discriminatedUnion('kind', [
    foodEntrySchema,
    recipeEntrySchema,
    quickEntrySchema,
  ]),
  handle: async ({ context, input }) => {
    switch (input.kind) {
      case 'food': {
        const { kind, ...food } = input;
        const logged = await addFoodEntry(context, food);
        if (logged.outcome === 'food-not-found') {
          throw apiError('NOT_FOUND', 'There is no such food.');
        }
        if (logged.outcome === 'portion-not-found') {
          throw portionNotFound();
        }
        return entryOf(logged.entry);
      }
      case 'recipe': {
        const { date, meal, time, recipeId, servings, grams } = input;
        const logged = await addRecipeEntry(context, {
          date,
          meal,
          time,
          recipeId,
          amount: servings === undefined ? { grams: grams ?? 0 } : { servings },
        });
        if (logged.outcome === 'recipe-not-found') {
          throw apiError('NOT_FOUND', 'There is no such recipe.');
        }
        if (logged.outcome === 'empty-recipe') {
          throw apiError('INVALID_REQUEST', 'The recipe has no ingredients.');
        }
        return entryOf(logged.entry);
      }
      case 'quick': {
        const { kind, ...quick } = input;
        return entryOf(await addQuickEntry(context, quick));
      }
    }
  },
});

export const updateEntryRoute = apiHandler({
  scope: 'write',
  params: entryParams,
  input: z.strictObject({
    date: dateSchema.optional(),
    meal: mealSchema.optional(),
    time: timeSchema.optional(),
    quantity: quantitySchema.optional(),
    portion: portionSchema.optional(),
  }),
  handle: async ({ context, params, input }) => {
    const updated = await updateEntry(context, params.id, input);
    switch (updated.outcome) {
      case 'not-found':
        throw entryNotFound();
      case 'no-amount':
        throw apiError(
          'INVALID_REQUEST',
          'A quick entry has no quantity or portion.',
        );
      case 'food-gone':
        throw apiError(
          'CONFLICT',
          'The food or recipe this entry was logged from no longer exists.',
        );
      case 'portion-not-found':
        throw portionNotFound();
      case 'updated':
        return entryOf(updated.entry);
    }
  },
});

export const removeEntryRoute = apiHandler({
  scope: 'write',
  params: entryParams,
  handle: async ({ context, params }) => {
    if (!(await removeEntry(context, params.id))) {
      throw entryNotFound();
    }
  },
});

export const copyMealRoute = apiHandler({
  scope: 'write',
  input: z.strictObject({
    fromDate: dateSchema,
    meal: mealSchema,
    toDate: dateSchema,
    toMeal: mealSchema,
  }),
  handle: async ({ context, input }) => ({
    entries: (await copyMeal(context, input)).map(entryOf),
  }),
});
