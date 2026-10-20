import type { Kysely, Transaction } from 'kysely';
import type { Database } from './schema.ts';

type Reader = Kysely<Database> | Transaction<Database>;

export const userRecipesQuery = (db: Reader, userId: string) =>
  db
    .selectFrom('recipes')
    .selectAll()
    .where('user_id', '=', userId)
    .where('archived_at', 'is', null)
    .orderBy('name');

export const recipeQuery = (db: Reader, userId: string, recipeId: string) =>
  db
    .selectFrom('recipes')
    .selectAll()
    .where('id', '=', recipeId)
    .where('user_id', '=', userId);

export const recipeIngredientsQuery = (
  db: Reader,
  userId: string,
  recipeId: string,
) =>
  db
    .selectFrom('recipe_ingredients')
    .innerJoin('recipes', 'recipes.id', 'recipe_ingredients.recipe_id')
    .selectAll('recipe_ingredients')
    .where('recipe_ingredients.recipe_id', '=', recipeId)
    .where('recipes.user_id', '=', userId)
    .orderBy('recipe_ingredients.position');
