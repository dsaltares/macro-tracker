import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { restClient } from '@/test/rest';
import { insertFood } from '../../db/foods.ts';
import { cursorOf } from '../pagination.ts';
import { listRecipesRoute, recipePageSize, recipeRoute } from './recipes.ts';

const database = migratedDatabasePerTest();
const { keyFor, call, app, server } = restClient(database);

let reader: string;
let oatsId: string;

const recipe = (name: string) => ({
  name,
  servings: 2,
  cookedWeightG: null,
  notes: null,
});

beforeEach(async () => {
  await database()
    .insertInto('users')
    .values(
      ['user-1', 'user-2'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
      })),
    )
    .execute();
  reader = await keyFor('user-1', ['read']);
  oatsId = await insertFood(
    database(),
    {
      source: 'off',
      source_id: '5000000000001',
      barcode: '5000000000001',
      name: 'Rolled oats',
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 380, protein: 13, carbohydrate: 60, fat: 7 },
      portions: [{ label: '1 cup', grams: 80 }],
    },
    server(),
  );
});

describe('GET /api/v1/recipes', () => {
  it("is the key's user's live recipes by name", async () => {
    const user = app('user-1');
    await user.recipe.create(recipe('Porridge'));
    const archived = await user.recipe.create(recipe('Granola'));
    await user.recipe.archive(archived);
    await user.recipe.create({ ...recipe('Flapjack'), cookedWeightG: 400 });
    await app('user-2').recipe.create(recipe('Bircher'));

    const response = await call(listRecipesRoute, { key: reader });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          id: expect.any(String),
          name: 'Flapjack',
          servings: 2,
          cookedWeightG: 400,
        },
        {
          id: expect.any(String),
          name: 'Porridge',
          servings: 2,
          cookedWeightG: null,
        },
      ],
      nextCursor: null,
    });
  });

  it('pages by the cursor it hands out', async () => {
    for (let index = 0; index <= recipePageSize; index++) {
      await app('user-1').recipe.create(
        recipe(`Recipe ${String(index).padStart(2, '0')}`),
      );
    }

    const first = await (await call(listRecipesRoute, { key: reader })).json();
    const second = await (
      await call(listRecipesRoute, {
        key: reader,
        query: { cursor: first.nextCursor },
      })
    ).json();

    expect(first.items).toHaveLength(recipePageSize);
    expect(first.nextCursor).toBe(cursorOf(recipePageSize));
    expect(second).toEqual({
      items: [expect.objectContaining({ name: `Recipe ${recipePageSize}` })],
      nextCursor: null,
    });
  });

  it('refuses a cursor it did not hand out', async () => {
    const response = await call(listRecipesRoute, {
      key: reader,
      query: { cursor: 'nope' },
    });

    expect(response.status).toBe(400);
  });
});

describe('GET /api/v1/recipes/{id}', () => {
  it('is the recipe with its ingredients and nutrients, as tRPC has it', async () => {
    const user = app('user-1');
    const id = await user.recipe.create({
      ...recipe('Porridge'),
      notes: 'Soak overnight',
    });
    await user.recipe.addIngredient({
      recipeId: id,
      ingredient: { kind: 'food', foodId: oatsId },
      portion: '1 cup',
      quantity: 2,
    });

    const response = await call(recipeRoute, { key: reader, params: { id } });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(await user.recipe.get(id));
    expect(body).toMatchObject({
      name: 'Porridge',
      notes: 'Soak overnight',
      archived: false,
      ingredients: [
        {
          kind: 'food',
          foodId: oatsId,
          recipeId: null,
          name: 'Rolled oats',
          portionLabel: '1 cup',
          quantity: 2,
          grams: 160,
        },
      ],
      nutrients: {
        grams: 160,
        total: { energy_kcal: 608 },
        perServing: { energy_kcal: 304 },
      },
      portions: [
        { label: '1 serving', grams: 80 },
        { label: '100 g', grams: 100 },
      ],
    });
  });

  it("answers 404 for another user's recipe", async () => {
    const id = await app('user-2').recipe.create(recipe('Bircher'));

    const response = await call(recipeRoute, { key: reader, params: { id } });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });
});
