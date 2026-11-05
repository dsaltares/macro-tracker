import { describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { insertFood } from './foods.ts';
import { warmFoodSearch } from './search-warmup.ts';

const database = migratedDatabasePerTest();

describe('warmFoodSearch', () => {
  it('reads an empty full-text index', async () => {
    await expect(warmFoodSearch(database())).resolves.toBeUndefined();
  });

  it('reads a full-text index of many foods to its end', async () => {
    for (let index = 0; index < 50; index += 1) {
      await insertFood(
        database(),
        {
          source: 'off',
          source_id: `off-${index}`,
          barcode: null,
          name: `Food ${index}`,
          brand: null,
          quantity_label: null,
          nutrients: {},
          portions: [],
        },
        { nextId: () => `off-${index}`, now: () => '2026-11-05T12:00:00.000Z' },
      );
    }

    await expect(warmFoodSearch(database())).resolves.toBeUndefined();
  });
});
