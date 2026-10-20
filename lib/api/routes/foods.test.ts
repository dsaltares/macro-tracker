import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { importFoods } from '../../data/import-foods.ts';
import { createFixtureSource } from '../../data/sources/fixture.ts';
import { createApiKey } from '../../db/api-keys.ts';
import { type FoodWriteContext, insertFood } from '../../db/foods.ts';
import type { ApiKeyScope } from '../../domain/api-keys.ts';
import { nutrientKeys } from '../../domain/nutrition/nutrients.ts';
import type { ApiServer, RouteParams } from '../handler.ts';
import {
  createFoodRoute,
  foodByBarcodeRoute,
  foodPortionsRoute,
  foodRoute,
  searchFoodsRoute,
} from './foods.ts';

const database = migratedDatabasePerTest();

const logger = pino({ enabled: false });

let clock: FoodWriteContext;
let workDir = '';

beforeEach(async () => {
  let ids = 0;
  let seconds = 0;
  clock = {
    nextId: () => `id-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, seconds++)).toISOString(),
  };
  workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-foods-api-'));
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
  await importFoods({
    db: database(),
    sources: [createFixtureSource()],
    clock,
    logger,
    signal: new AbortController().signal,
    workDir,
  });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const server = (): ApiServer => ({ db: database(), logger, ...clock });

const keyFor = async (
  userId: string,
  scopes: ApiKeyScope[] = ['read', 'write'],
) =>
  (
    await createApiKey(
      database(),
      userId,
      { name: 'Agent', scopes },
      { now: clock.now, nextId: () => `key-${userId}-${scopes.join('-')}` },
    )
  ).key;

const request = (
  key: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
) =>
  new Request(`http://localhost/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${key}` },
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });

const withParams = (params: RouteParams) => ({
  params: Promise.resolve(params),
});

const search = async (key: string, query: string) =>
  searchFoodsRoute(server())(
    request(key, `/foods?${new URLSearchParams(query)}`),
  );

const get = async (key: string, id: string) =>
  foodRoute(server())(request(key, `/foods/${id}`), withParams({ id }));

const portions = async (key: string, id: string) =>
  foodPortionsRoute(server())(
    request(key, `/foods/${id}/portions`),
    withParams({ id }),
  );

const byBarcode = async (key: string, ean: string) =>
  foodByBarcodeRoute(server())(
    request(key, `/foods/barcode/${ean}`),
    withParams({ ean }),
  );

const create = async (key: string, body: unknown) =>
  createFoodRoute(server())(request(key, '/foods', { method: 'POST', body }));

const nutellaId = async (key: string) => {
  const { items } = await (await search(key, 'q=nutella')).json();
  return items[0].id as string;
};

const userFood = (name: string, overrides = {}) =>
  insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: 'user-1',
      barcode: null,
      name,
      brand: null,
      quantity_label: null,
      nutrients: { energy_kcal: 400, protein: 10 },
      portions: [{ label: '1 bowl', grams: 45 }],
      ...overrides,
    },
    clock,
  );

const homemadeGranola = {
  name: 'Homemade granola',
  nutrients: { energy_kcal: 450, protein: 11, carbohydrate: 60, fat: 18 },
};

describe('GET /api/v1/foods', () => {
  it('finds Nutella first, with every canonical nutrient', async () => {
    const response = await search(await keyFor('user-1'), 'q=nutella');

    expect(response.status).toBe(200);
    const { items, nextCursor } = await response.json();
    expect(nextCursor).toBeNull();
    expect(items[0]).toEqual({
      id: expect.any(String),
      source: 'off',
      name: 'Nutella',
      brand: 'Ferrero',
      quantityLabel: '400 g',
      defaultPortion: { label: '15 g', grams: 15 },
      nutrients: expect.objectContaining({
        energy_kcal: 539,
        fat: 30.9,
        protein: 6.3,
        fibre: null,
      }),
    });
    expect(Object.keys(items[0].nutrients)).toEqual(nutrientKeys);
  });

  it("pages with an opaque cursor, the caller's own foods first", async () => {
    for (let index = 0; index < 31; index++) {
      await userFood(`Granola ${index}`);
    }
    const key = await keyFor('user-1');

    const first = await (await search(key, 'q=granola')).json();
    const second = await (
      await search(key, `q=granola&cursor=${first.nextCursor}`)
    ).json();

    expect(first.items).toHaveLength(30);
    expect(
      first.items.every(({ source }: { source: string }) => source === 'user'),
    ).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.items[0]).toMatchObject({ source: 'user' });
    expect(second.items.slice(1).length).toBeGreaterThan(0);
  });

  it("never shows another user's foods", async () => {
    await userFood('Granola of user one');

    const { items } = await (
      await search(await keyFor('user-2'), 'q=granola')
    ).json();

    expect(items.map(({ name }: { name: string }) => name)).not.toContain(
      'Granola of user one',
    );
  });

  it('is an empty page for an empty query', async () => {
    expect(await (await search(await keyFor('user-1'), 'q=')).json()).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('refuses a request without a query or with a bad cursor', async () => {
    const key = await keyFor('user-1');

    expect((await search(key, '')).status).toBe(400);
    expect((await search(key, 'q=nutella&cursor=nope')).status).toBe(400);
  });

  it('needs the read scope', async () => {
    const response = await search(await keyFor('user-1', ['write']), 'q=x');

    expect(response.status).toBe(403);
  });
});

describe('GET /api/v1/foods/{id}', () => {
  it('is the food with every canonical nutrient and its portions', async () => {
    const key = await keyFor('user-1');
    const id = await nutellaId(key);

    const response = await get(key, id);

    expect(response.status).toBe(200);
    const food = await response.json();
    expect(food).toEqual({
      id,
      source: 'off',
      barcode: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      quantityLabel: '400 g',
      archived: false,
      nutrients: expect.objectContaining({
        energy_kcal: 539,
        saturated_fat: 10.6,
        vitamin_c: null,
      }),
      portions: [
        {
          id: expect.any(String),
          label: '15 g',
          grams: 15,
          source: 'upstream',
        },
        { id: null, label: '100 g', grams: 100, source: 'standard' },
        { id: null, label: '1 g', grams: 1, source: 'standard' },
        { id: null, label: '1 ml', grams: 1, source: 'standard' },
      ],
    });
    expect(Object.keys(food.nutrients)).toEqual(nutrientKeys);
  });

  it("is not found for an unknown id or another user's food", async () => {
    const id = await userFood('Granola of user one');
    const key = await keyFor('user-2');

    for (const response of [await get(key, id), await get(key, 'nope')]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: 'NOT_FOUND' },
      });
    }
  });
});

