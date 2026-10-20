import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { clearDiaryMeal, frequentFoods, recentFoods } from '../../db/diary.ts';
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
import { accountProcedure, router } from '../trpc.ts';

const entryNotFound = () => new TRPCError({ code: 'NOT_FOUND' });

const portionNotFound = () =>
  new TRPCError({
    code: 'BAD_REQUEST',
    message: 'The food has no portion with this label',
  });

export const diaryRouter = router({
  day: accountProcedure
    .input(dateSchema)
    .query(({ ctx, input }) => findDiaryDay(ctx, input)),
  recentFoods: accountProcedure.query(({ ctx }) =>
    recentFoods(ctx.db, ctx.caller.userId),
  ),
  frequentFoods: accountProcedure
    .input(dateSchema)
    .query(({ ctx, input }) => frequentFoods(ctx.db, ctx.caller.userId, input)),
  addFood: accountProcedure
    .input(
      z.object({
        date: dateSchema,
        meal: mealSchema,
        foodId: z.string().min(1),
        portion: portionSchema,
        quantity: quantitySchema,
        time: timeSchema.default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const logged = await addFoodEntry(ctx, input);
      if (logged.outcome === 'food-not-found') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      if (logged.outcome === 'portion-not-found') {
        throw portionNotFound();
      }
      return logged.entry;
    }),
  addRecipe: accountProcedure
    .input(
      z.union([
        z.strictObject({
          date: dateSchema,
          meal: mealSchema,
          recipeId: z.string().min(1),
          servings: quantitySchema,
          time: timeSchema.default(null),
        }),
        z.strictObject({
          date: dateSchema,
          meal: mealSchema,
          recipeId: z.string().min(1),
          grams: quantitySchema,
          time: timeSchema.default(null),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const { date, meal, time, recipeId } = input;
      const logged = await addRecipeEntry(ctx, {
        date,
        meal,
        time,
        recipeId,
        amount:
          'servings' in input
            ? { servings: input.servings }
            : { grams: input.grams },
      });
      if (logged.outcome === 'recipe-not-found') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      if (logged.outcome === 'empty-recipe') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The recipe has no ingredients',
        });
      }
      return logged.entry;
    }),
  addQuick: accountProcedure
    .input(
      savingOnlyPer100g(
        z.object({
          date: dateSchema,
          meal: mealSchema,
          label: entryLabelSchema,
          nutrients: quickNutrientsSchema,
          time: timeSchema.default(null),
          saveAsFood: z.boolean().default(false),
        }),
      ),
    )
    .mutation(({ ctx, input }) => addQuickEntry(ctx, input)),
  update: accountProcedure
    .input(
      z.object({
        id: z.string().min(1),
        date: dateSchema.optional(),
        meal: mealSchema.optional(),
        time: timeSchema.optional(),
        quantity: quantitySchema.optional(),
        portion: portionSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input: { id, ...changes } }) => {
      const updated = await updateEntry(ctx, id, changes);
      switch (updated.outcome) {
        case 'not-found':
          throw entryNotFound();
        case 'no-amount':
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A quick entry has no quantity or portion',
          });
        case 'food-gone':
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'The food or recipe this entry was logged from no longer exists',
          });
        case 'portion-not-found':
          throw portionNotFound();
        case 'updated':
          return updated.entry;
      }
    }),
  remove: accountProcedure
    .input(z.string().min(1))
    .mutation(async ({ ctx, input }) => {
      if (!(await removeEntry(ctx, input))) {
        throw entryNotFound();
      }
    }),
  copyMeal: accountProcedure
    .input(
      z.object({
        fromDate: dateSchema,
        meal: mealSchema,
        toDate: dateSchema,
        toMeal: mealSchema,
      }),
    )
    .mutation(({ ctx, input }) => copyMeal(ctx, input)),
  clearMeal: accountProcedure
    .input(z.object({ date: dateSchema, meal: mealSchema }))
    .mutation(async ({ ctx, input }) => ({
      cleared: await clearDiaryMeal(ctx.db, ctx.caller.userId, input),
    })),
});
