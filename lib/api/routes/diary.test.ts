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
import { createCaller } from '../../trpc/root.ts';
import type { ApiServer, RouteContext, RouteParams } from '../handler.ts';
import {
  addEntryRoute,
  addMealRoute,
  copyEntryRoute,
  copyMealRoute,
  diaryDayRoute,
  removeEntryRoute,
  updateEntryRoute,
} from './diary.ts';

const database = migratedDatabasePerTest();

let clock: FoodWriteContext;
let workDir = '';

const server = (): ApiServer => ({
  db: database(),
  ...clock,
  logger: pino({ enabled: false }),
});

beforeEach(async () => {
  let ids = 0;
  let seconds = 0;
  clock = {
    nextId: () => `id-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, seconds++)).toISOString(),
  };
  workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-diary-api-'));
  await importFoods({
    db: database(),
    sources: [createFixtureSource()],
    clock,
    logger: pino({ enabled: false }),
    signal: new AbortController().signal,
    workDir,
  });
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
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const keys = new Map<string, string>();

const keyFor = async (userId: string, scopes: ApiKeyScope[]) => {
  const cached = `${userId}:${scopes.join(',')}`;
  const known = keys.get(cached);
  if (known) {
    return known;
  }
  const { key } = await createApiKey(
    database(),
    userId,
    { name: 'Shortcuts', scopes },
    clock,
  );
  keys.set(cached, key);
  return key;
};

beforeEach(() => {
  keys.clear();
});

type Call = {
  method: string;
  path: string;
  body?: unknown;
  params?: RouteParams;
  userId?: string;
  scopes?: ApiKeyScope[];
};

type Route = (
  server: ApiServer,
) => (request: Request, context?: RouteContext) => Promise<Response>;

const call =
  (route: Route) =>
  async ({
    method,
    path,
    body,
    params = {},
    userId = 'user-1',
    scopes = method === 'GET' ? ['read'] : ['write'],
  }: Call) => {
    const response = await route(server())(
      new Request(`http://localhost/api/v1${path}`, {
        method,
        headers: {
          authorization: `Bearer ${await keyFor(userId, scopes)}`,
          'content-type': 'application/json',
        },
        body: body === undefined ? null : JSON.stringify(body),
      }),
      { params: Promise.resolve(params) },
    );
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  };

const date = '2026-10-20';

const getDay = (day: string, userId = 'user-1') =>
  call(diaryDayRoute)({
    method: 'GET',
    path: `/diary/${day}`,
    params: { date: day },
    userId,
  });

const addEntry = (body: unknown, userId = 'user-1') =>
  call(addEntryRoute)({
    method: 'POST',
    path: '/diary/entries',
    body,
    userId,
  });

const updateEntry = (id: string, body: unknown, userId = 'user-1') =>
  call(updateEntryRoute)({
    method: 'PATCH',
    path: `/diary/entries/${id}`,
    params: { id },
    body,
    userId,
  });

const removeEntry = (id: string, userId = 'user-1') =>
  call(removeEntryRoute)({
    method: 'DELETE',
    path: `/diary/entries/${id}`,
    params: { id },
    userId,
  });

const copy = (body: unknown, userId = 'user-1') =>
  call(copyMealRoute)({ method: 'POST', path: '/diary/copy', body, userId });

const copyOne = (id: string, body: unknown, userId = 'user-1') =>
  call(copyEntryRoute)({
    method: 'POST',
    path: `/diary/entries/${id}/copy`,
    params: { id },
    body,
    userId,
  });

const as = (userId: string) =>
  createCaller({ db: database(), caller: { userId }, ...clock });

const nutellaId = async () => {
  const [food] = (await as('user-1').food.search({ query: 'nutella' })).foods;
  if (!food) {
    throw new Error('the fixture has no nutella');
  }
  return food.id;
};

const ownFood = () =>
  insertFood(
    database(),
    {
      source: 'user',
      owner_user_id: 'user-1',
      barcode: null,
      name: 'Overnight oats',
      brand: null,
      quantity_label: null,
      nutrients: { protein: 5, carbohydrate: 20, fat: 4 },
      portions: [{ label: '1 jar', grams: 250 }],
    },
    clock,
  );

const oatsBowl = async () => {
  const foodId = await ownFood();
  const recipeId = await as('user-1').recipe.create({
    name: 'Oats bowl',
    servings: 2,
    cookedWeightG: null,
    notes: null,
  });
  await as('user-1').recipe.addIngredient({
    recipeId,
    ingredient: { kind: 'food', foodId },
    portion: '1 jar',
    quantity: 2,
  });
  return recipeId;
};

