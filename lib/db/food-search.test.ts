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
