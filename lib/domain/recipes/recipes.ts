import { hundredGrams, type Portion } from '../foods/portions.ts';
import {
  forGrams,
  type NutrientVector,
  per100gFrom,
  scale,
  sum,
  withEnergy,
} from '../nutrition/vector.ts';

export type Recipe = {
  servings: number;
  cookedWeightG: number | null;
};

export type ResolvedIngredient = {
  grams: number;
  per100g: NutrientVector;
};

export type RecipeNutrients = {
  grams: number;
  total: NutrientVector;
  perServing: NutrientVector;
  per100g: NutrientVector;
};

export const servingLabel = '1 serving';

const ingredientGrams = (ingredients: readonly ResolvedIngredient[]) =>
  ingredients.reduce((grams, ingredient) => grams + ingredient.grams, 0);

export const recipeNutrients = (
  recipe: Recipe,
  ingredients: readonly ResolvedIngredient[],
): RecipeNutrients => {
  const total = sum(
    ingredients.map(({ grams, per100g }) =>
      forGrams(withEnergy(per100g), grams),
    ),
  );
  const grams = recipe.cookedWeightG ?? ingredientGrams(ingredients);
  return {
    grams,
    total,
    perServing: scale(total, 1 / recipe.servings),
    per100g: per100gFrom(total, grams),
  };
};

export type NestingFacts = {
  id: string;
  containsRecipe: boolean;
  containedInRecipe: boolean;
};

export const canNest = (parent: NestingFacts, child: NestingFacts) =>
  parent.id !== child.id && !child.containsRecipe && !parent.containedInRecipe;

export type RecipeAsFood = {
  nutrients: NutrientVector;
  portions: Portion[];
};

export type RecipeAmount = { servings: number } | { grams: number };

export const recipePortionOf = (
  portions: readonly Portion[],
  amount: RecipeAmount,
): { portion: Portion; quantity: number } => {
  if ('grams' in amount) {
    return {
      portion: hundredGrams,
      quantity: amount.grams / hundredGrams.grams,
    };
  }
  const [serving = hundredGrams] = portions;
  return { portion: serving, quantity: amount.servings };
};

export const recipeAsFood = (
  recipe: Recipe,
  ingredients: readonly ResolvedIngredient[],
): RecipeAsFood => {
  const { grams, per100g } = recipeNutrients(recipe, ingredients);
  return {
    nutrients: per100g,
    portions: [
      { label: servingLabel, grams: grams / recipe.servings },
      hundredGrams,
    ],
  };
};
