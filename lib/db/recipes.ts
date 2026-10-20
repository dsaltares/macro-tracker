import type { Kysely, Selectable, Transaction } from 'kysely';
import type { Portion } from '../domain/foods/portions.ts';
import type { NutrientVector } from '../domain/nutrition/vector.ts';
import { forGrams, withEnergy } from '../domain/nutrition/vector.ts';
import type { RecipeFields } from '../domain/recipes/recipe-fields.ts';
import {
  canNest,
  type NestingFacts,
  type RecipeAsFood,
  type RecipeNutrients,
  recipeAsFood,
  recipeNutrients,
} from '../domain/recipes/recipes.ts';
import { findFood } from './food-search.ts';
import type { FoodWriteContext } from './foods.ts';
import type {
  Database,
  RecipeIngredientsTable,
  RecipesTable,
} from './schema.ts';

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

export const liveRecipeQuery = (db: Reader, userId: string, recipeId: string) =>
  recipeQuery(db, userId, recipeId).where('archived_at', 'is', null);

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

export const liveRecipeIngredientQuery = (
  db: Reader,
  userId: string,
  ingredientId: string,
) =>
  db
    .selectFrom('recipe_ingredients')
    .innerJoin('recipes', 'recipes.id', 'recipe_ingredients.recipe_id')
    .selectAll('recipe_ingredients')
    .where('recipe_ingredients.id', '=', ingredientId)
    .where('recipes.user_id', '=', userId)
    .where('recipes.archived_at', 'is', null);

export const containedRecipeQuery = (db: Reader, recipeId: string) =>
  db
    .selectFrom('recipe_ingredients')
    .select('id')
    .where('recipe_id', '=', recipeId)
    .where('child_recipe_id', 'is not', null)
    .limit(1);

export const containingRecipeQuery = (db: Reader, recipeId: string) =>
  db
    .selectFrom('recipe_ingredients')
    .select('id')
    .where('child_recipe_id', '=', recipeId)
    .limit(1);

export const lastPositionQuery = (db: Reader, recipeId: string) =>
  db
    .selectFrom('recipe_ingredients')
    .select(({ fn }) => fn.max('position').as('position'))
    .where('recipe_id', '=', recipeId);

export type RecipeSummary = {
  id: string;
  name: string;
  servings: number;
  cookedWeightG: number | null;
};

export type IngredientKind = 'food' | 'recipe';

export type Ingredient = {
  id: string;
  kind: IngredientKind;
  foodId: string | null;
  recipeId: string | null;
  name: string;
  portionLabel: string;
  quantity: number;
  grams: number;
  per100g: NutrientVector;
  nutrients: NutrientVector;
};

export type RecipeDetail = RecipeSummary & {
  notes: string | null;
  archived: boolean;
  ingredients: Ingredient[];
  nutrients: RecipeNutrients;
  portions: Portion[];
};

export type RecipeFood = RecipeAsFood & {
  id: string;
  name: string;
  archived: boolean;
};

type IngredientSource = {
  name: string;
  nutrients: NutrientVector;
  portions: readonly Portion[];
};

const recipeSummary = (row: Selectable<RecipesTable>): RecipeSummary => ({
  id: row.id,
  name: row.name,
  servings: row.servings,
  cookedWeightG: row.cooked_weight_g,
});

const recipeOf = (row: Selectable<RecipesTable>) => ({
  servings: row.servings,
  cookedWeightG: row.cooked_weight_g,
});

const ingredientOf = (
  row: Selectable<RecipeIngredientsTable>,
  source: IngredientSource,
): Ingredient => ({
  id: row.id,
  kind: row.food_id === null ? 'recipe' : 'food',
  foodId: row.food_id,
  recipeId: row.child_recipe_id,
  name: source.name,
  portionLabel: row.portion_label,
  quantity: row.quantity,
  grams: row.grams,
  per100g: withEnergy(source.nutrients),
  nutrients: forGrams(withEnergy(source.nutrients), row.grams),
});

