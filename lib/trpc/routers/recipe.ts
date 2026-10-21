import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { convertMealToRecipe } from '../../db/diary.ts';
import {
  addIngredient,
  archiveRecipe,
  createRecipe,
  type IngredientWrite,
  removeIngredient,
  reorderIngredients,
  updateIngredient,
  updateRecipe,
} from '../../db/recipes.ts';
import { recipeFieldsSchema } from '../../domain/recipes/recipe-fields.ts';
import { dateSchema, mealSchema } from '../../services/diary.ts';
import { findRecipe, listRecipes } from '../../services/recipes.ts';
import { accountProcedure, router } from '../trpc.ts';

const idInput = z.string().min(1);
const portionInput = z.string().min(1);
const quantityInput = z.number().positive().finite();

const ingredientRefInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('food'), foodId: idInput }),
  z.object({ kind: z.literal('recipe'), recipeId: idInput }),
]);

const notFound = () => new TRPCError({ code: 'NOT_FOUND' });

const savedIngredient = (written: IngredientWrite) => {
  switch (written.outcome) {
    case 'recipe-not-found':
    case 'ingredient-not-found':
      throw notFound();
    case 'cannot-nest':
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'A recipe can contain a recipe, but that one cannot contain another',
      });
    case 'empty-recipe':
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The recipe has no ingredients',
      });
    case 'portion-not-found':
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The ingredient has no portion with this label',
      });
    case 'saved':
      return written.ingredient;
  }
};

export const recipeRouter = router({
  list: accountProcedure.query(({ ctx }) => listRecipes(ctx)),
  get: accountProcedure.input(idInput).query(async ({ ctx, input }) => {
    const recipe = await findRecipe(ctx, input);
    if (recipe === null) {
      throw notFound();
    }
    return recipe;
  }),
  create: accountProcedure
    .input(recipeFieldsSchema)
    .mutation(({ ctx, input }) =>
      createRecipe(ctx.db, ctx.caller.userId, input, ctx),
    ),
  update: accountProcedure
    .input(recipeFieldsSchema.extend({ id: idInput }))
    .mutation(async ({ ctx, input: { id, ...fields } }) => {
      if (
        !(await updateRecipe(ctx.db, ctx.caller.userId, id, fields, ctx.now))
      ) {
        throw notFound();
      }
    }),
  fromMeal: accountProcedure
    .input(
      z.object({
        date: dateSchema,
        meal: mealSchema,
        name: recipeFieldsSchema.shape.name,
        replace: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const created = await convertMealToRecipe(
        ctx.db,
        ctx.caller.userId,
        input,
        ctx,
      );
      if (created.outcome === 'no-ingredients') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Nothing in this meal can be an ingredient',
        });
      }
      return {
        id: created.recipeId,
        skipped: created.skipped,
        entry: created.entry,
      };
    }),
  archive: accountProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    if (!(await archiveRecipe(ctx.db, ctx.caller.userId, input, ctx.now))) {
      throw notFound();
    }
  }),
  addIngredient: accountProcedure
    .input(
      z.object({
        recipeId: idInput,
        ingredient: ingredientRefInput,
        portion: portionInput,
        quantity: quantityInput,
      }),
    )
    .mutation(async ({ ctx, input }) =>
      savedIngredient(
        await addIngredient(ctx.db, ctx.caller.userId, input, ctx),
      ),
    ),
  updateIngredient: accountProcedure
    .input(
      z.object({
        id: idInput,
        portion: portionInput.optional(),
        quantity: quantityInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input: { id, ...changes } }) =>
      savedIngredient(
        await updateIngredient(ctx.db, ctx.caller.userId, id, changes, ctx.now),
      ),
    ),
  removeIngredient: accountProcedure
    .input(idInput)
    .mutation(async ({ ctx, input }) => {
      if (
        !(await removeIngredient(ctx.db, ctx.caller.userId, input, ctx.now))
      ) {
        throw notFound();
      }
    }),
  reorder: accountProcedure
    .input(z.object({ recipeId: idInput, ingredientIds: z.array(idInput) }))
    .mutation(async ({ ctx, input }) => {
      const reordered = await reorderIngredients(
        ctx.db,
        ctx.caller.userId,
        input.recipeId,
        input.ingredientIds,
        ctx.now,
      );
      if (reordered.outcome === 'recipe-not-found') {
        throw notFound();
      }
      if (reordered.outcome === 'not-its-ingredients') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "List every one of the recipe's ingredients exactly once",
        });
      }
    }),
});
