import { z } from 'zod';
import type {
  Ingredient,
  RecipeDetail,
  RecipeSummary,
} from '../../db/recipes.ts';
import { findRecipe, listRecipes } from '../../services/recipes.ts';
import { apiError } from '../errors.ts';
import { apiHandler } from '../handler.ts';
import { cursorSchema, pageOfSlice, sliceAt } from '../pagination.ts';

export const recipePageSize = 50;

const summaryOf = ({ id, name, servings, cookedWeightG }: RecipeSummary) => ({
  id,
  name,
  servings,
  cookedWeightG,
});

const ingredientOf = (ingredient: Ingredient) => ({
  id: ingredient.id,
  kind: ingredient.kind,
  foodId: ingredient.foodId,
  recipeId: ingredient.recipeId,
  name: ingredient.name,
  portionLabel: ingredient.portionLabel,
  quantity: ingredient.quantity,
  grams: ingredient.grams,
  per100g: ingredient.per100g,
  nutrients: ingredient.nutrients,
});

const recipeOf = (recipe: RecipeDetail) => ({
  ...summaryOf(recipe),
  notes: recipe.notes,
  archived: recipe.archived,
  ingredients: recipe.ingredients.map(ingredientOf),
  nutrients: {
    grams: recipe.nutrients.grams,
    total: recipe.nutrients.total,
    perServing: recipe.nutrients.perServing,
    per100g: recipe.nutrients.per100g,
  },
  portions: recipe.portions.map(({ label, grams }) => ({ label, grams })),
});

export const listRecipesRoute = apiHandler({
  scope: 'read',
  input: z.object({ cursor: cursorSchema }),
  handle: async ({ context, input: { cursor } }) => {
    const slice = sliceAt(cursor, recipePageSize);
    return pageOfSlice(await listRecipes(context, slice), slice, summaryOf);
  },
});

export const recipeRoute = apiHandler({
  scope: 'read',
  params: z.object({ id: z.string().min(1) }),
  handle: async ({ context, params }) => {
    const recipe = await findRecipe(context, params.id);
    if (recipe === null) {
      throw apiError('NOT_FOUND', 'There is no recipe with this id.');
    }
    return recipeOf(recipe);
  },
});
