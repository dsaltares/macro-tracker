import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { importFoods } from '../../data/import-foods.ts';
import { createFixtureSource } from '../../data/sources/fixture.ts';
import { type FoodWriteContext, insertFood } from '../../db/foods.ts';
import { createCaller } from '../root.ts';

const database = migratedDatabasePerTest();

let clock: FoodWriteContext;
let workDir = '';

beforeEach(async () => {
  let ids = 0;
  let seconds = 0;
  clock = {
    nextId: () => `id-${++ids}`,
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, seconds++)).toISOString(),
  };
  workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-diary-router-'));
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

const as = (userId: string | null) =>
  createCaller({
    db: database(),
    caller: userId === null ? null : { userId },
    ...clock,
  });

const nutellaId = async () => {
  const [food] = (await as(null).food.search({ query: 'nutella' })).foods;
  if (!food) {
    throw new Error('the fixture has no Nutella');
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

const date = '2026-10-20';

const logNutella = async (
  overrides: Partial<
    Parameters<ReturnType<typeof as>['diary']['addFood']>[0]
  > = {},
) =>
  as('user-1').diary.addFood({
    date,
    meal: 'breakfast',
    foodId: await nutellaId(),
    portion: '15 g',
    quantity: 2,
    ...overrides,
  });

const coffee = {
  date,
  meal: 'snack',
  label: 'Coffee with milk',
  nutrients: { totals: { energy_kcal: 40, protein: 2 } },
} as const;

const labelsOn = async (day: string, userId = 'user-1') =>
  Object.fromEntries(
    (await as(userId).diary.day(day)).meals.map(({ meal, entries }) => [
      meal,
      entries.map(({ label }) => label),
    ]),
  );

const setNutellaEnergy = async (energyKcal: number) =>
  database()
    .updateTable('food_nutrients')
    .set({ energy_kcal: energyKcal })
    .where('food_id', '=', await nutellaId())
    .execute();

describe('diary', () => {
  it('answers unauthorized without a caller', async () => {
    await expect(as(null).diary.day(date)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(as(null).diary.addQuick(coffee)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('diary.day', () => {
  it('is every meal, empty, on a day with nothing logged', async () => {
    expect(await as('user-1').diary.day(date)).toEqual({
      date,
      meals: [
        { meal: 'breakfast', entries: [], totals: {} },
        { meal: 'lunch', entries: [], totals: {} },
        { meal: 'dinner', entries: [], totals: {} },
        { meal: 'snack', entries: [], totals: {} },
      ],
      totals: {},
    });
  });

  it('groups the entries by meal, with meal and day totals', async () => {
    await as('user-1').diary.addQuick(coffee);
    await logNutella();
    await logNutella({ meal: 'snack', quantity: 1 });

    const day = await as('user-1').diary.day(date);

    expect(
      day.meals.map(({ meal, entries }) => [
        meal,
        entries.map(({ label }) => label),
      ]),
    ).toEqual([
      ['breakfast', ['Nutella']],
      ['lunch', []],
      ['dinner', []],
      ['snack', ['Coffee with milk', 'Nutella']],
    ]);
    expect(day.meals[0]?.totals.energy_kcal).toBeCloseTo(161.7);
    expect(day.meals[3]?.totals.energy_kcal).toBeCloseTo(40 + 80.85);
    expect(day.totals.energy_kcal).toBeCloseTo(161.7 + 40 + 80.85);
    expect(day.totals.protein).toBeCloseTo(1.89 + 2 + 0.945);
  });

  it("never shows another user's entries", async () => {
    await logNutella();

    expect(await labelsOn(date, 'user-2')).toMatchObject({ breakfast: [] });
  });

  it('refuses something that is not a date', async () => {
    await expect(as('user-1').diary.day('2026-02-30')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('diary.addFood', () => {
  it('logs a food with the snapshot its portion and quantity resolve to', async () => {
    const entry = await logNutella({ time: '08:15' });

    expect(entry).toMatchObject({
      kind: 'food',
      foodId: await nutellaId(),
      date,
      meal: 'breakfast',
      time: '08:15',
      label: 'Nutella',
      quantity: 2,
      portionLabel: '15 g',
      grams: 30,
    });
    expect(entry.nutrients.energy_kcal).toBeCloseTo(161.7);
    expect(entry.nutrients.fat).toBeCloseTo(9.27);
  });

  it('logs with no time when none is given', async () => {
    expect(await logNutella()).toMatchObject({ time: null });
  });

  it('resolves a standard portion', async () => {
    expect(await logNutella({ portion: '1 g', quantity: 50 })).toMatchObject({
      portionLabel: '1 g',
      grams: 50,
    });
  });

  it('fills energy from the macros of a food without it', async () => {
    const entry = await as('user-1').diary.addFood({
      date,
      meal: 'breakfast',
      foodId: await ownFood(),
      portion: '1 jar',
      quantity: 1,
    });

    expect(entry.nutrients.energy_kcal).toBeCloseTo(
      (5 * 4 + 20 * 4 + 4 * 9) * 2.5,
    );
  });

  it("refuses another user's food as not found", async () => {
    const foodId = await ownFood();

    await expect(
      as('user-2').diary.addFood({
        date,
        meal: 'lunch',
        foodId,
        portion: '1 jar',
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses a portion the food does not have', async () => {
    await expect(logNutella({ portion: '1 jar' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('refuses a quantity that is not positive and a time that is not one', async () => {
    await expect(logNutella({ quantity: 0 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(logNutella({ time: '24:00' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('diary.addQuick', () => {
  it('logs typed totals as they are, with energy from the macros if missing', async () => {
    const user = as('user-1');

    expect(await user.diary.addQuick(coffee)).toMatchObject({
      kind: 'quick',
      foodId: null,
      label: 'Coffee with milk',
      quantity: null,
      portionLabel: null,
      grams: null,
      nutrients: { energy_kcal: 40, protein: 2 },
    });
    expect(
      (
        await user.diary.addQuick({
          ...coffee,
          nutrients: { totals: { protein: 10, fat: 1 } },
        })
      ).nutrients,
    ).toEqual({ protein: 10, fat: 1, energy_kcal: 49 });
  });

  it('logs per 100 g amounts for the grams eaten', async () => {
    const entry = await as('user-1').diary.addQuick({
      ...coffee,
      label: '  Croissant ',
      nutrients: { per100g: { energy_kcal: 400, fat: 20 }, grams: 60 },
    });

    expect(entry).toMatchObject({
      label: 'Croissant',
      grams: null,
      nutrients: { energy_kcal: 240, fat: 12 },
    });
  });

  it('refuses a nutrient that is not in the canon or a negative amount', async () => {
    const user = as('user-1');

    await expect(
      user.diary.addQuick({
        ...coffee,
        nutrients: { totals: { gluten: 1 } as never },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      user.diary.addQuick({
        ...coffee,
        nutrients: { totals: { protein: -1 } },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('diary.update', () => {
  it('re-resolves the snapshot from the current food on a quantity change', async () => {
    const { id } = await logNutella();
    await setNutellaEnergy(600);

    const entry = await as('user-1').diary.update({ id, quantity: 3 });

    expect(entry).toMatchObject({ quantity: 3, grams: 45 });
    expect(entry.nutrients.energy_kcal).toBeCloseTo(270);
    expect(entry.nutrients.fat).toBeCloseTo(13.905);
  });

  it('re-resolves on a portion change, keeping the quantity', async () => {
    const { id } = await logNutella();

    const entry = await as('user-1').diary.update({ id, portion: '100 g' });

    expect(entry).toMatchObject({
      quantity: 2,
      portionLabel: '100 g',
      grams: 200,
    });
    expect(entry.nutrients.energy_kcal).toBeCloseTo(1078);
  });

  it('keeps the logged weight of a portion the food no longer has', async () => {
    const foodId = await ownFood();
    const user = as('user-1');
    const { id } = await user.diary.addFood({
      date,
      meal: 'breakfast',
      foodId,
      portion: '1 jar',
      quantity: 1,
    });
    await database()
      .deleteFrom('food_portions')
      .where('food_id', '=', foodId)
      .execute();

    expect(await user.diary.update({ id, quantity: 2 })).toMatchObject({
      portionLabel: '1 jar',
      grams: 500,
    });
  });

  it('keeps the snapshot when the entry moves', async () => {
    const logged = await logNutella({ time: '08:15' });
    await setNutellaEnergy(600);

    const moved = await as('user-1').diary.update({
      id: logged.id,
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
    expect(await labelsOn(date)).toMatchObject({ breakfast: [] });
  });

  it('moves a quick entry', async () => {
    const { id } = await as('user-1').diary.addQuick(coffee);

    expect(
      await as('user-1').diary.update({ id, meal: 'breakfast', time: '07:30' }),
    ).toMatchObject({
      meal: 'breakfast',
      time: '07:30',
      nutrients: { energy_kcal: 40, protein: 2 },
    });
  });

  it('refuses a quantity or portion for a quick entry', async () => {
    const { id } = await as('user-1').diary.addQuick(coffee);

    await expect(
      as('user-1').diary.update({ id, quantity: 2 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses a portion the food does not have', async () => {
    const { id } = await logNutella();

    await expect(
      as('user-1').diary.update({ id, portion: '1 jar' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses to re-resolve an entry whose food was deleted, and still moves it', async () => {
    const foodId = await ownFood();
    const user = as('user-1');
    const { id } = await user.diary.addFood({
      date,
      meal: 'breakfast',
      foodId,
      portion: '1 jar',
      quantity: 1,
    });
    await database().deleteFrom('foods').where('id', '=', foodId).execute();

    await expect(user.diary.update({ id, quantity: 2 })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(await user.diary.update({ id, meal: 'dinner' })).toMatchObject({
      foodId: null,
      meal: 'dinner',
      quantity: 1,
    });
  });

  it("answers not found for another user's entry and leaves it alone", async () => {
    const logged = await logNutella();

    await expect(
      as('user-2').diary.update({ id: logged.id, meal: 'dinner' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await labelsOn(date)).toMatchObject({ breakfast: ['Nutella'] });
  });
});

describe('diary.remove', () => {
  it('removes an entry', async () => {
    const { id } = await logNutella();

    await as('user-1').diary.remove(id);

    expect(await labelsOn(date)).toMatchObject({ breakfast: [] });
  });

  it("answers not found for another user's entry and leaves it alone", async () => {
    const { id } = await logNutella();

    await expect(as('user-2').diary.remove(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await labelsOn(date)).toMatchObject({ breakfast: ['Nutella'] });
  });
});

describe('diary.copyMeal', () => {
  it('copies a meal to another date and meal, snapshots and all', async () => {
    const user = as('user-1');
    const nutella = await logNutella({ time: '08:15' });
    await user.diary.addQuick({ ...coffee, meal: 'breakfast' });
    await user.diary.addQuick(coffee);
    await setNutellaEnergy(600);

    const copies = await user.diary.copyMeal({
      fromDate: date,
      meal: 'breakfast',
      toDate: '2026-10-21',
      toMeal: 'lunch',
    });

    expect(copies).toMatchObject([
      {
        kind: 'food',
        foodId: nutella.foodId,
        date: '2026-10-21',
        meal: 'lunch',
        time: '08:15',
        quantity: 2,
        grams: 30,
        nutrients: nutella.nutrients,
      },
      { kind: 'quick', label: 'Coffee with milk', meal: 'lunch' },
    ]);
    expect(new Set(copies.map(({ id }) => id)).has(nutella.id)).toBe(false);
    expect(await labelsOn('2026-10-21')).toMatchObject({
      breakfast: [],
      lunch: ['Nutella', 'Coffee with milk'],
    });
    expect(await labelsOn(date)).toMatchObject({
      breakfast: ['Nutella', 'Coffee with milk'],
      snack: ['Coffee with milk'],
    });
  });

  it('copies nothing from an empty meal', async () => {
    expect(
      await as('user-1').diary.copyMeal({
        fromDate: date,
        meal: 'dinner',
        toDate: '2026-10-21',
        toMeal: 'dinner',
      }),
    ).toEqual([]);
  });

  it("never copies another user's entries", async () => {
    await logNutella();

    expect(
      await as('user-2').diary.copyMeal({
        fromDate: date,
        meal: 'breakfast',
        toDate: '2026-10-21',
        toMeal: 'breakfast',
      }),
    ).toEqual([]);
    expect(await labelsOn('2026-10-21')).toMatchObject({ breakfast: [] });
  });
});

describe('snapshots', () => {
  it('leave a logged entry alone when its food is edited afterwards', async () => {
    const logged = await logNutella();

    await setNutellaEnergy(600);
    await database()
      .updateTable('foods')
      .set({ name: 'Nutella (new recipe)' })
      .where('id', '=', await nutellaId())
      .execute();

    const [entry] =
      (await as('user-1').diary.day(date)).meals[0]?.entries ?? [];
    expect(entry).toEqual(logged);
  });
});
