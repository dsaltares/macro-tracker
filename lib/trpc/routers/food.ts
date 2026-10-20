import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  addFavourite,
  favouriteFoods,
  removeFavourite,
} from '../../db/diary.ts';
import { addUserPortion, removeUserPortion } from '../../db/food-portions.ts';
import { listUserFoods } from '../../db/food-search.ts';
import {
  listFoodSources,
  setFoodSourcePreferences,
} from '../../db/food-source-preferences.ts';
import {
  archiveUserFood,
  type UserFoodWrite,
  updateUserFood,
} from '../../db/user-foods.ts';
import { maxPortionLabelLength } from '../../domain/foods/portions.ts';
import { genericSources } from '../../domain/foods/sources.ts';
import { userFoodSchema } from '../../domain/foods/user-food.ts';
import {
  createUserFood,
  findFood,
  findFoodByBarcode,
  searchFoods,
} from '../../services/foods.ts';
import { accountProcedure, publicProcedure, router } from '../trpc.ts';

const maxQueryLength = 200;

const searchInput = z.object({
  query: z.string().max(maxQueryLength),
  cursor: z.number().int().nonnegative().nullish(),
});

const savedId = (written: UserFoodWrite) => {
  if (written.outcome === 'food-not-found') {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  if (written.outcome === 'barcode-taken') {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'You already have a food with this barcode',
    });
  }
  return written.id;
};

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

const favouriteInput = z.object({
  foodId: z.string().min(1),
  favourite: z.boolean(),
});

const portionInput = z.object({
  foodId: z.string().min(1),
  label: z.string().trim().min(1).max(maxPortionLabelLength),
  grams: z.number().positive().finite(),
});

export const foodRouter = router({
  search: publicProcedure.input(searchInput).query(({ ctx, input }) =>
    searchFoods(ctx, {
      query: input.query,
      cursor: input.cursor ?? 0,
    }),
  ),
  get: publicProcedure
    .input(z.string().min(1))
    .query(async ({ ctx, input }) => {
      const food = await findFood(ctx, input);
      if (food === null) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return food;
    }),
  byBarcode: publicProcedure
    .input(z.string())
    .query(({ ctx, input }) => findFoodByBarcode(ctx, input)),
  mine: accountProcedure.input(searchInput).query(({ ctx, input }) =>
    listUserFoods(ctx.db, ctx.caller.userId, {
      query: input.query,
      cursor: input.cursor ?? 0,
    }),
  ),
  create: accountProcedure
    .input(userFoodSchema)
    .mutation(async ({ ctx, input }) =>
      savedId(await createUserFood(ctx, input)),
    ),
  update: accountProcedure
    .input(userFoodSchema.extend({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input: { id, ...food } }) =>
      savedId(await updateUserFood(ctx.db, ctx.caller.userId, id, food, ctx)),
    ),
  archive: accountProcedure
    .input(z.string().min(1))
    .mutation(async ({ ctx, input }) => {
      if (!(await archiveUserFood(ctx.db, ctx.caller.userId, input, ctx.now))) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }),
  sources: publicProcedure.query(({ ctx }) =>
    listFoodSources(ctx.db, ctx.caller?.userId ?? null),
  ),
  setSourcePreferences: accountProcedure
    .input(sourcePreferencesInput)
    .mutation(async ({ ctx, input }) => {
      await setFoodSourcePreferences(ctx.db, ctx.caller.userId, input);
      return listFoodSources(ctx.db, ctx.caller.userId);
    }),
  favourites: accountProcedure.query(({ ctx }) =>
    favouriteFoods(ctx.db, ctx.caller.userId),
  ),
  setFavourite: accountProcedure
    .input(favouriteInput)
    .mutation(async ({ ctx, input: { foodId, favourite } }) => {
      if (!favourite) {
        await removeFavourite(ctx.db, ctx.caller.userId, foodId);
        return;
      }
      const added = await addFavourite(
        ctx.db,
        ctx.caller.userId,
        foodId,
        ctx.now,
      );
      if (added.outcome === 'food-not-found') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }),
  addPortion: accountProcedure
    .input(portionInput)
    .mutation(async ({ ctx, input }) => {
      const added = await addUserPortion(
        ctx.db,
        ctx.caller.userId,
        input,
        ctx.nextId,
      );
      if (added.outcome === 'food-not-found') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      if (added.outcome === 'label-taken') {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'The food already has a portion with this label',
        });
      }
      return added.portion;
    }),
  removePortion: accountProcedure
    .input(z.string().min(1))
    .mutation(async ({ ctx, input }) => {
      if (!(await removeUserPortion(ctx.db, ctx.caller.userId, input))) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
    }),
});
