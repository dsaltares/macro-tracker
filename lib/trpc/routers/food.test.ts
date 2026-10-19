import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { importFoods } from '../../data/import-foods.ts';
import { createFixtureSource } from '../../data/sources/fixture.ts';
import {
  type FoodWriteContext,
  insertFood,
  type UserFoodInput,
} from '../../db/foods.ts';
import { createCaller } from '../root.ts';

const database = migratedDatabasePerTest();

let clock: FoodWriteContext;
let workDir = '';

beforeEach(async () => {
  let ids = 0;
  let seconds = 0;
  clock = {
    nextId: () => `id-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 19, 12, 0, seconds++)).toISOString(),
  };
  workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-food-router-'));
  await importFoods({
    db: database(),
    sources: [createFixtureSource()],
    clock,
    logger: pino({ enabled: false }),
    signal: new AbortController().signal,
    workDir,
  });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const as = (userId: string | null) =>
  createCaller({
    db: database(),
    caller: userId === null ? null : { userId },
    ...clock,
  });

const anonymous = () => as(null);

const userFood = (overrides: Partial<UserFoodInput> = {}): Promise<string> =>
  insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: 'user-1',
      barcode: null,
      name: 'Nutella',
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 530, protein: 6, carbohydrate: 58, fat: 31 },
      portions: [{ label: '1 tsp', grams: 5 }],
      ...overrides,
    },
    clock,
  );

const namesFor = async (
  query: string,
  caller: ReturnType<typeof as> = anonymous(),
) => (await caller.food.search({ query })).foods.map(({ name }) => name);

const sourcesFor = async (
  query: string,
  caller: ReturnType<typeof as> = anonymous(),
) =>
  new Set(
    (await caller.food.search({ query })).foods.map(({ source }) => source),
  );

const idOf = async (query: string) => {
  const [food] = (await anonymous().food.search({ query })).foods;
  if (!food) {
    throw new Error(`nothing found for ${query}`);
  }
  return food.id;
};

const allGenericEnabled = [
  { source: 'ciqual', enabled: true },
  { source: 'cofid', enabled: true },
  { source: 'usda', enabled: true },
] as const;

describe('food.search', () => {
  it('finds Nutella first for "nutella"', async () => {
    const { foods } = await anonymous().food.search({ query: 'nutella' });

    expect(foods[0]).toEqual({
      id: expect.any(String),
      name: 'Nutella',
      brand: 'Ferrero',
      quantityLabel: '400 g',
      source: 'off',
      energyKcal: 539,
      protein: 6.3,
      carbohydrate: 57.5,
      fat: 30.9,
      defaultPortion: { label: '15 g', grams: 15 },
    });
    expect(foods.map(({ name }) => name)).toEqual([
      'Nutella',
      expect.stringMatching(/^Nutella /),
      expect.stringMatching(/^Nutella /),
    ]);
  });

  it('matches the last word as a prefix', async () => {
    expect((await namesFor('nute'))[0]).toBe('Nutella');
    expect(await namesFor('dark choc')).toEqual(
      expect.arrayContaining([
        'Dark chocolate 70%',
        'Dark chocolate with sea salt',
      ]),
    );
  });

  it('finds an accented name from a query without diacritics', async () => {
    expect((await namesFor('jamon serrano'))[0]).toBe('Jamón serrano');
    expect(await namesFor('creme fraiche')).toContain(
      'Crème fraîche épaisse 30 %',
    );
  });

  it('matches on the brand as well as the name', async () => {
    expect(await namesFor('ferrero')).toEqual(
      expect.arrayContaining(['Nutella', 'Nutella Biscuits']),
    );
  });

  it('defaults to 100 g for a food without portions', async () => {
    const { foods } = await anonymous().food.search({ query: 'apple pulp' });

    expect(foods[0]).toMatchObject({
      name: 'Apple, pulp and peel, raw',
      source: 'ciqual',
      brand: null,
      defaultPortion: { label: '100 g', grams: 100 },
    });
  });

  it('finds nothing for a query without words', async () => {
    expect(await anonymous().food.search({ query: ' "*- ' })).toEqual({
      foods: [],
      nextCursor: null,
    });
  });

  it('ranks a user food above a reference food with the same name', async () => {
    await userFood();

    const { foods } = await as('user-1').food.search({ query: 'nutella' });

    expect(foods.slice(0, 2)).toMatchObject([
      { name: 'Nutella', source: 'user', defaultPortion: { label: '1 tsp' } },
      { name: 'Nutella', source: 'off', brand: 'Ferrero' },
    ]);
  });

  it("never shows a user's food to anyone else", async () => {
    await userFood();

    expect(await sourcesFor('nutella', as('user-2'))).not.toContain('user');
    expect(await sourcesFor('nutella')).not.toContain('user');
  });

  it('leaves archived foods out', async () => {
    await database()
      .updateTable('foods')
      .set({ archived_at: '2026-10-19T13:00:00.000Z' })
      .where('name', '=', 'Nutella')
      .execute();

    expect(await namesFor('nutella')).not.toContain('Nutella');
  });

  it('pages thirty foods at a time', async () => {
    for (let index = 0; index < 35; index++) {
      await userFood({ name: `Overnight oats ${index}` });
    }
    const user = as('user-1');

    const first = await user.food.search({ query: 'overnight' });
    const second = await user.food.search({
      query: 'overnight',
      cursor: first.nextCursor,
    });

    expect(first.foods).toHaveLength(30);
    expect(first.nextCursor).toBe(30);
    expect(second.foods).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.foods, ...second.foods].map(({ id }) => id)).size,
    ).toBe(35);
  });

  it('leaves out the generic sources a user disabled', async () => {
    const user = as('user-1');
    expect(await sourcesFor('apple', user)).toContain('ciqual');

    await user.food.setSourcePreferences([
      { source: 'ciqual', enabled: false },
      { source: 'cofid', enabled: true },
      { source: 'usda', enabled: true },
    ]);

    const remaining = await sourcesFor('apple', user);
    expect(remaining).not.toContain('ciqual');
    expect(remaining).toContain('off');
    expect(await sourcesFor('apple', as('user-2'))).toContain('ciqual');
  });

  it("always shows a user's own foods, whatever they disabled", async () => {
    await userFood({ name: 'Apple crumble' });
    const user = as('user-1');

    await user.food.setSourcePreferences(
      allGenericEnabled.map(({ source }) => ({ source, enabled: false })),
    );

    expect(await sourcesFor('apple', user)).toEqual(new Set(['off', 'user']));
  });

  it('refuses a query longer than 200 characters', async () => {
    await expect(
      anonymous().food.search({ query: 'a'.repeat(201) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('food.get', () => {
  it('reads a food with its nutrients and portions', async () => {
    const food = await anonymous().food.get(await idOf('nutella'));

    expect(food).toMatchObject({
      source: 'off',
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      quantityLabel: '400 g',
      archived: false,
      portions: [
        { label: '15 g', grams: 15 },
        { label: '100 g', grams: 100 },
        { label: '1 g', grams: 1 },
      ],
    });
    expect(food.nutrients).toMatchObject({
      energy_kcal: 539,
      fat: 30.9,
      protein: 6.3,
    });
  });

  it('still reads an archived food', async () => {
    const id = await idOf('nutella');
    await database()
      .updateTable('foods')
      .set({ archived_at: '2026-10-19T13:00:00.000Z' })
      .where('id', '=', id)
      .execute();

    expect(await anonymous().food.get(id)).toMatchObject({
      name: 'Nutella',
      archived: true,
    });
  });

  it("reads a user's own food to them alone", async () => {
    const id = await userFood();

    expect(await as('user-1').food.get(id)).toMatchObject({
      source: 'user',
      portions: [
        { label: '1 tsp', grams: 5 },
        { label: '100 g', grams: 100 },
        { label: '1 g', grams: 1 },
      ],
    });
    await expect(as('user-2').food.get(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(anonymous().food.get(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('shows a user the portions they added to a reference food, and no one else', async () => {
    const id = await idOf('nutella');
    await database()
      .insertInto('food_portions')
      .values({
        id: 'portion-1',
        food_id: id,
        label: '1 slice of toast',
        grams: 20,
        source: 'user',
        user_id: 'user-1',
        position: 1,
      })
      .execute();

    const labelsFor = async (userId: string | null) =>
      (await as(userId).food.get(id)).portions.map(({ label }) => label);

    expect(await labelsFor('user-1')).toEqual([
      '15 g',
      '1 slice of toast',
      '100 g',
      '1 g',
    ]);
    expect(await labelsFor('user-2')).toEqual(['15 g', '100 g', '1 g']);
  });

  it('answers not found for a food that does not exist', async () => {
    await expect(anonymous().food.get('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('food.byBarcode', () => {
  it('finds a reference food by its EAN-13', async () => {
    expect(await anonymous().food.byBarcode('3017620422003')).toMatchObject({
      name: 'Nutella',
      source: 'off',
    });
  });

  it('normalises a UPC-A to EAN-13', async () => {
    expect(await anonymous().food.byBarcode('035650166738')).toMatchObject({
      name: 'Peanut butter cups',
      barcode: '0035650166738',
    });
  });

  it("prefers the caller's own food to a reference one", async () => {
    await userFood({ name: 'My Nutella', barcode: '3017620422003' });

    expect(await as('user-1').food.byBarcode('3017620422003')).toMatchObject({
      name: 'My Nutella',
      source: 'user',
    });
    expect(await as('user-2').food.byBarcode('3017620422003')).toMatchObject({
      name: 'Nutella',
      source: 'off',
    });
  });

  it('finds nothing for an archived reference food', async () => {
    await database()
      .updateTable('foods')
      .set({ archived_at: '2026-10-19T13:00:00.000Z' })
      .where('barcode', '=', '3017620422003')
      .execute();

    expect(await anonymous().food.byBarcode('3017620422003')).toBeNull();
  });

  it('finds nothing for an unknown or invalid barcode', async () => {
    expect(await anonymous().food.byBarcode('8412345678905')).toBeNull();
    expect(await anonymous().food.byBarcode('3017620422004')).toBeNull();
    expect(await anonymous().food.byBarcode('not a barcode')).toBeNull();
  });
});

describe('food.sources', () => {
  it('lists every reference source enabled, with its live foods', async () => {
    const sources = await anonymous().food.sources();

    expect(sources.map(({ source }) => source)).toEqual([
      'off',
      'ciqual',
      'cofid',
      'usda',
    ]);
    expect(sources).toEqual([
      {
        source: 'off',
        enabled: true,
        alwaysOn: true,
        foods: expect.any(Number),
      },
      { source: 'ciqual', enabled: true, alwaysOn: false, foods: 10 },
      { source: 'cofid', enabled: true, alwaysOn: false, foods: 8 },
      { source: 'usda', enabled: true, alwaysOn: false, foods: 12 },
    ]);
    expect(sources[0]?.foods).toBeGreaterThan(180);
  });

  it('leaves archived foods out of the counts', async () => {
    await database()
      .updateTable('foods')
      .set({ archived_at: '2026-10-19T13:00:00.000Z' })
      .where('source', '=', 'ciqual')
      .execute();

    expect(await anonymous().food.sources()).toContainEqual({
      source: 'ciqual',
      enabled: true,
      alwaysOn: false,
      foods: 0,
    });
  });
});

describe('food.setSourcePreferences', () => {
  it("saves a user's generic sources in their order", async () => {
    const user = as('user-1');

    const saved = await user.food.setSourcePreferences([
      { source: 'usda', enabled: true },
      { source: 'ciqual', enabled: false },
      { source: 'cofid', enabled: true },
    ]);

    expect(saved.map(({ source, enabled }) => [source, enabled])).toEqual([
      ['off', true],
      ['usda', true],
      ['ciqual', false],
      ['cofid', true],
    ]);
    expect(await user.food.sources()).toEqual(saved);
    expect(
      (await as('user-2').food.sources()).map(({ source }) => source),
    ).toEqual(['off', 'ciqual', 'cofid', 'usda']);
  });

  it('replaces what a user saved before', async () => {
    const user = as('user-1');
    await user.food.setSourcePreferences([
      { source: 'ciqual', enabled: false },
      { source: 'cofid', enabled: false },
      { source: 'usda', enabled: false },
    ]);

    await user.food.setSourcePreferences([...allGenericEnabled]);

    expect((await user.food.sources()).every(({ enabled }) => enabled)).toBe(
      true,
    );
  });

  it('refuses Open Food Facts, which is always on', async () => {
    await expect(
      as('user-1').food.setSourcePreferences([
        // @ts-expect-error Open Food Facts cannot be turned off
        { source: 'off', enabled: false },
        ...allGenericEnabled,
      ]),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses a list that misses or repeats a generic source', async () => {
    const user = as('user-1');

    await expect(
      user.food.setSourcePreferences(allGenericEnabled.slice(1)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      user.food.setSourcePreferences([
        { source: 'ciqual', enabled: true },
        { source: 'ciqual', enabled: false },
        { source: 'usda', enabled: true },
      ]),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses anyone not signed in', async () => {
    await expect(
      anonymous().food.setSourcePreferences([...allGenericEnabled]),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