const ingredientSource = async (
  db: Kysely<Database>,
  userId: string,
  row: Pick<Selectable<RecipeIngredientsTable>, 'food_id' | 'child_recipe_id'>,
): Promise<IngredientSource | null> => {
  if (row.food_id !== null) {
    return findFood({ db, userId }, row.food_id);
  }
  if (row.child_recipe_id !== null) {
    return findRecipeFood(db, userId, row.child_recipe_id);
  }
  return null;
};

const resolvedIngredients = async (
  db: Kysely<Database>,
  userId: string,
  recipeId: string,
): Promise<Ingredient[]> => {
  const rows = await recipeIngredientsQuery(db, userId, recipeId).execute();
  const resolved = await Promise.all(
    rows.map(async (row) => {
      const source = await ingredientSource(db, userId, row);
      return source === null ? [] : [ingredientOf(row, source)];
    }),
  );
  return resolved.flat();
};

export const findRecipeFood = async (
  db: Kysely<Database>,
  userId: string,
  recipeId: string,
): Promise<RecipeFood | null> => {
  const row = await recipeQuery(db, userId, recipeId).executeTakeFirst();
  if (row === undefined) {
    return null;
  }
  const ingredients = await resolvedIngredients(db, userId, recipeId);
  return {
    id: row.id,
    name: row.name,
    archived: row.archived_at !== null,
    ...recipeAsFood(recipeOf(row), ingredients),
  };
};

export const isEmptyRecipe = (recipe: RecipeAsFood) =>
  recipe.portions.some(({ grams }) => grams <= 0);

export const listRecipes = async (db: Kysely<Database>, userId: string) =>
  (await userRecipesQuery(db, userId).execute()).map(recipeSummary);

export const findRecipe = async (
  db: Kysely<Database>,
  userId: string,
  recipeId: string,
): Promise<RecipeDetail | null> => {
  const row = await recipeQuery(db, userId, recipeId).executeTakeFirst();
  if (row === undefined) {
    return null;
  }
  const ingredients = await resolvedIngredients(db, userId, recipeId);
  return {
    ...recipeSummary(row),
    notes: row.notes,
    archived: row.archived_at !== null,
    ingredients,
    nutrients: recipeNutrients(recipeOf(row), ingredients),
    portions: recipeAsFood(recipeOf(row), ingredients).portions,
  };
};

const recipeColumns = ({
  name,
  servings,
  cookedWeightG,
  notes,
}: RecipeFields) => ({
  name,
  servings,
  cooked_weight_g: cookedWeightG,
  notes,
});

export const createRecipe = async (
  db: Kysely<Database>,
  userId: string,
  fields: RecipeFields,
  { now, nextId }: FoodWriteContext,
) => {
  const id = nextId();
  const at = now();
  await db
    .insertInto('recipes')
    .values({
      id,
      user_id: userId,
      ...recipeColumns(fields),
      archived_at: null,
      created_at: at,
      updated_at: at,
    })
    .execute();
  return id;
};

export const recipeUpdate = (
  db: Kysely<Database>,
  userId: string,
  recipeId: string,
  fields: RecipeFields,
  at: string,
) =>
  db
    .updateTable('recipes')
    .set({ ...recipeColumns(fields), updated_at: at })
    .where('id', '=', recipeId)
    .where('user_id', '=', userId)
    .where('archived_at', 'is', null);

export const updateRecipe = async (
  db: Kysely<Database>,
  userId: string,
  recipeId: string,
  fields: RecipeFields,
  now: () => string,
) => {
  const { numUpdatedRows } = await recipeUpdate(
    db,
    userId,
    recipeId,
    fields,
    now(),
  ).executeTakeFirst();
  return numUpdatedRows > 0n;
};

