import { z } from 'zod';
import type {
  Ingredient,
  RecipeDetail,
  RecipeSummary,
} from '../../db/recipes.ts';
import { findRecipe, listRecipes } from '../../services/recipes.ts';
import { apiFailure } from '../errors.ts';
import { apiHandler } from '../handler.ts';
import { cursorSchema, pageOfSlice, sliceAt } from '../pagination.ts';
import { idSchema, page, recipe, recipeSummary } from '../schemas.ts';

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

const recipeNotFound = apiFailure(
  'NOT_FOUND',
  'There is no recipe with this id.',
);

const exampleSummary = {
  id: 'b3c5d7e9-1f2a-4b4c-8d6e-0f1a2b3c4d5e',
  name: 'Overnight oats',
  servings: 2,
  cookedWeightG: null,
};

export const listRecipesRoute = apiHandler({
  method: 'GET',
  path: '/recipes',
  operationId: 'listRecipes',
  summary: 'List recipes',
  description: 'The caller’s live recipes, by name. Pages of 50.',
  scope: 'read',
  input: z.object({
    cursor: cursorSchema.describe(
      'The nextCursor of the previous page; leave out for the first page.',
    ),
  }),
  output: page(recipeSummary),
  example: {
    input: {},
    response: { items: [exampleSummary], nextCursor: null },
  },
  handle: async ({ context, input: { cursor } }) => {
    const slice = sliceAt(cursor, recipePageSize);
    return pageOfSlice(await listRecipes(context, slice), slice, summaryOf);
  },
});

export const recipeRoute = apiHandler({
  method: 'GET',
  path: '/recipes/{id}',
  operationId: 'getRecipe',
  summary: 'Get a recipe',
  description:
    'A recipe with its ingredients, each resolved from its food or nested recipe as it is now, and its nutrients in total, per serving and per 100 g. Log it with POST /diary/entries as a recipe entry, by servings or grams. Archived recipes are readable too.',
  scope: 'read',
  params: z.object({ id: idSchema }),
  output: recipe,
  errors: [recipeNotFound],
  example: {
    params: { id: exampleSummary.id },
    response: {
      ...exampleSummary,
      notes: 'Soak overnight in the fridge.',
      archived: false,
      ingredients: [
        {
          id: 'c4d6e8f0-2a3b-4c5d-9e7f-1a2b3c4d5e6f',
          kind: 'food',
          foodId: '7d1f4c2e-9b3a-4f6e-8c5d-2a1b0c9d8e7f',
          recipeId: null,
          name: 'Porridge oats',
          portionLabel: '100 g',
          quantity: 1,
          grams: 100,
          per100g: {
            energy_kcal: 379,
            protein: 11.7,
            carbohydrate: 60.4,
            fat: 7.6,
            fibre: 9.1,
          },
          nutrients: {
            energy_kcal: 379,
            protein: 11.7,
            carbohydrate: 60.4,
            fat: 7.6,
            fibre: 9.1,
          },
        },
        {
          id: 'd5e7f9a1-3b4c-4d6e-8f0a-2b3c4d5e6f7a',
          kind: 'food',
          foodId: '8e2a5d3f-0c4b-4a7f-9d6e-3b2c1d0e9f8a',
          recipeId: null,
          name: 'Semi-skimmed milk',
          portionLabel: '1 ml',
          quantity: 200,
          grams: 200,
          per100g: {
            energy_kcal: 47,
            protein: 3.6,
            carbohydrate: 4.8,
            fat: 1.8,
          },
          nutrients: {
            energy_kcal: 94,
            protein: 7.2,
            carbohydrate: 9.6,
            fat: 3.6,
          },
        },
      ],
      nutrients: {
        grams: 300,
        total: {
          energy_kcal: 473,
          protein: 18.9,
          carbohydrate: 70,
          fat: 11.2,
          fibre: 9.1,
        },
        perServing: {
          energy_kcal: 236.5,
          protein: 9.45,
          carbohydrate: 35,
          fat: 5.6,
          fibre: 4.55,
        },
        per100g: {
          energy_kcal: 157.67,
          protein: 6.3,
          carbohydrate: 23.33,
          fat: 3.73,
          fibre: 3.03,
        },
      },
      portions: [
        { label: '1 serving', grams: 150 },
        { label: '100 g', grams: 100 },
      ],
    },
  },
  handle: async ({ context, params }) => {
    const recipe = await findRecipe(context, params.id);
    if (recipe === null) {
      throw recipeNotFound();
    }
    return recipeOf(recipe);
  },
});
