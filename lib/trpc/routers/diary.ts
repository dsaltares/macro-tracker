import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  clearDiaryMeal,
  copyDiaryMeal,
  diaryDay,
  frequentFoods,
  logFood,
  logQuickEntry,
  logRecipe,
  recentFoods,
  removeDiaryEntry,
  updateDiaryEntry,
} from '../../db/diary.ts';
import { isDate } from '../../domain/dates.ts';
import {
  dayTotals,
  maxEntryLabelLength,
  meals,
  mealTotals,
  quickEntryNutrients,
} from '../../domain/diary/entries.ts';
import { nutrientVectorSchema } from '../../domain/foods/source-food.ts';
import { accountProcedure, router } from '../trpc.ts';

const dateInput = z.string().refine(isDate, { message: 'Not a date' });
const mealInput = z.enum(meals);
const timeInput = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Not a time' })
  .nullable();
const quantityInput = z.number().positive();
const portionInput = z.string().min(1);

const quickNutrientsInput = z.union([
  z.strictObject({
    per100g: nutrientVectorSchema,
    grams: z.number().positive(),
  }),
  z.strictObject({ totals: nutrientVectorSchema }),
]);

const entryNotFound = () => new TRPCError({ code: 'NOT_FOUND' });

const portionNotFound = () =>
  new TRPCError({
    code: 'BAD_REQUEST',
    message: 'The food has no portion with this label',
  });

export const diaryRouter = router({
  day: accountProcedure.input(dateInput).query(async ({ ctx, input }) => {
    const entries = await diaryDay(ctx.db, ctx.caller.userId, input);
    const totals = mealTotals(entries);
    return {
      date: input,
      meals: meals.map((meal) => ({
        meal,
        entries: entries.filter((entry) => entry.meal === meal),
        totals: totals[meal],
      })),
      totals: dayTotals(entries),
    };
  }),
  recentFoods: accountProcedure.query(({ ctx }) =>
    recentFoods(ctx.db, ctx.caller.userId),
  ),
  frequentFoods: accountProcedure
    .input(dateInput)
    .query(({ ctx, input }) => frequentFoods(ctx.db, ctx.caller.userId, input)),
  addFood: accountProcedure
    .input(
      z.object({
        date: dateInput,
        meal: mealInput,
        foodId: z.string().min(1),
        portion: portionInput,
        quantity: quantityInput,
        time: timeInput.default(null),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const logged = await logFood(ctx.db, ctx.caller.userId, input, ctx);
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
          date: dateInput,
          meal: mealInput,
          recipeId: z.string().min(1),
          servings: quantityInput,
          time: timeInput.default(null),
        }),
        z.strictObject({
          date: dateInput,
          meal: mealInput,
          recipeId: z.string().min(1),
          grams: quantityInput,
          time: timeInput.default(null),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      const { date, meal, time, recipeId } = input;
      const logged = await logRecipe(
        ctx.db,
        ctx.caller.userId,
        {
          date,
          meal,
          time,
          recipeId,
          amount:
            'servings' in input
              ? { servings: input.servings }
              : { grams: input.grams },
        },
        ctx,
      );
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
      z
        .object({
          date: dateInput,
          meal: mealInput,
          label: z.string().trim().min(1).max(maxEntryLabelLength),
          nutrients: quickNutrientsInput,
          time: timeInput.default(null),
          saveAsFood: z.boolean().default(false),
        })
        .refine(
          ({ saveAsFood, nutrients }) => !saveAsFood || 'per100g' in nutrients,
          {
            message: 'Only amounts per 100 g can be saved as a food',
            path: ['saveAsFood'],
          },
        ),
    )
    .mutation(({ ctx, input: { saveAsFood, nutrients, ...entry } }) =>
      logQuickEntry(
        ctx.db,
        ctx.caller.userId,
        {
          ...entry,
          nutrients: quickEntryNutrients(nutrients),
          foodPer100g:
            saveAsFood && 'per100g' in nutrients ? nutrients.per100g : null,
        },
        ctx,
      ),
    ),
  update: accountProcedure
    .input(
      z.object({
        id: z.string().min(1),
        date: dateInput.optional(),
        meal: mealInput.optional(),
        time: timeInput.optional(),
        quantity: quantityInput.optional(),
        portion: portionInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input: { id, ...changes } }) => {
      const updated = await updateDiaryEntry(
        ctx.db,
        ctx.caller.userId,
        id,
        changes,
        ctx.now,
      );
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
      if (!(await removeDiaryEntry(ctx.db, ctx.caller.userId, input))) {
        throw entryNotFound();
      }
    }),
  copyMeal: accountProcedure
    .input(
      z.object({
        fromDate: dateInput,
        meal: mealInput,
        toDate: dateInput,
        toMeal: mealInput,
      }),
    )
    .mutation(({ ctx, input }) =>
      copyDiaryMeal(ctx.db, ctx.caller.userId, input, ctx),
    ),
  clearMeal: accountProcedure
    .input(z.object({ date: dateInput, meal: mealInput }))
    .mutation(async ({ ctx, input }) => ({
      cleared: await clearDiaryMeal(ctx.db, ctx.caller.userId, input),
    })),
});
