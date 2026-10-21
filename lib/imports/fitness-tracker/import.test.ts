import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { restClient } from '@/test/rest';
import { importFoods } from '../../data/import-foods.ts';
import { createFixtureSource } from '../../data/sources/fixture.ts';
import type { NutrientVector } from '../../domain/nutrition/vector.ts';
import { type Account, accountOf } from './account.ts';
import type { FitnessTracker } from './clients.ts';
import type {
  CronometerFood,
  CronometerServing,
  WeighIn,
} from './cronometer.ts';
import {
  applyImport,
  earliestWeighInPerDay,
  planImport,
  summaryOf,
} from './import.ts';
import { vectorOf } from './match.ts';

const database = migratedDatabasePerTest();
const rest = restClient(database);

let workDir = '';
let account: Account;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-ft-import-'));
  await database()
    .insertInto('users')
    .values({ id: 'user-1', name: 'user-1', email: 'user-1@example.test' })
    .execute();
  await importFoods({
    db: database(),
    sources: [createFixtureSource()],
    clock: rest.server(),
    logger: pino({ enabled: false }),
    signal: new AbortController().signal,
    workDir,
  });
  const { db, now, nextId } = rest.server();
  account = accountOf({ db, now, nextId, caller: { userId: 'user-1' } });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const cronometerAmountsOf = (vector: NutrientVector) => [
  { id: 208, amount: vector.energy_kcal ?? 0 },
  { id: 203, amount: vector.protein ?? 0 },
  {
    id: 205,
    amount: (vector.carbohydrate ?? 0) + (vector.fibre ?? 0),
  },
  { id: 291, amount: vector.fibre ?? 0 },
  { id: 204, amount: vector.fat ?? 0 },
];

const scaled = (amounts: CronometerFood['nutrients_json'], factor: number) =>
  amounts.map(({ id, amount }) => ({
    id,
    amount: amount === null ? null : amount * factor,
  }));

const grams = { name: 'g', value: 1, type: 'Weight', hidden: false };

const cronometerFoods = async (): Promise<
  Record<'eggs' | 'nutella' | 'yogurt' | 'quickAdd', CronometerFood>
> => {
  const eggs = await account.foodBySourceId('cofid', '12-911');
  const [nutella] = await account.searchFoods('nutella');
  return {
    eggs: {
      food_id: 1,
      name: 'Eggs, Chicken, Whole, Raw',
      source: 'CoFID:12-911',
      measures_json: [grams],
      nutrients_json: cronometerAmountsOf(vectorOf(eggs?.nutrients ?? {})),
    },
    nutella: {
      food_id: 2,
      name: 'Ferrero, Nutella',
      source: 'CRDB',
      measures_json: [
        grams,
        { name: 'tbsp', value: 18.5, type: 'Weight', hidden: false },
      ],
      nutrients_json: cronometerAmountsOf(vectorOf(nutella?.nutrients ?? {})),
    },
    yogurt: {
      food_id: 3,
      name: 'Goat yogurt with honey and chia',
      source: 'Custom',
      measures_json: [
        grams,
        { name: 'Serving', value: 137.1, type: 'Weight', hidden: false },
      ],
      nutrients_json: [
        { id: 208, amount: 102.7 },
        { id: 203, amount: 4.9 },
        { id: 205, amount: 9.3 },
        { id: 204, amount: 5.1 },
        { id: 301, amount: 120 },
      ],
    },
    quickAdd: {
      food_id: 4,
      name: 'Quick Add, Protein',
      source: 'CRDB',
      measures_json: [grams],
      nutrients_json: [{ id: 203, amount: 100 }],
    },
  };
};

const servingOf = (
  id: string,
  day: string,
  food: CronometerFood,
  measure: string,
  quantityGrams: number,
  overrides: Partial<CronometerServing> = {},
): CronometerServing => ({
  serving_id: id,
  day,
  time: null,
  meal_group: 'breakfast',
  food_id: food.food_id,
  measure_name: measure,
  quantity_grams: quantityGrams,
  energy_kcal: null,
  nutrients_json: scaled(food.nutrients_json, quantityGrams / 100),
  ...overrides,
});

const fitnessTracker = (
  servings: CronometerServing[],
  foods: CronometerFood[],
  weighIns: WeighIn[] = [],
): FitnessTracker => ({
  check: async () => {},
  servings: async ({ from, to }) =>
    servings.filter(({ day }) => day >= from && day <= to),
  foods: async (ids) => foods.filter(({ food_id }) => ids.includes(food_id)),
  weighIns: async () => weighIns,
});

