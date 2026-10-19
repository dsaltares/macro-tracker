import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import type { FoodImportStart } from '../db/food-imports.ts';
import { type FoodWriteContext, insertFood } from '../db/foods.ts';
import type { SourceFood } from '../domain/foods/source-food.ts';
import type { ReferenceSource } from '../domain/foods/sources.ts';
import { importFoods } from './import-foods.ts';
import { createFixtureSource, sampleFixturePath } from './sources/fixture.ts';
import type { FoodSource, SourceContext } from './sources/types.ts';

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
  workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-import-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

const run = (
  sources: readonly FoodSource[],
  { signal = new AbortController().signal, batchSize = 50 } = {},
) =>
  importFoods({
    db: database(),
    sources,
    clock,
    logger: pino({ enabled: false }),
    signal,
    workDir: join(workDir, 'imports'),
    batchSize,
  });

const finished = (start: FoodImportStart) => {
  if (!start.started) {
    throw new Error(`refused by the running import ${start.running.id}`);
  }
  return start.run;
};

const fixtureLines = async () =>
  (await readFile(sampleFixturePath, 'utf8')).trim().split('\n');

const fixtureOf = async (lines: string[]) => {
  const path = join(workDir, `sample-${lines.length}.jsonl`);
  await writeFile(path, lines.join('\n'));
  return createFixtureSource(path);
};

const sourceOf = (
  foods: readonly SourceFood[],
  emits: readonly ReferenceSource[] = ['usda'],
  pause: (
    index: number,
    context: SourceContext,
  ) => Promise<void> = async () => {},
): FoodSource => ({
  id: `test-${emits.join('-')}`,
  kind: 'full',
  emits,
  async *fetch(context) {
    for (const [index, food] of foods.entries()) {
      await pause(index, context);
      yield food;
    }
  },
});

const banana = (sourceId = '173944'): SourceFood => ({
  source: 'usda',
  sourceId,
  barcode: null,
  name: `Bananas, raw ${sourceId}`,
  originalName: null,
  brand: null,
  quantityLabel: null,
  nutrients: { energy_kcal: 89, protein: 1.09 },
  traces: [],
  portions: [{ label: '1 medium', grams: 118 }],
  lastModified: null,
});

const bananas = (count: number) =>
  Array.from({ length: count }, (_, index) => banana(String(1000 + index)));

const rowCounts = async () => {
  const count = (table: 'foods' | 'food_nutrients' | 'food_portions') =>
    database()
      .selectFrom(table)
      .select(({ fn }) => fn.countAll<number>().as('rows'))
      .executeTakeFirstOrThrow()
      .then(({ rows }) => rows);
  return {
    foods: await count('foods'),
    nutrients: await count('food_nutrients'),
    portions: await count('food_portions'),
  };
};

const foodContents = () =>
  database()
    .selectFrom('foods')
    .innerJoin('food_nutrients', 'food_nutrients.food_id', 'foods.id')
    .selectAll('food_nutrients')
    .select([
      'foods.source',
      'foods.source_id',
      'foods.barcode',
      'foods.name',
      'foods.brand',
      'foods.quantity_label',
      'foods.archived_at',
    ])
    .orderBy('foods.source')
    .orderBy('foods.source_id')
    .execute();

const portionContents = () =>
  database()
    .selectFrom('food_portions')
    .select(['food_id', 'label', 'grams', 'source', 'user_id', 'position'])
    .orderBy('food_id')
    .orderBy('label')
    .execute();

const archivedSourceIds = async () =>
  (
    await database()
      .selectFrom('foods')
      .select('source_id')
      .where('archived_at', 'is not', null)
      .orderBy('source_id')
      .execute()
  ).map(({ source_id }) => source_id);

const theImport = (id: string) =>
  database()
    .selectFrom('food_imports')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();

const deferred = () => {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, released };
};