export const recipeArchival = (
  db: Kysely<Database>,
  userId: string,
  recipeId: string,
  at: string,
) =>
  db
    .updateTable('recipes')
    .set({ archived_at: at, updated_at: at })
    .where('id', '=', recipeId)
    .where('user_id', '=', userId)
    .where('archived_at', 'is', null);

export const archiveRecipe = async (
  db: Kysely<Database>,
  userId: string,
  recipeId: string,
  now: () => string,
) => {
  const { numUpdatedRows } = await recipeArchival(
    db,
    userId,
    recipeId,
    now(),
  ).executeTakeFirst();
  return numUpdatedRows > 0n;
};

const touchRecipe = (db: Transaction<Database>, recipeId: string, at: string) =>
  db
    .updateTable('recipes')
    .set({ updated_at: at })
    .where('id', '=', recipeId)
    .execute();

const nestingFactsOf = async (
  db: Reader,
  recipeId: string,
): Promise<NestingFacts> => ({
  id: recipeId,
  containsRecipe:
    (await containedRecipeQuery(db, recipeId).executeTakeFirst()) !== undefined,
  containedInRecipe:
    (await containingRecipeQuery(db, recipeId).executeTakeFirst()) !==
    undefined,
});

const portionLabelled = (portions: readonly Portion[], label: string) =>
  portions.find((portion) => portion.label === label);

export type IngredientRef =
  | { kind: 'food'; foodId: string }
  | { kind: 'recipe'; recipeId: string };

export type IngredientToAdd = {
  recipeId: string;
  ingredient: IngredientRef;
  portion: string;
  quantity: number;
};

export type IngredientWrite =
  | { outcome: 'saved'; ingredient: Ingredient }
  | { outcome: 'recipe-not-found' }
  | { outcome: 'ingredient-not-found' }
  | { outcome: 'empty-recipe' }
  | { outcome: 'cannot-nest' }
  | { outcome: 'portion-not-found' };

const sourceToAdd = async (
  trx: Transaction<Database>,
  userId: string,
  recipeId: string,
  ingredient: IngredientRef,
): Promise<
  | { outcome: 'found'; source: IngredientSource }
  | Exclude<IngredientWrite, { outcome: 'saved' }>
> => {
  if (ingredient.kind === 'food') {
    const food = await findFood({ db: trx, userId }, ingredient.foodId);
    return food === null
      ? { outcome: 'ingredient-not-found' }
      : { outcome: 'found', source: food };
  }
  const child = await liveRecipeQuery(
    trx,
    userId,
    ingredient.recipeId,
  ).executeTakeFirst();
  if (child === undefined) {
    return { outcome: 'ingredient-not-found' };
  }
  const [parentFacts, childFacts] = await Promise.all([
    nestingFactsOf(trx, recipeId),
    nestingFactsOf(trx, child.id),
  ]);
  if (!canNest(parentFacts, childFacts)) {
    return { outcome: 'cannot-nest' };
  }
  const food = await findRecipeFood(trx, userId, child.id);
  if (food === null || isEmptyRecipe(food)) {
    return { outcome: 'empty-recipe' };
  }
  return { outcome: 'found', source: food };
};

