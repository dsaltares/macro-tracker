import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { insertFood } from '../db/foods.ts';
import { seedFoods } from './seed-foods.ts';

const database = migratedDatabasePerTest();

let workDir = '';
let ids = 0;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-seed-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const clock = {
  now: () => '2026-10-19T12:00:00.000Z',
  nextId: () => `id-${++ids}`,
};

const seed = () =>
  seedFoods({
    db: database(),
    clock,
    logger: pino({ enabled: false }),
    signal: new AbortController().signal,
    workDir,
  });

const foodCount = () =>
  database()
    .selectFrom('foods')
    .select(({ fn }) => fn.countAll<number>().as('foods'))
    .executeTakeFirstOrThrow()
    .then(({ foods }) => foods);

describe('seedFoods', () => {
  it('imports the fixture into a database with no reference foods', async () => {
    const seeded = await seed();

    expect(seeded).toMatchObject({
      seeded: true,
      start: {
        started: true,
        run: { sources: 'fixture', status: 'succeeded' },
      },
    });
    expect(await foodCount()).toBeGreaterThan(0);
  });

  it('leaves a database that has reference foods alone', async () => {
    await seed();
    const foods = await foodCount();

    expect(await seed()).toEqual({ seeded: false });
    expect(await foodCount()).toBe(foods);
  });

  it('seeds a database whose only foods are user foods', async () => {
    await insertFood(
      database(),
      {
        source: 'user',
        owner_user_id: 'user-1',
        barcode: null,
        name: 'Banana bread',
        brand: null,
        quantity_label: null,
        nutrients: { energy_kcal: 326 },
        portions: [],
      },
      clock,
    );

    expect((await seed()).seeded).toBe(true);
  });
});