describe('importFoods', () => {
  it('imports the fixture and records the run', async () => {
    const foods = (await fixtureLines()).length;

    const imported = finished(await run([createFixtureSource()]));

    expect(imported).toEqual({
      id: 'id-1',
      sources: 'fixture',
      status: 'succeeded',
      started_at: '2026-10-19T12:00:00.000Z',
      finished_at: expect.any(String),
      inserted: foods,
      updated: 0,
      archived: 0,
      error: null,
    });
    expect((await rowCounts()).foods).toBe(foods);
  });

  it('changes nothing when it imports the same data twice', async () => {
    finished(await run([createFixtureSource()]));
    const counts = await rowCounts();
    const foods = await foodContents();
    const portions = await portionContents();

    const again = finished(await run([createFixtureSource()]));

    expect(again).toMatchObject({
      status: 'succeeded',
      inserted: 0,
      updated: counts.foods,
      archived: 0,
    });
    expect(await rowCounts()).toEqual(counts);
    expect(await foodContents()).toEqual(foods);
    expect(await portionContents()).toEqual(portions);
  });

  it('archives a food the next run no longer sees, and only that one', async () => {
    const lines = await fixtureLines();
    finished(await run([await fixtureOf(lines)]));
    const [removed = '', ...kept] = lines;

    const again = finished(await run([await fixtureOf(kept)]));

    expect(again).toMatchObject({
      inserted: 0,
      updated: kept.length,
      archived: 1,
    });
    expect(await archivedSourceIds()).toEqual([JSON.parse(removed).code]);
  });

  it('brings an archived food back when a run sees it again', async () => {
    const lines = await fixtureLines();
    finished(await run([await fixtureOf(lines)]));
    finished(await run([await fixtureOf(lines.slice(1))]));

    const again = finished(await run([await fixtureOf(lines)]));

    expect(again).toMatchObject({ inserted: 0, archived: 0 });
    expect(await archivedSourceIds()).toEqual([]);
  });

  it('does not archive the same food twice', async () => {
    finished(await run([sourceOf(bananas(2))]));
    finished(await run([sourceOf(bananas(1))]));

    const again = finished(await run([sourceOf(bananas(1))]));

    expect(again.archived).toBe(0);
    expect(await archivedSourceIds()).toEqual(['1001']);
  });

  it('archives only within the sources the adapter emits', async () => {
    finished(await run([createFixtureSource()]));

    const usdaOnly = finished(await run([sourceOf([banana()], ['usda'])]));

    const archived = await database()
      .selectFrom('foods')
      .select('source')
      .distinct()
      .where('archived_at', 'is not', null)
      .execute();
    expect(usdaOnly.archived).toBeGreaterThan(0);
    expect(archived).toEqual([{ source: 'usda' }]);
  });

  it('never archives after a delta source', async () => {
    finished(await run([sourceOf(bananas(3))]));
    const delta: FoodSource = { ...sourceOf(bananas(1)), kind: 'delta' };

    const updated = finished(await run([delta]));

    expect(updated).toMatchObject({ updated: 1, archived: 0 });
    expect(await archivedSourceIds()).toEqual([]);
  });

  it('hands each source the start of its last run that succeeded', async () => {
    const seen: Record<string, string | null> = {};
    const peeking = (id: string): FoodSource => ({
      ...sourceOf([banana()], ['usda'], async (_, context) => {
        seen[id] = context.lastSucceededAt;
      }),
      id,
    });
    const first = finished(await run([peeking('a')]));
    const failing: FoodSource = {
      id: 'a',
      kind: 'full',
      emits: ['usda'],
      async *fetch() {
        yield* [];
        throw new Error('upstream went away');
      },
    };
    finished(await run([failing]));

    finished(await run([peeking('a'), peeking('b')]));

    expect(seen).toEqual({ a: first.started_at, b: null });
  });

  it('leaves user foods and user portions alone', async () => {
    finished(await run([sourceOf([banana()])]));
    const reference = await database()
      .selectFrom('foods')
      .select('id')
      .executeTakeFirstOrThrow();
    await database()
      .insertInto('food_portions')
      .values({
        id: 'mine',
        food_id: reference.id,
        label: '1 banana',
        grams: 120,
        source: 'user',
        user_id: 'user-1',
        position: 0,
      })
      .execute();
    const userFood = await insertFood(
      database(),
      {
        source: 'user',
        owner_user_id: 'user-1',
        barcode: null,
        name: 'Banana bread',
        brand: null,
        quantity_label: null,
        nutrients: { energy_kcal: 326 },
        portions: [{ label: '1 slice', grams: 60 }],
      },
      clock,
    );
    const before = await database()
      .selectFrom('foods')
      .selectAll()
      .where('id', '=', userFood)
      .executeTakeFirstOrThrow();

    finished(await run([sourceOf([banana()])]));
    finished(await run([sourceOf([], ['off', 'ciqual', 'cofid', 'usda'])]));

    expect(
      await database()
        .selectFrom('foods')
        .selectAll()
        .where('id', '=', userFood)
        .executeTakeFirstOrThrow(),
    ).toEqual(before);
    expect(
      await database()
        .selectFrom('food_portions')
        .select(['label', 'source'])
        .where('source', '=', 'user')
        .orderBy('label')
        .execute(),
    ).toEqual([
      { label: '1 banana', source: 'user' },
      { label: '1 slice', source: 'user' },
    ]);
  });

  it('refuses a second run while one is running, with the running row', async () => {
    const gate = deferred();
    const first = run([
      sourceOf(bananas(2), ['usda'], async (index) => {
        if (index === 1) {
          await gate.released;
        }
      }),
    ]);
    await expect
      .poll(() =>
        database()
          .selectFrom('food_imports')
          .select('status')
          .executeTakeFirst(),
      )
      .toEqual({ status: 'running' });

    const second = await run([createFixtureSource()]);

    expect(second).toEqual({
      started: false,
      running: expect.objectContaining({ id: 'id-1', status: 'running' }),
    });
    gate.release();
    expect(finished(await first).status).toBe('succeeded');
    expect(finished(await run([sourceOf(bananas(2))])).status).toBe(
      'succeeded',
    );
  });

  it('keeps the run current after every batch', async () => {
    const gate = deferred();
    let progress: unknown;
    const importing = run(
      [
        sourceOf(bananas(5), ['usda'], async (index) => {
          if (index === 4) {
            progress = await theImport('id-1');
            gate.release();
          }
        }),
      ],
      { batchSize: 2 },
    );
    await gate.released;

    expect(progress).toMatchObject({
      status: 'running',
      inserted: 4,
      finished_at: null,
    });
    expect(finished(await importing)).toMatchObject({
      status: 'succeeded',
      inserted: 5,
    });
  });

  it('fails the run and archives nothing when a source fails', async () => {
    finished(await run([sourceOf(bananas(3))]));
    const failing: FoodSource = {
      id: 'broken',
      kind: 'full',
      emits: ['usda'],
      async *fetch() {
        yield banana('1000');
        throw new Error('upstream went away');
      },
    };

    const failed = finished(await run([failing]));

    expect(failed).toMatchObject({
      status: 'failed',
      error: 'upstream went away',
      finished_at: expect.any(String),
      archived: 0,
    });
    expect(await archivedSourceIds()).toEqual([]);
    expect(finished(await run([sourceOf(bananas(3))])).status).toBe(
      'succeeded',
    );
  });

  it('fails the run when aborted', async () => {
    const controller = new AbortController();
    const aborting = sourceOf(bananas(3), ['usda'], async (index) => {
      if (index === 2) {
        controller.abort(new Error('shutting down'));
      }
    });

    const failed = finished(
      await run([aborting], { signal: controller.signal, batchSize: 1 }),
    );

    expect(failed).toMatchObject({ status: 'failed', error: 'shutting down' });
    expect(await archivedSourceIds()).toEqual([]);
  });

  it('runs every source it is given and names them on the run', async () => {
    const imported = finished(
      await run([sourceOf([banana()], ['usda']), createFixtureSource()]),
    );

    expect(imported.sources).toBe('test-usda,fixture');
    expect(imported.status).toBe('succeeded');
  });

  it('hands each source a temporary directory under its work directory and removes it', async () => {
    let tempDir = '';
    const peeking = sourceOf([banana()], ['usda'], async (_, context) => {
      tempDir = context.tempDir;
      await writeFile(join(tempDir, 'download.csv'), 'code\n');
    });

    finished(await run([peeking]));

    expect(tempDir.startsWith(join(workDir, 'imports'))).toBe(true);
    expect(await readdir(join(workDir, 'imports'))).toEqual([]);
  });
});