const nutella = async (overrides: Record<string, unknown> = {}) => ({
  kind: 'food',
  date,
  meal: 'breakfast',
  foodId: await nutellaId(),
  portion: '15 g',
  quantity: 2,
  ...overrides,
});

const logNutella = async (overrides: Record<string, unknown> = {}) => {
  const { status, body } = await addEntry(await nutella(overrides));
  expect(status).toBe(201);
  return body;
};

const coffee = {
  kind: 'quick',
  date,
  meal: 'snack',
  label: 'Coffee with milk',
  nutrients: { totals: { energy_kcal: 40, protein: 2 } },
};

const setNutellaEnergy = async (energyKcal: number) =>
  database()
    .updateTable('food_nutrients')
    .set({ energy_kcal: energyKcal })
    .where('food_id', '=', await nutellaId())
    .execute();

const labelsOn = async (day: string, userId = 'user-1') =>
  Object.fromEntries(
    (
      (await getDay(day, userId)).body as {
        meals: { meal: string; entries: { label: string }[] }[];
      }
    ).meals.map(({ meal, entries }) => [
      meal,
      entries.map(({ label }) => label),
    ]),
  );

describe('scopes', () => {
  it('refuses every write with a read-only key, and writes nothing', async () => {
    const { id } = await logNutella();
    const readOnly = { userId: 'user-1', scopes: ['read'] as ApiKeyScope[] };

    const writes = [
      await call(addEntryRoute)({
        method: 'POST',
        path: '/diary/entries',
        body: coffee,
        ...readOnly,
      }),
      await call(updateEntryRoute)({
        method: 'PATCH',
        path: `/diary/entries/${id}`,
        params: { id },
        body: { meal: 'dinner' },
        ...readOnly,
      }),
      await call(removeEntryRoute)({
        method: 'DELETE',
        path: `/diary/entries/${id}`,
        params: { id },
        ...readOnly,
      }),
      await call(copyMealRoute)({
        method: 'POST',
        path: '/diary/copy',
        body: {
          fromDate: date,
          meal: 'breakfast',
          toDate: '2026-10-21',
          toMeal: 'breakfast',
        },
        ...readOnly,
      }),
    ];

    expect(writes).toEqual(
      writes.map(() => ({
        status: 403,
        body: {
          error: expect.objectContaining({ code: 'INSUFFICIENT_SCOPE' }),
        },
      })),
    );
    expect(await labelsOn(date)).toMatchObject({
      breakfast: ['Nutella'],
      snack: [],
    });
    expect(await labelsOn('2026-10-21')).toMatchObject({ breakfast: [] });
  });

  it('refuses a read with a write-only key', async () => {
    const { status } = await call(diaryDayRoute)({
      method: 'GET',
      path: `/diary/${date}`,
      params: { date },
      scopes: ['write'],
    });

    expect(status).toBe(403);
  });
});

describe('GET /api/v1/diary/{date}', () => {
  it('is every meal, empty, on a day with nothing logged', async () => {
    expect(await getDay(date)).toEqual({
      status: 200,
      body: {
        date,
        meals: [
          { meal: 'breakfast', entries: [], totals: {} },
          { meal: 'lunch', entries: [], totals: {} },
          { meal: 'dinner', entries: [], totals: {} },
          { meal: 'snack', entries: [], totals: {} },
        ],
        totals: {},
      },
    });
  });

  it('groups the entries by meal, with meal and day totals', async () => {
    await addEntry(coffee);
    const logged = await logNutella();
    await logNutella({ meal: 'snack', quantity: 1 });

    const { body: day } = await getDay(date);

    expect(await labelsOn(date)).toEqual({
      breakfast: ['Nutella'],
      lunch: [],
      dinner: [],
      snack: ['Coffee with milk', 'Nutella'],
    });
    expect(day.meals[0].entries).toEqual([logged]);
    expect(day.meals[0].totals.energy_kcal).toBeCloseTo(161.7);
    expect(day.meals[3].totals.energy_kcal).toBeCloseTo(40 + 80.85);
    expect(day.totals.energy_kcal).toBeCloseTo(161.7 + 40 + 80.85);
    expect(day.totals.protein).toBeCloseTo(1.89 + 2 + 0.945);
  });

  it("never shows another user's entries", async () => {
    await logNutella();

    expect(await labelsOn(date, 'user-2')).toMatchObject({ breakfast: [] });
  });

  it('refuses something that is not a date', async () => {
    expect(await getDay('2026-02-30')).toMatchObject({
      status: 400,
      body: {
        error: { code: 'INVALID_REQUEST', issues: [{ path: ['date'] }] },
      },
    });
  });
});