export const addIngredient = (
  db: Kysely<Database>,
  userId: string,
  { recipeId, ingredient, portion: label, quantity }: IngredientToAdd,
  { now, nextId }: FoodWriteContext,
): Promise<IngredientWrite> =>
  db.transaction().execute(async (trx) => {
    const recipe = await liveRecipeQuery(
      trx,
      userId,
      recipeId,
    ).executeTakeFirst();
    if (recipe === undefined) {
      return { outcome: 'recipe-not-found' };
    }
    const found = await sourceToAdd(trx, userId, recipeId, ingredient);
    if (found.outcome !== 'found') {
      return found;
    }
    const portion = portionLabelled(found.source.portions, label);
    if (portion === undefined) {
      return { outcome: 'portion-not-found' };
    }
    const last = await lastPositionQuery(trx, recipeId).executeTakeFirst();
    const row = await trx
      .insertInto('recipe_ingredients')
      .values({
        id: nextId(),
        recipe_id: recipeId,
        food_id: ingredient.kind === 'food' ? ingredient.foodId : null,
        child_recipe_id:
          ingredient.kind === 'recipe' ? ingredient.recipeId : null,
        grams: portion.grams * quantity,
        portion_label: portion.label,
        quantity,
        position: (last?.position ?? -1) + 1,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await touchRecipe(trx, recipeId, now());
    return { outcome: 'saved', ingredient: ingredientOf(row, found.source) };
  });

export type IngredientChanges = {
  portion?: string | undefined;
  quantity?: number | undefined;
};

export const updateIngredient = (
  db: Kysely<Database>,
  userId: string,
  ingredientId: string,
  changes: IngredientChanges,
  now: () => string,
): Promise<IngredientWrite> =>
  db.transaction().execute(async (trx) => {
    const row = await liveRecipeIngredientQuery(
      trx,
      userId,
      ingredientId,
    ).executeTakeFirst();
    if (row === undefined) {
      return { outcome: 'ingredient-not-found' };
    }
    const source = await ingredientSource(trx, userId, row);
    if (source === null) {
      return { outcome: 'ingredient-not-found' };
    }
    const savedPortion: Portion = {
      label: row.portion_label,
      grams: row.grams / row.quantity,
    };
    const portion =
      changes.portion === undefined
        ? (portionLabelled(source.portions, row.portion_label) ?? savedPortion)
        : portionLabelled(source.portions, changes.portion);
    if (portion === undefined) {
      return { outcome: 'portion-not-found' };
    }
    if (portion.grams <= 0) {
      return { outcome: 'empty-recipe' };
    }
    const quantity = changes.quantity ?? row.quantity;
    const updated = await trx
      .updateTable('recipe_ingredients')
      .set({
        portion_label: portion.label,
        quantity,
        grams: portion.grams * quantity,
      })
      .where('id', '=', row.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await touchRecipe(trx, row.recipe_id, now());
    return { outcome: 'saved', ingredient: ingredientOf(updated, source) };
  });

export const removeIngredient = (
  db: Kysely<Database>,
  userId: string,
  ingredientId: string,
  now: () => string,
) =>
  db.transaction().execute(async (trx) => {
    const row = await liveRecipeIngredientQuery(
      trx,
      userId,
      ingredientId,
    ).executeTakeFirst();
    if (row === undefined) {
      return false;
    }
    await trx
      .deleteFrom('recipe_ingredients')
      .where('id', '=', row.id)
      .execute();
    await touchRecipe(trx, row.recipe_id, now());
    return true;
  });

export type ReorderedIngredients =
  | { outcome: 'reordered' }
  | { outcome: 'recipe-not-found' }
  | { outcome: 'not-its-ingredients' };

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length &&
  new Set(a).size === a.length &&
  b.every((id) => a.includes(id));

export const reorderIngredients = (
  db: Kysely<Database>,
  userId: string,
  recipeId: string,
  ingredientIds: readonly string[],
  now: () => string,
): Promise<ReorderedIngredients> =>
  db.transaction().execute(async (trx) => {
    const recipe = await liveRecipeQuery(
      trx,
      userId,
      recipeId,
    ).executeTakeFirst();
    if (recipe === undefined) {
      return { outcome: 'recipe-not-found' };
    }
    const current = await recipeIngredientsQuery(
      trx,
      userId,
      recipeId,
    ).execute();
    if (
      !sameIds(
        ingredientIds,
        current.map(({ id }) => id),
      )
    ) {
      return { outcome: 'not-its-ingredients' };
    }
    for (const [position, id] of ingredientIds.entries()) {
      await trx
        .updateTable('recipe_ingredients')
        .set({ position })
        .where('id', '=', id)
        .where('recipe_id', '=', recipeId)
        .execute();
    }
    await touchRecipe(trx, recipeId, now());
    return { outcome: 'reordered' };
  });
