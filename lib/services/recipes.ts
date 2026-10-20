import {
  findRecipe as findRecipeFor,
  listRecipes as listRecipesFor,
} from '../db/recipes.ts';
import type { Slice } from '../db/slice.ts';
import type { ServiceContext } from './context.ts';

export const listRecipes = ({ db, caller }: ServiceContext, slice?: Slice) =>
  listRecipesFor(db, caller.userId, slice);

export const findRecipe = ({ db, caller }: ServiceContext, recipeId: string) =>
  findRecipeFor(db, caller.userId, recipeId);
