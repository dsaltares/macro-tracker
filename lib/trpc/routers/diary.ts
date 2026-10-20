import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  copyDiaryMeal,
  diaryDay,
  insertDiaryEntry,
  logFood,
  removeDiaryEntry,
  updateDiaryEntry,
} from '../../db/diary.ts';
import { isDate } from '../../domain/dates.ts';
import {
  dayTotals,
  meals,
  mealTotals,
  quickEntryNutrients,
} from '../../domain/diary/entries.ts';
import { nutrientVectorSchema } from '../../domain/foods/source-food.ts';
import { accountProcedure, router } from '../trpc.ts';

const maxLabelLength = 100;

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
  addQuick: accountProcedure
    .input(
      z.object({
        date: dateInput,
        meal: mealInput,
        label: z.string().trim().min(1).max(maxLabelLength),
        nutrients: quickNutrientsInput,
        time: timeInput.default(null),
      }),
    )
    .mutation(({ ctx, input }) =>
      insertDiaryEntry(
        ctx.db,
        ctx.caller.userId,
        {
          kind: 'quick',
          date: input.date,
          meal: input.meal,
          time: input.time,
          label: input.label,
          nutrients: quickEntryNutrients(input.nutrients),
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
            message: 'The food this entry was logged from no longer exists',
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
});
