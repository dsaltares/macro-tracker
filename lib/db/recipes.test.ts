import type { Insertable } from 'kysely';
import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { insertFood } from './foods.ts';
import {
  recipeIngredientsQuery,
  recipeQuery,
  userRecipesQuery,
} from './recipes.ts';
import type { RecipesTable } from './schema.ts';

const database = migratedDatabasePerTest();

let foodId: string;

const recipe = (
  id: string,
  userId: string,
  name: string,
): Insertable<RecipesTable> => ({
  id,
  user_id: userId,
  name,
  servings: 4,
  cooked_weight_g: null,
  notes: null,
  archived_at: null,
  created_at: 't',
  updated_at: 't',
});

const insertRecipes = (...rows: Insertable<RecipesTable>[]) =>
  database().insertInto('recipes').values(rows).execute();

const insertIngredient = (overrides: Record<string, unknown>) =>
  database()
    .insertInto('recipe_ingredients')
    .values({
      id: 'ingredient',
      recipe_id: 'chili',
      food_id: foodId,
      child_recipe_id: null,
      grams: 100,
      portion_label: '100 g',
      quantity: 1,
      position: 0,
      ...overrides,
    })
    .execute();

beforeEach(async () => {
  let ids = 0;
  await database()
    .insertInto('users')
    .values(
      ['alice', 'bob'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.com`,
      })),
    )
    .execute();
  foodId = await insertFood(
    database(),
    {
      source: 'off',
      source_id: '3017620422003',
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      quantity_label: null,
      nutrients: { energy_kcal: 539 },
      portions: [],
    },
    { nextId: () => `food-${++ids}`, now: () => 't' },
  );
  await insertRecipes(
    recipe('chili', 'alice', 'Chili'),
    recipe('rice', 'alice', 'Rice'),
  );
});

describe('recipes', () => {
  it.each([
    ['no servings', { servings: 0 }],
    ['a cooked weight of zero', { cooked_weight_g: 0 }],
  ])('refuses %s', async (_, overrides) => {
    await expect(
      insertRecipes({ ...recipe('stew', 'alice', 'Stew'), ...overrides }),
    ).rejects.toThrow(/CHECK/);
  });

  it('refuses a recipe for a user that does not exist', async () => {
    await expect(
      insertRecipes(recipe('stew', 'carol', 'Stew')),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("lists a user's live recipes by name, and nobody else's", async () => {
    await insertRecipes(
      recipe('apple-pie', 'alice', 'Apple pie'),
      { ...recipe('bread', 'alice', 'Bread'), archived_at: 't' },
      recipe('bobs-curry', 'bob', 'Curry'),
    );

    expect(
      (await userRecipesQuery(database(), 'alice').execute()).map(
        ({ name }) => name,
      ),
    ).toEqual(['Apple pie', 'Chili', 'Rice']);
  });

  it('reads a recipe only for its owner', async () => {
    expect(
      await recipeQuery(database(), 'alice', 'chili').executeTakeFirst(),
    ).toMatchObject({ name: 'Chili' });
    expect(
      await recipeQuery(database(), 'bob', 'chili').executeTakeFirst(),
    ).toBeUndefined();
  });
});

describe('recipe_ingredients', () => {
  it('accepts a food or a recipe', async () => {
    await insertIngredient({ id: 'nutella' });
    await insertIngredient({
      id: 'rice',
      food_id: null,
      child_recipe_id: 'rice',
      portion_label: '1 serving',
      grams: 150,
      position: 1,
    });

    expect(
      await recipeIngredientsQuery(database(), 'alice', 'chili').execute(),
    ).toMatchObject([
      { id: 'nutella', food_id: foodId, child_recipe_id: null },
      { id: 'rice', food_id: null, child_recipe_id: 'rice' },
    ]);
  });

  it('reads them in order, and only for the owner of the recipe', async () => {
    await insertIngredient({ id: 'second', position: 1 });
    await insertIngredient({ id: 'first', position: 0 });

    expect(
      (
        await recipeIngredientsQuery(database(), 'alice', 'chili').execute()
      ).map(({ id }) => id),
    ).toEqual(['first', 'second']);
    expect(
      await recipeIngredientsQuery(database(), 'bob', 'chili').execute(),
    ).toEqual([]);
  });

  it.each([
    ['neither a food nor a recipe', { food_id: null }],
    ['both a food and a recipe', { child_recipe_id: 'rice' }],
    ['the recipe itself', { food_id: null, child_recipe_id: 'chili' }],
    ['zero grams', { grams: 0 }],
    ['a zero quantity', { quantity: 0 }],
    ['no portion', { portion_label: null }],
    ['a negative position', { position: -1 }],
  ])('refuses %s', async (_, overrides) => {
    await expect(insertIngredient(overrides)).rejects.toThrow(/CHECK|NOT NULL/);
  });

  it.each([
    ['a recipe', { recipe_id: 'gone' }],
    ['a food', { food_id: 'gone' }],
    ['a child recipe', { food_id: null, child_recipe_id: 'gone' }],
  ])('refuses %s that does not exist', async (_, overrides) => {
    await expect(insertIngredient(overrides)).rejects.toThrow(/FOREIGN KEY/);
  });

  it('goes with its recipe, and with the recipe it names', async () => {
    await insertIngredient({ id: 'nutella' });
    await insertIngredient({
      id: 'in-chili',
      food_id: null,
      child_recipe_id: 'rice',
      position: 1,
    });

    await database().deleteFrom('recipes').where('id', '=', 'rice').execute();
    expect(
      await database().selectFrom('recipe_ingredients').select('id').execute(),
    ).toEqual([{ id: 'nutella' }]);

    await database().deleteFrom('recipes').where('id', '=', 'chili').execute();
    expect(
      await database().selectFrom('recipe_ingredients').select('id').execute(),
    ).toEqual([]);
  });
});