const range = { from: '2026-09-01', to: '2026-09-30' };

const plan = (
  source: FitnessTracker,
  onProgress?: Parameters<typeof planImport>[0]['onProgress'],
) =>
  planImport({
    ...(onProgress ? { onProgress } : {}),
    fitnessTracker: source,
    account,
    range,
    timeZone: 'Europe/Madrid',
  });

describe('planImport and applyImport', () => {
  it('logs each serving through the food it matched, at Cronometer’s amounts', async () => {
    const { eggs, nutella, yogurt, quickAdd } = await cronometerFoods();
    const servings = [
      servingOf('1', '2026-09-01', eggs, 'g', 120),
      servingOf('2', '2026-09-01', nutella, 'tbsp', 37, {
        meal_group: 'snacks',
      }),
      servingOf('3', '2026-09-02', yogurt, 'Serving', 137.1, {
        meal_group: 'uncategorized',
        time: '08:15:00',
      }),
      servingOf('4', '2026-09-02', quickAdd, 'g', 30),
    ];
    const weighIns = [
      { measured_at: '2026-09-01T22:30:00.000Z', weight: 71.9 },
      { measured_at: '2026-09-02T05:00:00.000Z', weight: 71.2 },
      { measured_at: '2026-09-01T06:00:00.000Z', weight: 71.5 },
      { measured_at: '2026-09-03T07:00:00.000Z', weight: 500 },
    ];

    const planned = await plan(
      fitnessTracker(servings, [eggs, nutella, yogurt, quickAdd], weighIns),
    );

    expect(
      planned.foods.map(({ cronometer, resolution }) => [
        cronometer.name,
        resolution.kind,
      ]),
    ).toEqual([
      ['Eggs, Chicken, Whole, Raw', 'source id'],
      ['Ferrero, Nutella', 'name'],
      ['Goat yogurt with honey and chia', 'new'],
      ['Quick Add, Protein', 'quick'],
    ]);
    expect(planned.weights).toEqual([
      { date: '2026-09-01', kilograms: 71.5 },
      { date: '2026-09-02', kilograms: 71.9 },
    ]);
    expect(planned.skippedWeights).toEqual([
      { date: '2026-09-03', reason: 'out of range' },
    ]);

    const progress: string[] = [];
    const outcome = await applyImport(
      account,
      planned,
      ({ phase, done, total }) => {
        progress.push(`${phase} ${done}/${total}`);
      },
    );

    expect(outcome).toEqual({ createdFoods: 1, failedMeals: [] });
    expect(progress).toEqual([
      'logging 0/5',
      'logging 1/5',
      'logging 2/5',
      'logging 3/5',
      'logging 4/5',
      'weights 0/2',
      'weights 1/2',
    ]);
    expect(summaryOf(planned, outcome)).toMatchObject({
      days: 2,
      skippedDays: 0,
      entries: 4,
      quickEntries: 1,
      failedMeals: 0,
      weights: 2,
      skippedWeights: 1,
      importedKcal: expect.closeTo(summaryOf(planned, outcome).sourceKcal, -1),
      foods: [
        {
          sourceId: '1',
          name: 'Eggs, Chicken, Whole, Raw',
          kind: 'source id',
          matchedTo: 'Eggs, chicken, whole, raw',
        },
        {
          sourceId: '2',
          name: 'Ferrero, Nutella',
          kind: 'name',
          matchedTo: 'Nutella',
        },
        {
          sourceId: '3',
          name: 'Goat yogurt with honey and chia',
          kind: 'new',
          matchedTo: null,
        },
        {
          sourceId: '4',
          name: 'Quick Add, Protein',
          kind: 'quick',
          matchedTo: null,
        },
      ],
    });
    const first = await rest.app('user-1').diary.day('2026-09-01');
    expect(
      first.meals
        .flatMap(({ entries }) => entries)
        .map(({ label, meal, portionLabel, quantity, grams }) => ({
          label,
          meal,
          portionLabel,
          quantity,
          grams,
        })),
    ).toEqual([
      {
        label: 'Eggs, chicken, whole, raw',
        meal: 'breakfast',
        portionLabel: '1 g',
        quantity: 120,
        grams: 120,
      },
      {
        label: 'Nutella',
        meal: 'snack',
        portionLabel: '1 g',
        quantity: 37,
        grams: 37,
      },
    ]);
    const second = await rest.app('user-1').diary.day('2026-09-02');
    expect(second.meals.flatMap(({ entries }) => entries)).toMatchObject([
      {
        label: 'Quick Add, Protein',
        kind: 'quick',
        nutrients: { protein: 30 },
      },
      {
        label: 'Goat yogurt with honey and chia',
        kind: 'food',
        meal: 'snack',
        time: '08:15',
        portionLabel: 'Serving',
        quantity: 1,
        nutrients: {
          energy_kcal: expect.closeTo(140.8, 1),
          calcium: expect.closeTo(164.5, 1),
        },
      },
    ]);
  });

  it('skips the days and weights already logged, and reuses the foods it made', async () => {
    const { yogurt } = await cronometerFoods();
    const weighIns = [
      { measured_at: '2026-09-01T06:00:00.000Z', weight: 71.5 },
    ];
    await applyImport(
      account,
      await plan(
        fitnessTracker(
          [servingOf('1', '2026-09-01', yogurt, 'g', 100)],
          [yogurt],
          weighIns,
        ),
      ),
    );

    const again = await plan(
      fitnessTracker(
        [
          servingOf('1', '2026-09-01', yogurt, 'g', 100),
          servingOf('2', '2026-09-03', yogurt, 'g', 50),
        ],
        [yogurt],
        weighIns,
      ),
    );

    expect(again.skippedDays).toEqual(['2026-09-01']);
    expect(again.foods.map(({ resolution }) => resolution.kind)).toEqual([
      'own copy',
    ]);
    expect(again.meals).toMatchObject([{ date: '2026-09-03' }]);
    expect(again.weights).toEqual([]);
    expect(again.skippedWeights).toEqual([
      { date: '2026-09-01', reason: 'already logged' },
    ]);
  });

  it('logs a serving its food does not add up to as Cronometer’s totals', async () => {
    const { eggs } = await cronometerFoods();
    const off = servingOf('1', '2026-09-01', eggs, 'g', 100, {
      nutrients_json: [
        { id: 208, amount: 400 },
        { id: 203, amount: 30 },
      ],
    });

    const planned = await plan(fitnessTracker([off], [eggs]));

    expect(planned.fallbacks).toBe(1);
    expect(planned.meals[0]?.items).toEqual([
      {
        kind: 'quick',
        label: 'Eggs, Chicken, Whole, Raw',
        nutrients: { energy_kcal: 400, protein: 30 },
      },
    ]);
  });

  it('skips a serving Cronometer has no nutrients for', async () => {
    const { quickAdd } = await cronometerFoods();
    const empty = servingOf('1', '2026-09-01', quickAdd, 'g', 0, {
      nutrients_json: [],
    });

    const planned = await plan(fitnessTracker([empty], [quickAdd]));

    expect(planned.meals).toEqual([]);
    expect(planned.skippedServings).toMatchObject([
      { reason: 'Cronometer has no nutrients for it' },
    ]);
  });
});

describe('planImport progress', () => {
  it('reads, then matches each food in turn', async () => {
    const { eggs, yogurt } = await cronometerFoods();
    const progress: string[] = [];

    await plan(
      fitnessTracker(
        [
          servingOf('1', '2026-09-01', eggs, 'g', 100),
          servingOf('2', '2026-09-01', yogurt, 'g', 100),
        ],
        [eggs, yogurt],
      ),
      ({ phase, done, total }) => {
        progress.push(`${phase} ${done}/${total}`);
      },
    );

    expect(progress).toEqual(['reading 0/0', 'matching 0/2', 'matching 1/2']);
  });
});

describe('earliestWeighInPerDay', () => {
  it('keeps the first weigh-in of each local day', () => {
    expect(
      earliestWeighInPerDay(
        [
          { measured_at: '2026-09-01T23:30:00.000Z', weight: 70 },
          { measured_at: '2026-09-02T07:00:00.000Z', weight: 71 },
          { measured_at: '2026-09-01T06:00:00.000Z', weight: 72 },
        ],
        'Europe/Madrid',
      ),
    ).toEqual([
      { date: '2026-09-01', kilograms: 72 },
      { date: '2026-09-02', kilograms: 70 },
    ]);
  });
});