describe('POST /api/v1/diary/entries', () => {
  describe('a food', () => {
    it('logs it with the snapshot its portion and quantity resolve to', async () => {
      const entry = await logNutella({ time: '08:15' });

      expect(entry).toEqual({
        id: expect.any(String),
        kind: 'food',
        date,
        meal: 'breakfast',
        time: '08:15',
        label: 'Nutella',
        foodId: await nutellaId(),
        recipeId: null,
        quantity: 2,
        portion: '15 g',
        grams: 30,
        nutrients: expect.any(Object),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(entry.nutrients.energy_kcal).toBeCloseTo(161.7);
      expect(entry.nutrients.fat).toBeCloseTo(9.27);
    });

    it('logs with no time when none is given', async () => {
      expect(await logNutella()).toMatchObject({ time: null });
    });

    it('resolves a standard portion', async () => {
      expect(await logNutella({ portion: '1 g', quantity: 50 })).toMatchObject({
        portion: '1 g',
        grams: 50,
      });
    });

    it('fills energy from the macros of a food without it', async () => {
      const entry = await logNutella({
        foodId: await ownFood(),
        portion: '1 jar',
        quantity: 1,
      });

      expect(entry.nutrients.energy_kcal).toBeCloseTo(
        (5 * 4 + 20 * 4 + 4 * 9) * 2.5,
      );
    });

    it("refuses another user's food as not found", async () => {
      expect(
        await addEntry(
          await nutella({ foodId: await ownFood(), portion: '1 jar' }),
          'user-2',
        ),
      ).toMatchObject({ status: 404, body: { error: { code: 'NOT_FOUND' } } });
    });

    it('refuses a portion the food does not have', async () => {
      expect(await addEntry(await nutella({ portion: '1 jar' }))).toMatchObject(
        { status: 400, body: { error: { code: 'INVALID_REQUEST' } } },
      );
    });

    it('refuses a quantity that is not positive and a time that is not one', async () => {
      expect(await addEntry(await nutella({ quantity: 0 }))).toMatchObject({
        status: 400,
        body: { error: { issues: [{ path: ['quantity'] }] } },
      });
      expect(await addEntry(await nutella({ time: '24:00' }))).toMatchObject({
        status: 400,
        body: { error: { issues: [{ path: ['time'] }] } },
      });
    });
  });

  describe('a quick entry', () => {
    it('logs typed totals as they are, with energy from the macros if missing', async () => {
      expect(await addEntry(coffee)).toMatchObject({
        status: 201,
        body: {
          kind: 'quick',
          foodId: null,
          recipeId: null,
          label: 'Coffee with milk',
          quantity: null,
          portion: null,
          grams: null,
          nutrients: { energy_kcal: 40, protein: 2 },
        },
      });
      expect(
        (
          await addEntry({
            ...coffee,
            nutrients: { totals: { protein: 10, fat: 1 } },
          })
        ).body.nutrients,
      ).toEqual({ protein: 10, fat: 1, energy_kcal: 49 });
    });

    it('logs per 100 g amounts for the grams eaten', async () => {
      expect(
        await addEntry({
          ...coffee,
          label: '  Croissant ',
          nutrients: { per100g: { energy_kcal: 400, fat: 20 }, grams: 60 },
        }),
      ).toMatchObject({
        status: 201,
        body: {
          label: 'Croissant',
          grams: null,
          nutrients: { energy_kcal: 240, fat: 12 },
        },
      });
    });

    it('saves per 100 g amounts as a food of the caller’s own, alongside the entry', async () => {
      await addEntry({
        ...coffee,
        label: 'Granny’s flapjack',
        nutrients: {
          per100g: { protein: 6, fat: 20, carbohydrate: 55 },
          grams: 50,
        },
        saveAsFood: true,
      });

      expect(
        (await as('user-1').food.search({ query: 'flapjack' })).foods,
      ).toMatchObject([{ name: 'Granny’s flapjack', source: 'user' }]);
      expect(
        (await as('user-2').food.search({ query: 'flapjack' })).foods,
      ).toEqual([]);
    });

    it('refuses to save totals as a food, logging nothing', async () => {
      expect(await addEntry({ ...coffee, saveAsFood: true })).toMatchObject({
        status: 400,
        body: { error: { issues: [{ path: ['saveAsFood'] }] } },
      });
      expect(await labelsOn(date)).toMatchObject({ snack: [] });
    });

    it('refuses a nutrient that is not in the canon or a negative amount', async () => {
      expect(
        await addEntry({ ...coffee, nutrients: { totals: { gluten: 1 } } }),
      ).toMatchObject({ status: 400 });
      expect(
        await addEntry({ ...coffee, nutrients: { totals: { protein: -1 } } }),
      ).toMatchObject({ status: 400 });
    });
  });

  describe('a recipe', () => {
    it('logs servings of it as a snapshot of its vector per serving', async () => {
      const recipeId = await oatsBowl();

      expect(
        await addEntry({
          kind: 'recipe',
          date,
          meal: 'breakfast',
          recipeId,
          servings: 1.5,
        }),
      ).toMatchObject({
        status: 201,
        body: {
          kind: 'recipe',
          recipeId,
          foodId: null,
          label: 'Oats bowl',
          portion: '1 serving',
          quantity: 1.5,
          grams: 375,
          nutrients: {
            energy_kcal: 510,
            protein: 18.75,
            carbohydrate: 75,
            fat: 15,
          },
        },
      });
    });

    it('logs grams of it', async () => {
      const recipeId = await oatsBowl();

      expect(
        await addEntry({
          kind: 'recipe',
          date,
          meal: 'lunch',
          recipeId,
          grams: 150,
          time: '13:00',
        }),
      ).toMatchObject({
        status: 201,
        body: {
          portion: '100 g',
          quantity: 1.5,
          grams: 150,
          time: '13:00',
          nutrients: { energy_kcal: 204 },
        },
      });
    });

    it('refuses both servings and grams, or neither', async () => {
      const recipe = {
        kind: 'recipe',
        date,
        meal: 'lunch',
        recipeId: await oatsBowl(),
      };

      expect(
        await addEntry({ ...recipe, servings: 1, grams: 100 }),
      ).toMatchObject({ status: 400 });
      expect(await addEntry(recipe)).toMatchObject({ status: 400 });
    });

    it("answers not found for an archived recipe or another user's", async () => {
      const recipe = {
        kind: 'recipe',
        date,
        meal: 'lunch',
        recipeId: await oatsBowl(),
        servings: 1,
      };

      expect(await addEntry(recipe, 'user-2')).toMatchObject({ status: 404 });
      await as('user-1').recipe.archive(recipe.recipeId);
      expect(await addEntry(recipe)).toMatchObject({ status: 404 });
    });

    it('refuses one without ingredients', async () => {
      const recipeId = await as('user-1').recipe.create({
        name: 'Nothing',
        servings: 1,
        cookedWeightG: null,
        notes: null,
      });

      expect(
        await addEntry({
          kind: 'recipe',
          date,
          meal: 'lunch',
          recipeId,
          servings: 1,
        }),
      ).toMatchObject({
        status: 400,
        body: { error: { code: 'INVALID_REQUEST' } },
      });
    });
  });

  it('refuses an entry of no known kind, or a field it does not take', async () => {
    expect(await addEntry({ ...coffee, kind: 'meal' })).toMatchObject({
      status: 400,
    });
    expect(await addEntry({ ...coffee, foodId: 'food-1' })).toMatchObject({
      status: 400,
    });
  });
});

describe('PATCH /api/v1/diary/entries/{id}', () => {
  it('re-resolves the snapshot from the current food on a quantity change', async () => {
    const { id } = await logNutella();
    await setNutellaEnergy(600);

    const { status, body } = await updateEntry(id, { quantity: 3 });

    expect(status).toBe(200);
    expect(body).toMatchObject({ quantity: 3, grams: 45 });
    expect(body.nutrients.energy_kcal).toBeCloseTo(270);
  });

  it('re-resolves on a portion change, keeping the quantity', async () => {
    const { id } = await logNutella();

    expect(await updateEntry(id, { portion: '100 g' })).toMatchObject({
      body: { quantity: 2, portion: '100 g', grams: 200 },
    });
  });

  it('keeps the snapshot when the entry moves', async () => {
    const logged = await logNutella({ time: '08:15' });
    await setNutellaEnergy(600);

    const { body: moved } = await updateEntry(logged.id, {
      date: '2026-10-21',
      meal: 'lunch',
      time: null,
    });

    expect(moved).toEqual({
      ...logged,
      date: '2026-10-21',
      meal: 'lunch',
      time: null,
      updatedAt: expect.any(String),
    });
    expect(moved.updatedAt > logged.updatedAt).toBe(true);
    expect(await labelsOn('2026-10-21')).toMatchObject({ lunch: ['Nutella'] });
  });

  it('re-resolves a recipe entry from the current recipe on a quantity change', async () => {
    const recipeId = await oatsBowl();
    const { body: logged } = await addEntry({
      kind: 'recipe',
      date,
      meal: 'breakfast',
      recipeId,
      servings: 1,
    });

    expect(await updateEntry(logged.id, { quantity: 2 })).toMatchObject({
      body: { grams: 500, nutrients: { energy_kcal: 680 } },
    });
  });

  it('refuses a quantity or portion for a quick entry', async () => {
    const { body } = await addEntry(coffee);

    expect(await updateEntry(body.id, { quantity: 2 })).toMatchObject({
      status: 400,
      body: { error: { code: 'INVALID_REQUEST' } },
    });
  });

  it('refuses a portion the food does not have', async () => {
    const { id } = await logNutella();

    expect(await updateEntry(id, { portion: '1 jar' })).toMatchObject({
      status: 400,
    });
  });

  it('answers a conflict re-resolving an entry whose food was deleted, and still moves it', async () => {
    const foodId = await ownFood();
    const { id } = await logNutella({ foodId, portion: '1 jar', quantity: 1 });
    await database().deleteFrom('foods').where('id', '=', foodId).execute();

    expect(await updateEntry(id, { quantity: 2 })).toMatchObject({
      status: 409,
      body: { error: { code: 'CONFLICT' } },
    });
    expect(await updateEntry(id, { meal: 'dinner' })).toMatchObject({
      status: 200,
      body: { foodId: null, meal: 'dinner', quantity: 1 },
    });
  });

  it('refuses a field it does not change', async () => {
    const { id } = await logNutella();

    expect(await updateEntry(id, { label: 'Spread' })).toMatchObject({
      status: 400,
    });
  });

  it("answers not found for another user's entry and leaves it alone", async () => {
    const { id } = await logNutella();

    expect(await updateEntry(id, { meal: 'dinner' }, 'user-2')).toMatchObject({
      status: 404,
      body: { error: { code: 'NOT_FOUND' } },
    });
    expect(await labelsOn(date)).toMatchObject({ breakfast: ['Nutella'] });
  });
});

describe('DELETE /api/v1/diary/entries/{id}', () => {
  it('removes an entry', async () => {
    const { id } = await logNutella();

    expect(await removeEntry(id)).toEqual({ status: 204, body: null });
    expect(await labelsOn(date)).toMatchObject({ breakfast: [] });
  });

  it("answers not found for another user's entry and leaves it alone", async () => {
    const { id } = await logNutella();

    expect(await removeEntry(id, 'user-2')).toMatchObject({ status: 404 });
    expect(await labelsOn(date)).toMatchObject({ breakfast: ['Nutella'] });
  });
});

describe('POST /api/v1/diary/meals', () => {
  const addMeal = (body: unknown, userId = 'user-1') =>
    call(addMealRoute)({
      method: 'POST',
      path: '/diary/meals',
      body,
      userId,
    });

  it('logs every item of a meal and answers the entries', async () => {
    const recipeId = await oatsBowl();

    const { status, body } = await addMeal({
      date,
      meal: 'dinner',
      time: '20:00',
      items: [
        {
          kind: 'food',
          foodId: await nutellaId(),
          portion: '15 g',
          quantity: 2,
        },
        { kind: 'recipe', recipeId, amount: { servings: 1 } },
        {
          kind: 'quick',
          label: 'Wine',
          nutrients: { totals: { energy_kcal: 120 } },
        },
      ],
    });

    expect(status).toBe(201);
    expect(body.entries).toMatchObject([
      { kind: 'food', label: 'Nutella', portion: '15 g', time: '20:00' },
      { kind: 'recipe', label: 'Oats bowl', portion: '1 serving' },
      { kind: 'quick', label: 'Wine', nutrients: { energy_kcal: 120 } },
    ]);
    expect(await labelsOn(date)).toMatchObject({
      dinner: ['Nutella', 'Oats bowl', 'Wine'],
    });
  });

  it("answers 404 for another user's food, and logs nothing", async () => {
    const { status, body } = await addMeal(
      {
        date,
        meal: 'dinner',
        items: [
          {
            kind: 'quick',
            label: 'Wine',
            nutrients: { totals: { energy_kcal: 120 } },
          },
          {
            kind: 'food',
            foodId: await ownFood(),
            portion: '1 jar',
            quantity: 1,
          },
        ],
      },
      'user-2',
    );

    expect(status).toBe(404);
    expect(body.error.message).toContain('Item 2');
    expect(await labelsOn(date, 'user-2')).toMatchObject({ dinner: [] });
  });

  it('answers 400 for a portion the food lacks', async () => {
    const { status } = await addMeal({
      date,
      meal: 'dinner',
      items: [
        {
          kind: 'food',
          foodId: await nutellaId(),
          portion: '1 bucket',
          quantity: 1,
        },
      ],
    });

    expect(status).toBe(400);
  });

  it('refuses a read-only key', async () => {
    const { status } = await call(addMealRoute)({
      method: 'POST',
      path: '/diary/meals',
      body: { date, meal: 'dinner', items: [coffee] },
      scopes: ['read'],
    });

    expect(status).toBe(403);
  });
});

describe('POST /api/v1/diary/copy', () => {
  it('copies a meal to another date and meal, snapshots and all', async () => {
    const logged = await logNutella({ time: '08:15' });
    await addEntry({ ...coffee, meal: 'breakfast' });
    await addEntry(coffee);
    await setNutellaEnergy(600);

    const { status, body } = await copy({
      fromDate: date,
      meal: 'breakfast',
      toDate: '2026-10-21',
      toMeal: 'lunch',
    });

    expect(status).toBe(200);
    expect(body.entries).toMatchObject([
      {
        kind: 'food',
        foodId: logged.foodId,
        date: '2026-10-21',
        meal: 'lunch',
        time: '08:15',
        quantity: 2,
        portion: '15 g',
        grams: 30,
        nutrients: logged.nutrients,
      },
      { kind: 'quick', label: 'Coffee with milk', meal: 'lunch' },
    ]);
    expect(body.entries.map(({ id }: { id: string }) => id)).not.toContain(
      logged.id,
    );
    expect(await labelsOn('2026-10-21')).toMatchObject({
      lunch: ['Nutella', 'Coffee with milk'],
    });
    expect(await labelsOn(date)).toMatchObject({
      breakfast: ['Nutella', 'Coffee with milk'],
    });
  });

  it('copies nothing from an empty meal', async () => {
    expect(
      await copy({
        fromDate: date,
        meal: 'dinner',
        toDate: '2026-10-21',
        toMeal: 'dinner',
      }),
    ).toEqual({ status: 200, body: { entries: [] } });
  });

  it("never copies another user's entries", async () => {
    await logNutella();

    expect(
      await copy(
        {
          fromDate: date,
          meal: 'breakfast',
          toDate: '2026-10-21',
          toMeal: 'breakfast',
        },
        'user-2',
      ),
    ).toEqual({ status: 200, body: { entries: [] } });
    expect(await labelsOn('2026-10-21')).toMatchObject({ breakfast: [] });
  });
});

describe('POST /api/v1/diary/entries/{id}/copy', () => {
  it('copies one entry to a meal on a date, its snapshot as it is', async () => {
    const logged = await logNutella({ time: '08:15' });
    await setNutellaEnergy(600);

    const { status, body } = await copyOne(logged.id, {
      toDate: '2026-10-21',
      toMeal: 'lunch',
    });

    expect(status).toBe(201);
    expect(body).toMatchObject({
      kind: 'food',
      foodId: logged.foodId,
      date: '2026-10-21',
      meal: 'lunch',
      time: '08:15',
      quantity: 2,
      portion: '15 g',
      nutrients: logged.nutrients,
    });
    expect(body.id).not.toBe(logged.id);
    expect(await labelsOn('2026-10-21')).toMatchObject({ lunch: ['Nutella'] });
  });

  it("answers 404 for an unknown or another user's entry", async () => {
    const logged = await logNutella();

    for (const [id, userId] of [
      ['missing', 'user-1'],
      [logged.id, 'user-2'],
    ] as const) {
      const { status, body } = await copyOne(
        id,
        { toDate: '2026-10-21', toMeal: 'lunch' },
        userId,
      );
      expect(status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    }
    expect(await labelsOn('2026-10-21')).toMatchObject({ lunch: [] });
  });
});

describe('snapshots', () => {
  it('leave a logged entry alone when its food is edited afterwards', async () => {
    const logged = await logNutella();
    await setNutellaEnergy(600);

    const { body: day } = await getDay(date);

    expect(day.meals[0].entries).toEqual([logged]);
  });
});
