import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { listUserFoods, searchFoods } from './food-search.ts';
import { insertFood } from './foods.ts';

const debug = vi.hoisted(() => vi.fn());

vi.mock('../logger.ts', () => ({ getLogger: () => ({ debug }) }));

const database = migratedDatabasePerTest();

beforeEach(async () => {
  let ids = 0;
  const clock = {
    nextId: () => `id-${++ids}`,
    now: () => '2026-10-20T12:00:00.000Z',
  };
  await database()
    .insertInto('users')
    .values({ id: 'alice', name: 'alice', email: 'alice@example.test' })
    .execute();
  await insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: 'alice',
      barcode: null,
      name: 'Rolled oats',
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 380, protein: 13, carbohydrate: 60, fat: 7 },
      portions: [],
    },
    clock,
  );
});

const timing = {
  match: expect.stringContaining('oats'),
  cursor: 0,
  rows: 1,
  ms: expect.any(Number),
};

describe('food search timings', () => {
  it('logs how long each search took at debug level', async () => {
    await searchFoods(
      { db: database(), userId: 'alice' },
      { query: 'oats', cursor: 0 },
    );

    expect(debug).toHaveBeenCalledExactlyOnceWith(timing, 'food search');
  });

  it('logs how long each search of the caller’s own foods took', async () => {
    await listUserFoods(database(), 'alice', { query: 'oats', cursor: 0 });

    expect(debug).toHaveBeenCalledExactlyOnceWith(timing, 'food search');
  });
});

describe('food search order', () => {
  const insertReferenceFoods = async (names: readonly string[]) => {
    let ids = 0;
    for (const name of names) {
      await insertFood(
        database(),
        {
          source: 'off',
          source_id: `off-${++ids}`,
          barcode: null,
          name,
          brand: null,
          quantity_label: null,
          nutrients: { energy_kcal: 700 },
          portions: [],
        },
        {
          nextId: () => `off-${ids}`,
          now: () => '2026-10-20T12:00:00.000Z',
        },
      );
    }
  };

  it('ranks the exact name, then the name starting with the words, then every word whole, then prefixes', async () => {
    await insertReferenceFoods([
      'Butterscot Butterscotch Tin',
      'Buttermilk',
      'Salted butter',
      'Butter, unsalted',
      'Butter',
    ]);

    const { foods } = await searchFoods(
      { db: database(), userId: null },
      { query: 'Butter', cursor: 0 },
    );

    expect(foods.map(({ name }) => name).slice(0, 3)).toEqual([
      'Butter',
      'Butter, unsalted',
      'Salted butter',
    ]);
    expect(foods.map(({ name }) => name).slice(3)).toEqual(
      expect.arrayContaining(['Butterscot Butterscotch Tin', 'Buttermilk']),
    );
  });

  it('ranks a name holding every word whole above one matching a word as a prefix', async () => {
    await insertReferenceFoods([
      'Dark chocolatey spread',
      'Chocolate, dark, 70%',
    ]);

    const { foods } = await searchFoods(
      { db: database(), userId: null },
      { query: 'dark chocolate', cursor: 0 },
    );

    expect(foods.map(({ name }) => name)).toEqual([
      'Chocolate, dark, 70%',
      'Dark chocolatey spread',
    ]);
  });

  it('ranks the user’s own foods first all the same', async () => {
    await insertReferenceFoods(['Oats']);

    const { foods } = await searchFoods(
      { db: database(), userId: 'alice' },
      { query: 'oats', cursor: 0 },
    );

    expect(foods.map(({ name }) => name)).toEqual(['Rolled oats', 'Oats']);
  });
});
