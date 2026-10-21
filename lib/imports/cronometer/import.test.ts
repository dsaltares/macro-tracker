import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { restClient } from '@/test/rest';
import { importFoods } from '../../data/import-foods.ts';
import { createFixtureSource } from '../../data/sources/fixture.ts';
import { daysBetween } from '../../domain/dates.ts';
import type { NutrientVector } from '../../domain/nutrition/vector.ts';
import { type Account, accountOf } from './account.ts';
import type { Cronometer } from './client.ts';
import type { CronometerFood, DiaryEntry, Weight } from './cronometer.ts';
import {
  applyImport,
  cronometerLaunched,
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

const grams = { id: 1, name: 'g', value: 1, type: 'Weight', hidden: false };

const cronometerFoods = async (): Promise<
  Record<'eggs' | 'nutella' | 'yogurt' | 'quickAdd', CronometerFood>
> => {
  const eggs = await account.foodBySourceId('cofid', '12-911');
  const [nutella] = await account.searchFoods('nutella');
  return {
    eggs: {
      id: 1,
      name: 'Eggs, Chicken, Whole, Raw',
      source: 'CoFID:12-911',
      defaultMeasureId: 1,
      measures: [grams],
      nutrients: cronometerAmountsOf(vectorOf(eggs?.nutrients ?? {})),
    },
    nutella: {
      id: 2,
      name: 'Ferrero, Nutella',
      source: 'CRDB',
      defaultMeasureId: 1,
      measures: [
        grams,
        { id: 2, name: 'tbsp', value: 18.5, type: 'Weight', hidden: false },
      ],
      nutrients: cronometerAmountsOf(vectorOf(nutella?.nutrients ?? {})),
    },
    yogurt: {
      id: 3,
      name: 'Goat yogurt with honey and chia',
      source: 'Custom',
      defaultMeasureId: 1,
      measures: [
        grams,
        { id: 3, name: 'Serving', value: 137.1, type: 'Weight', hidden: false },
      ],
      nutrients: [
        { id: 208, amount: 102.7 },
        { id: 203, amount: 4.9 },
        { id: 205, amount: 9.3 },
        { id: 204, amount: 5.1 },
        { id: 301, amount: 120 },
      ],
    },
    quickAdd: {
      id: 4,
      name: 'Quick Add, Protein',
      source: 'CRDB',
      defaultMeasureId: 1,
      measures: [grams],
      nutrients: [{ id: 203, amount: 100 }],
    },
  };
};

const breakfast = 1 << 16;
const snacks = 4 << 16;

const entry = (
  food: CronometerFood,
  measureId: number,
  quantityGrams: number,
  overrides: Partial<DiaryEntry> = {},
): DiaryEntry => ({
  type: 'Serving',
  time: null,
  foodId: food.id,
  measureId,
  grams: quantityGrams,
  servingId: null,
  order: breakfast,
  ...overrides,
});

const fakeCronometer = (
  diary: Record<string, DiaryEntry[]>,
  foods: CronometerFood[],
  weights: Weight[] = [],
) => {
  const asked: string[] = [];
  const cronometer: Cronometer = {
    login: async () => {},
    diary: async (date) => {
      asked.push(date);
      return diary[date] ?? [];
    },
    foods: async (ids) => foods.filter(({ id }) => ids.includes(id)),
    weights: async ({ from, to }) =>
      weights.filter(({ date }) => date >= from && date <= to),
  };
  return { cronometer, asked };
};

const today = '2026-09-30';

const since = '2026-08-01';

const plan = (
  { cronometer }: ReturnType<typeof fakeCronometer>,
  onProgress?: Parameters<typeof planImport>[0]['onProgress'],
  from: string | undefined = since,
) =>
  planImport({
    ...(onProgress ? { onProgress } : {}),
    ...(from ? { from } : {}),
    cronometer,
    account,
    to: today,
  });

describe('planImport and applyImport', () => {
  it('logs each serving through the food it matched, at Cronometer’s amounts', async () => {
    const { eggs, nutella, yogurt, quickAdd } = await cronometerFoods();
    const source = fakeCronometer(
      {
        '2026-09-01': [
          entry(eggs, 1, 120),
          entry(nutella, 1, 37, { order: snacks }),
        ],
        '2026-09-02': [
          entry(yogurt, 3, 137.1, { order: 0, time: '8:15:00' }),
          entry(quickAdd, 1, 30),
        ],
      },
      [eggs, nutella, yogurt, quickAdd],
      [
        { date: '2026-09-01', kilograms: 71.5 },
        { date: '2026-09-01', kilograms: 71.9 },
        { date: '2026-09-02', kilograms: 71.2 },
        { date: '2026-09-03', kilograms: 500 },
      ],
    );

    const planned = await plan(source);

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
    expect(planned.range).toEqual({ from: '2026-09-01', to: today });
    expect(planned.weights).toEqual([
      { date: '2026-09-01', kilograms: 71.5 },
      { date: '2026-09-02', kilograms: 71.2 },
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

  it('skips the days and weights already logged, without asking Cronometer for them, and reuses the foods it made', async () => {
    const { yogurt } = await cronometerFoods();
    const weights = [{ date: '2026-09-01', kilograms: 71.5 }];
    await applyImport(
      account,
      await plan(
        fakeCronometer(
          { '2026-09-01': [entry(yogurt, 1, 100)] },
          [yogurt],
          weights,
        ),
      ),
    );

    const source = fakeCronometer(
      {
        '2026-09-01': [entry(yogurt, 1, 100)],
        '2026-09-03': [entry(yogurt, 1, 50)],
      },
      [yogurt],
      weights,
    );
    const again = await plan(source);

    expect(source.asked).not.toContain('2026-09-01');
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

  it('skips a serving Cronometer has no nutrients for', async () => {
    const { quickAdd } = await cronometerFoods();

    const planned = await plan(
      fakeCronometer(
        { '2026-09-01': [{ ...entry(quickAdd, 1, 0), foodId: 99 }] },
        [quickAdd],
      ),
    );

    expect(planned.meals).toEqual([]);
    expect(planned.skippedServings).toMatchObject([
      { reason: 'Cronometer has no nutrients for it' },
    ]);
  });
});

describe('the walk back through the diary', () => {
  it('reads every day back to when Cronometer launched, however long the gaps', async () => {
    const { yogurt } = await cronometerFoods();
    const source = fakeCronometer(
      {
        [cronometerLaunched]: [entry(yogurt, 1, 100)],
        '2026-09-29': [entry(yogurt, 1, 100)],
      },
      [yogurt],
    );

    const planned = await plan(source, undefined, '');

    expect(planned.days.map(({ date }) => date)).toEqual([
      cronometerLaunched,
      '2026-09-29',
    ]);
    expect(planned.range).toEqual({ from: cronometerLaunched, to: today });
    expect(source.asked).toHaveLength(
      daysBetween(cronometerLaunched, today) + 1,
    );
  });

  it('reports the days read out of all of them, then matches each food in turn', async () => {
    const { eggs, yogurt } = await cronometerFoods();
    const progress: string[] = [];

    await plan(
      fakeCronometer(
        { '2026-09-30': [entry(eggs, 1, 100), entry(yogurt, 1, 100)] },
        [eggs, yogurt],
      ),
      ({ phase, done, total }) => {
        progress.push(`${phase} ${done}/${total}`);
      },
    );

    expect(progress.slice(0, 3)).toEqual([
      'reading 0/0',
      'reading 7/61',
      'reading 14/61',
    ]);
    expect(progress.slice(-3)).toEqual([
      'reading 61/61',
      'matching 0/2',
      'matching 1/2',
    ]);
  });
});
