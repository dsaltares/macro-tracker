import { z } from 'zod';
import type { DiaryEntry } from '../../db/diary.ts';
import { dateSchema } from '../../domain/dates.ts';
import {
  addFoodEntry,
  addQuickEntry,
  addRecipeEntry,
  copyMeal,
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
import { apiFailure } from '../errors.ts';
import { apiHandler } from '../handler.ts';
import { diaryDay, diaryEntry, idSchema } from '../schemas.ts';

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

const entryParams = z.object({
  id: idSchema.describe('The entry id, as the diary returned it.'),
});

const entryNotFound = apiFailure('NOT_FOUND', 'There is no such diary entry.');
const foodNotFound = apiFailure('NOT_FOUND', 'There is no such food.');
const recipeNotFound = apiFailure('NOT_FOUND', 'There is no such recipe.');
const portionNotFound = apiFailure(
  'INVALID_REQUEST',
  'The food has no portion with this label.',
);
const emptyRecipe = apiFailure(
  'INVALID_REQUEST',
  'The recipe has no ingredients.',
);
const noAmount = apiFailure(
  'INVALID_REQUEST',
  'A quick entry has no quantity or portion.',
);
const foodGone = apiFailure(
  'CONFLICT',
  'The food or recipe this entry was logged from no longer exists.',
);

const when = {
  date: dateSchema,
  meal: mealSchema,
  time: timeSchema
    .default(null)
    .describe('The time of day as HH:MM. Leave out for none.'),
};

const foodEntrySchema = z
  .strictObject({
    kind: z.literal('food'),
    ...when,
    foodId: idSchema.describe('A food id from search.'),
    portion: portionSchema.describe(
      'The label of one of the food\'s portions, such as "100 g" or "1 serving (40 g)".',
    ),
    quantity: quantitySchema.describe('How many of that portion.'),
  })
  .meta({ title: 'Food entry' });

const recipeEntrySchema = z
  .strictObject({
    kind: z.literal('recipe'),
    ...when,
    recipeId: idSchema,
    servings: quantitySchema
      .optional()
      .describe('How many servings. Give this or grams.'),
    grams: quantitySchema
      .optional()
      .describe('The weight eaten. Give this or servings.'),
  })
  .refine(
    ({ servings, grams }) => (servings === undefined) !== (grams === undefined),
    { message: 'Give either servings or grams', path: ['servings'] },
  )
  .meta({ title: 'Recipe entry' });

const quickEntrySchema = savingOnlyPer100g(
  z.strictObject({
    kind: z.literal('quick'),
    ...when,
    label: entryLabelSchema.describe('What was eaten, in a few words.'),
    nutrients: quickNutrientsSchema.describe(
      'Either amounts per 100 g with the grams eaten, or the totals eaten. Energy is worked out from the macros when left out.',
    ),
    saveAsFood: z
      .boolean()
      .default(false)
      .describe(
        'Also create a food of the caller’s own from the amounts per 100 g, so search finds it next time.',
      ),
  }),
).meta({ title: 'Quick entry' });

const exampleEntryId = '2c4e6a8b-0d1f-4a3b-8c5d-9e7f6a5b4c3d';
const exampleFoodId = '7d1f4c2e-9b3a-4f6e-8c5d-2a1b0c9d8e7f';

const oatsEntry = {
  id: exampleEntryId,
  kind: 'food' as const,
  date: '2026-10-20',
  meal: 'breakfast' as const,
  time: '07:30',
  label: 'Porridge oats',
  foodId: exampleFoodId,
  recipeId: null,
  quantity: 1,
  portion: '1 serving (40 g)',
  grams: 40,
  nutrients: {
    energy_kcal: 151.6,
    protein: 4.68,
    carbohydrate: 24.16,
    fat: 3.04,
    fibre: 3.64,
    saturated_fat: 0.52,
    sugars: 0.44,
    sodium: 1.6,
  },
  createdAt: '2026-10-20T06:31:12.000Z',
  updatedAt: '2026-10-20T06:31:12.000Z',
};

export const diaryDayRoute = apiHandler({
  method: 'GET',
  path: '/diary/{date}',
  operationId: 'getDiaryDay',
  summary: 'Read a day',
  description:
    'Every entry of one day, grouped by meal in meal order, with the totals of each meal and of the day. Totals are sums over the entries’ snapshots.',
  scope: 'read',
  params: z.object({ date: dateSchema }),
  output: diaryDay,
  example: {
    params: { date: '2026-10-20' },
    response: {
      date: '2026-10-20',
      meals: [
        {
          meal: 'breakfast',
          entries: [oatsEntry],
          totals: oatsEntry.nutrients,
        },
        { meal: 'lunch', entries: [], totals: {} },
        { meal: 'dinner', entries: [], totals: {} },
        { meal: 'snack', entries: [], totals: {} },
      ],
      totals: oatsEntry.nutrients,
    },
  },
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
  method: 'POST',
  path: '/diary/entries',
  operationId: 'addDiaryEntry',
  summary: 'Log an entry',
  description:
    'Log a food by one of its portions, a recipe by servings or grams, or a quick entry from amounts typed in. A food or recipe entry snapshots its nutrients as they are now, so a later change to the food leaves it alone.',
  scope: 'write',
  status: 201,
  input: z.discriminatedUnion('kind', [
    foodEntrySchema,
    recipeEntrySchema,
    quickEntrySchema,
  ]),
  output: diaryEntry,
  errors: [foodNotFound, recipeNotFound, portionNotFound, emptyRecipe],
  example: {
    input: {
      kind: 'food',
      date: '2026-10-20',
      meal: 'breakfast',
      time: '07:30',
      foodId: exampleFoodId,
      portion: '1 serving (40 g)',
      quantity: 1,
    },
    response: oatsEntry,
  },
  handle: async ({ context, input }) => {
    switch (input.kind) {
      case 'food': {
        const { kind, ...food } = input;
        const logged = await addFoodEntry(context, food);
        if (logged.outcome === 'food-not-found') {
          throw foodNotFound();
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
          throw recipeNotFound();
        }
        if (logged.outcome === 'empty-recipe') {
          throw emptyRecipe();
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
  method: 'PATCH',
  path: '/diary/entries/{id}',
  operationId: 'updateDiaryEntry',
  summary: 'Change an entry',
  description:
    'Send only the fields to change. A new quantity or portion re-resolves the nutrients from the food or recipe as it is now; a move to another date, meal or time keeps them.',
  scope: 'write',
  params: entryParams,
  input: z.strictObject({
    date: dateSchema.optional(),
    meal: mealSchema.optional(),
    time: timeSchema.optional().describe('HH:MM, or null to clear it.'),
    quantity: quantitySchema.optional(),
    portion: portionSchema.optional(),
  }),
  output: diaryEntry,
  errors: [entryNotFound, noAmount, portionNotFound, foodGone],
  example: {
    params: { id: exampleEntryId },
    input: { quantity: 2 },
    response: {
      ...oatsEntry,
      quantity: 2,
      grams: 80,
      nutrients: {
        energy_kcal: 303.2,
        protein: 9.36,
        carbohydrate: 48.32,
        fat: 6.08,
        fibre: 7.28,
        saturated_fat: 1.04,
        sugars: 0.88,
        sodium: 3.2,
      },
      updatedAt: '2026-10-20T08:02:45.000Z',
    },
  },
  handle: async ({ context, params, input }) => {
    const updated = await updateEntry(context, params.id, input);
    switch (updated.outcome) {
      case 'not-found':
        throw entryNotFound();
      case 'no-amount':
        throw noAmount();
      case 'food-gone':
        throw foodGone();
      case 'portion-not-found':
        throw portionNotFound();
      case 'updated':
        return entryOf(updated.entry);
    }
  },
});

export const removeEntryRoute = apiHandler({
  method: 'DELETE',
  path: '/diary/entries/{id}',
  operationId: 'removeDiaryEntry',
  summary: 'Remove an entry',
  description: 'Delete one entry of the caller’s diary. Answers 204.',
  scope: 'write',
  params: entryParams,
  errors: [entryNotFound],
  example: { params: { id: exampleEntryId } },
  handle: async ({ context, params }) => {
    if (!(await removeEntry(context, params.id))) {
      throw entryNotFound();
    }
  },
});

export const copyMealRoute = apiHandler({
  method: 'POST',
  path: '/diary/copy',
  operationId: 'copyMeal',
  summary: 'Copy a meal',
  description:
    'Copy every entry of one meal on one date into a meal on another date, snapshots as they are. Answers the new entries; none when the meal was empty.',
  scope: 'write',
  input: z.strictObject({
    fromDate: dateSchema,
    meal: mealSchema.describe('The meal to copy.'),
    toDate: dateSchema,
    toMeal: mealSchema.describe('The meal to copy into.'),
  }),
  output: z.object({ entries: z.array(diaryEntry) }),
  example: {
    input: {
      fromDate: '2026-10-19',
      meal: 'breakfast',
      toDate: '2026-10-20',
      toMeal: 'breakfast',
    },
    response: { entries: [oatsEntry] },
  },
  handle: async ({ context, input }) => ({
    entries: (await copyMeal(context, input)).map(entryOf),
  }),
});
