import type { Insertable } from 'kysely';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { insertFood } from './foods.ts';
import { mealEstimatorFoods } from './meal-estimator-foods.ts';
import type { RecipesTable } from './schema.ts';

vi.mock('../logger.ts', () => ({ getLogger: () => ({ debug: vi.fn() }) }));

const database = migratedDatabasePerTest();

const clock = {
  nextId: () => crypto.randomUUID(),
  now: () => '2026-10-20T12:00:00.000Z',
};

const userFood = (ownerUserId: string, name: string) =>
  insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: ownerUserId,
      barcode: null,
      name,
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 120, protein: 3, carbohydrate: 20, fat: 2 },
      portions: [{ label: '1 bowl', grams: 250 }],
    },
    clock,
  );

const recipe = (
  id: string,
  userId: string,
  name: string,
  archivedAt: string | null = null,
): Insertable<RecipesTable> => ({
  id,
  user_id: userId,
  name,
  servings: 4,
  cooked_weight_g: 1200,
  notes: null,
  archived_at: archivedAt,
  created_at: 't',
  updated_at: 't',
});

const foodsOf = (userId: string) =>
  mealEstimatorFoods({ db: database(), userId });

let alicesSoup: string;
let bobsSoup: string;

beforeEach(async () => {
  await database()
    .insertInto('users')
    .values([
      { id: 'alice', name: 'alice', email: 'alice@example.test' },
      { id: 'bob', name: 'bob', email: 'bob@example.test' },
    ])
    .execute();
  alicesSoup = await userFood('alice', 'Lentil soup');
  bobsSoup = await userFood('bob', 'Lentil soup with ham');
  await database()
    .insertInto('recipes')
    .values([
      recipe('alices-stew', 'alice', 'Lentil stew'),
      recipe('alices-old-stew', 'alice', 'Old lentil stew', 't'),
      recipe('alices-curry', 'alice', 'Chicken curry'),
      recipe('bobs-stew', 'bob', 'Lentil stew'),
    ])
    .execute();
});

describe('mealEstimatorFoods', () => {
  it('searches the caller’s foods and their live recipes matching every word', async () => {
    const { foods, recipes } = await foodsOf('alice').searchFoods('lentil');

    expect(foods.map(({ id }) => id)).toEqual([alicesSoup]);
    expect(recipes).toEqual([
      {
        id: 'alices-stew',
        name: 'Lentil stew',
        servings: 4,
        cookedWeightG: 1200,
      },
    ]);
  });

  it('finds no recipe for a query without words', async () => {
    const { recipes } = await foodsOf('alice').searchFoods(' - ');

    expect(recipes).toEqual([]);
  });

  it('reads a food of the caller’s with its portions', async () => {
    expect(await foodsOf('alice').getFood(alicesSoup)).toEqual({
      id: alicesSoup,
      name: 'Lentil soup',
      brand: null,
      quantityLabel: null,
      source: 'user',
      portions: [
        { label: '1 bowl', grams: 250 },
        { label: '100 g', grams: 100 },
        { label: '1 g', grams: 1 },
        { label: '1 ml', grams: 1 },
      ],
    });
  });

  it('reads no food of another user’s', async () => {
    expect(await foodsOf('alice').getFood(bobsSoup)).toBeNull();
  });

  it('reads no archived food', async () => {
    await database()
      .updateTable('foods')
      .set({ archived_at: 't' })
      .where('id', '=', alicesSoup)
      .execute();

    expect(await foodsOf('alice').getFood(alicesSoup)).toBeNull();
  });

  it('resolves the caller’s live foods and recipes an estimate names, and none of another user’s', async () => {
    const item = { grams: 100, confidence: 0.9, note: null };
    const { foods, recipes } = await foodsOf('alice').resolveMatches({
      items: [
        {
          ...item,
          kind: 'food',
          name: 'Soup',
          foodId: alicesSoup,
          portion: null,
        },
        {
          ...item,
          kind: 'food',
          name: 'Ham soup',
          foodId: bobsSoup,
          portion: null,
        },
        {
          ...item,
          kind: 'recipe',
          name: 'Stew',
          recipeId: 'alices-stew',
          servings: 1,
        },
        {
          ...item,
          kind: 'recipe',
          name: 'Stew',
          recipeId: 'bobs-stew',
          servings: 1,
        },
      ],
      notes: [],
    });

    expect([...foods.keys()]).toEqual([alicesSoup]);
    expect([...recipes.keys()]).toEqual(['alices-stew']);
  });
});