describe('GET /api/v1/foods/{id}/portions', () => {
  it('lists the portions the caller sees, standard ones last', async () => {
    const key = await keyFor('user-1');
    const id = await userFood('Granola', {
      portions: [{ label: '1 bowl', grams: 45 }],
    });

    const response = await portions(key, id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        { id: expect.any(String), label: '1 bowl', grams: 45, source: 'user' },
        { id: null, label: '100 g', grams: 100, source: 'standard' },
        { id: null, label: '1 g', grams: 1, source: 'standard' },
        { id: null, label: '1 ml', grams: 1, source: 'standard' },
      ],
      nextCursor: null,
    });
  });

  it("is not found for another user's food", async () => {
    const id = await userFood('Granola');

    expect((await portions(await keyFor('user-2'), id)).status).toBe(404);
  });
});

describe('GET /api/v1/foods/barcode/{ean}', () => {
  it('finds a reference food by its EAN-13', async () => {
    const response = await byBarcode(await keyFor('user-1'), '3017620422003');

    expect(response.status).toBe(200);
    const food = await response.json();
    expect(food).toMatchObject({ name: 'Nutella', source: 'off' });
    expect(Object.keys(food.nutrients)).toEqual(nutrientKeys);
  });

  it('normalises a UPC-A to EAN-13', async () => {
    const response = await byBarcode(await keyFor('user-1'), '035650166738');

    expect(await response.json()).toMatchObject({
      name: 'Peanut butter cups',
      barcode: '0035650166738',
    });
  });

  it("prefers the caller's own food to a reference one", async () => {
    await userFood('My Nutella', { barcode: '3017620422003' });

    expect(
      await (await byBarcode(await keyFor('user-1'), '3017620422003')).json(),
    ).toMatchObject({ name: 'My Nutella', source: 'user' });
    expect(
      await (await byBarcode(await keyFor('user-2'), '3017620422003')).json(),
    ).toMatchObject({ name: 'Nutella', source: 'off' });
  });

  it('is not found for a valid barcode nobody has', async () => {
    const response = await byBarcode(await keyFor('user-1'), '4006381333931');

    expect(response.status).toBe(404);
  });

  it('refuses what is not a barcode', async () => {
    const response = await byBarcode(await keyFor('user-1'), '12345');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        issues: [{ path: ['ean'], message: expect.any(String) }],
      },
    });
  });
});

describe('POST /api/v1/foods', () => {
  it('creates a user food only its owner sees', async () => {
    const key = await keyFor('user-1');

    const response = await create(key, {
      ...homemadeGranola,
      brand: '  Grandma  ',
      barcode: '035650166738',
      portions: [{ label: '1 bowl', grams: 45 }],
    });

    expect(response.status).toBe(201);
    const food = await response.json();
    expect(food).toEqual({
      id: expect.any(String),
      source: 'user',
      barcode: '0035650166738',
      name: 'Homemade granola',
      brand: 'Grandma',
      quantityLabel: null,
      archived: false,
      nutrients: expect.objectContaining({
        ...homemadeGranola.nutrients,
        fibre: null,
      }),
      portions: [
        { id: expect.any(String), label: '1 bowl', grams: 45, source: 'user' },
        { id: null, label: '100 g', grams: 100, source: 'standard' },
        { id: null, label: '1 g', grams: 1, source: 'standard' },
        { id: null, label: '1 ml', grams: 1, source: 'standard' },
      ],
    });
    expect((await get(key, food.id)).status).toBe(200);
    expect((await get(await keyFor('user-2'), food.id)).status).toBe(404);
  });

  it('takes a name and nutrients alone', async () => {
    const response = await create(await keyFor('user-1'), homemadeGranola);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      brand: null,
      barcode: null,
      quantityLabel: null,
    });
  });

  it('refuses a second food of the caller with the same barcode', async () => {
    const key = await keyFor('user-1');
    await create(key, { ...homemadeGranola, barcode: '3017620422003' });

    const response = await create(key, {
      ...homemadeGranola,
      barcode: '3017620422003',
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'CONFLICT' },
    });
  });

  it('refuses an invalid food with its issues', async () => {
    const response = await create(await keyFor('user-1'), {
      name: '',
      nutrients: { protein: 120 },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'INVALID_REQUEST',
        issues: expect.arrayContaining([
          expect.objectContaining({ path: ['name'] }),
          expect.objectContaining({ path: ['nutrients', 'protein'] }),
        ]),
      },
    });
  });

  it('needs the write scope', async () => {
    const response = await create(
      await keyFor('user-1', ['read']),
      homemadeGranola,
    );

    expect(response.status).toBe(403);
  });
});
