import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  type FoodReader,
  findFood,
  findFoodByBarcode,
  searchFoods,
} from '../../db/food-search.ts';
import {
  listFoodSources,
  setFoodSourcePreferences,
} from '../../db/food-source-preferences.ts';
import { genericSources } from '../../domain/foods/sources.ts';
import type { Context } from '../context.ts';
import { publicProcedure, router, signedInProcedure } from '../trpc.ts';

const maxQueryLength = 200;

const readerOf = ({ db, caller }: Context): FoodReader => ({
  db,
  userId: caller?.userId ?? null,
});

const sourcePreferencesInput = z
  .array(z.object({ source: z.enum(genericSources), enabled: z.boolean() }))
  .refine(
    (preferences) =>
      preferences.length === genericSources.length &&
      genericSources.every((source) =>
        preferences.some((preference) => preference.source === source),
      ),
    { message: 'List every generic source exactly once' },
  );

export const foodRouter = router({
  search: publicProcedure
    .input(
      z.object({
        query: z.string().max(maxQueryLength),
        cursor: z.number().int().nonnegative().nullish(),
      }),
    )
    .query(({ ctx, input }) =>
      searchFoods(readerOf(ctx), {
        query: input.query,
        cursor: input.cursor ?? 0,
      }),
    ),
  get: publicProcedure
    .input(z.string().min(1))
    .query(async ({ ctx, input }) => {
      const food = await findFood(readerOf(ctx), input);
      if (food === null) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return food;
    }),
  byBarcode: publicProcedure
    .input(z.string())
    .query(({ ctx, input }) => findFoodByBarcode(readerOf(ctx), input)),
  sources: publicProcedure.query(({ ctx }) =>
    listFoodSources(ctx.db, ctx.caller?.userId ?? null),
  ),
  setSourcePreferences: signedInProcedure
    .input(sourcePreferencesInput)
    .mutation(async ({ ctx, input }) => {
      await setFoodSourcePreferences(ctx.db, ctx.caller.userId, input);
      return listFoodSources(ctx.db, ctx.caller.userId);
    }),
});
