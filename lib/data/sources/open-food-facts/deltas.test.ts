import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import type { SourceFood } from '../../../domain/foods/source-food.ts';
import { importFoods } from '../../import-foods.ts';
import type { FoodSource, SourceContext } from '../types.ts';
import {
  createOpenFoodFactsDeltasSource,
  deltaFilesOf,
  deltaFilesSince,
  offDeltasUrl,
} from './deltas.ts';

const deltaLines = readFileSync('test/fixtures/off/delta.jsonl', 'utf8')
  .trim()
  .split('\n');

const kinderBueno = '4008400320328';
const soldInTheUnitedStates = '8445291820258';
const onlyEstimated = '8595072626330';
const onlyPrepared = '3492592211112';
const noNutrition = '8021581110140';
const guinness = '5000213029381';

const lineOf = (code: string) => {
  const line = deltaLines.find(
    (candidate) => JSON.parse(candidate).code === code,
  );
  if (!line) {
    throw new Error(`No product ${code} in the delta fixture`);
  }
  return line;
};

const renamed = (code: string, name: string) =>
  JSON.stringify({ ...JSON.parse(lineOf(code)), product_name: name });

const olderFile = 'openfoodfacts_products_1792217949_1792304521.json.gz';
const newerFile = 'openfoodfacts_products_1792304521_1792391953.json.gz';
const afterTheOlderFile = '2026-10-18T07:00:00.000Z';

const gzipped = (lines: readonly string[]) =>
  new Uint8Array(gzipSync(`${lines.join('\n')}\n`));

const upstream = (files: Record<string, readonly string[]>) => {
  const requests: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    requests.push(href);
    const name = href.slice(offDeltasUrl.length);
    if (name === 'index.txt') {
      return new Response(`${Object.keys(files).reverse().join('\n')}\n`);
    }
    const lines = files[name];
    return lines
      ? new Response(gzipped(lines))
      : new Response(null, { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
};

const contextWith = (
  fetch: typeof globalThis.fetch,
  overrides: Partial<SourceContext> = {},
): SourceContext => ({
  fetch,
  tempDir: '',
  logger: pino({ enabled: false }),
  signal: new AbortController().signal,
  lastSucceededAt: null,
  ...overrides,
});

const readAll = async (context: SourceContext) => {
  const foods: SourceFood[] = [];
  for await (const food of createOpenFoodFactsDeltasSource().fetch(context)) {
    foods.push(food);
  }
  return foods;
};

describe('deltaFilesOf', () => {
  it('lists the delta files oldest first, whatever else the index holds', () => {
    expect(deltaFilesOf(`${newerFile}\n\n${olderFile}\nREADME.txt\n`)).toEqual([
      { name: olderFile, from: 1792217949, to: 1792304521 },
      { name: newerFile, from: 1792304521, to: 1792391953 },
    ]);
  });
});

describe('deltaFilesSince', () => {
  const files = deltaFilesOf(`${newerFile}\n${olderFile}`);

  it('keeps every file when no delta import has succeeded', () => {
    expect(deltaFilesSince(files, null)).toEqual(files);
  });

  it('keeps only the files that end after the last success started', () => {
    expect(
      deltaFilesSince(files, afterTheOlderFile).map(({ name }) => name),
    ).toEqual([newerFile]);
  });
});

describe('createOpenFoodFactsDeltasSource', () => {
  it('is a delta of the Open Food Facts source', () => {
    expect(createOpenFoodFactsDeltasSource()).toMatchObject({
      id: 'off-deltas',
      kind: 'delta',
      emits: ['off'],
    });
  });

  it('keeps the products sold in Europe that declare nutrition facts', async () => {
    const { fetch } = upstream({ [newerFile]: deltaLines });

    const codes = (await readAll(contextWith(fetch))).map(
      ({ sourceId }) => sourceId,
    );

    expect(codes).toContain(kinderBueno);
    expect(codes).not.toContain(soldInTheUnitedStates);
    expect(codes).not.toContain(onlyEstimated);
    expect(codes).not.toContain(onlyPrepared);
    expect(codes).not.toContain(noNutrition);
  });

  it('maps a product through the shared table, leaving out estimates', async () => {
    const { fetch } = upstream({ [newerFile]: [lineOf(kinderBueno)] });

    const [bueno] = await readAll(contextWith(fetch));

    expect(bueno).toMatchObject({
      source: 'off',
      sourceId: kinderBueno,
      barcode: kinderBueno,
      name: 'Bueno',
      brand: 'Kinder',
      quantityLabel: '129g',
      portions: [{ label: '1 portion (21.5 g)', grams: 21.5 }],
      nutrients: {
        energy_kcal: 572,
        fat: 37.3,
        saturated_fat: 17.3,
        carbohydrate: 49.5,
        sugars: 41.2,
        protein: 8.6,
        sodium: expect.closeTo(109),
      },
    });
    expect(bueno?.nutrients).not.toHaveProperty('fibre');
    expect(bueno?.nutrients).not.toHaveProperty('calcium');
  });

  it('fetches every listed file, oldest first, when no delta import has succeeded', async () => {
    const { fetch, requests } = upstream({
      [olderFile]: [renamed(kinderBueno, 'Bueno, last week')],
      [newerFile]: [lineOf(kinderBueno)],
    });

    const foods = await readAll(contextWith(fetch));

    expect(requests).toEqual([
      `${offDeltasUrl}index.txt`,
      `${offDeltasUrl}${olderFile}`,
      `${offDeltasUrl}${newerFile}`,
    ]);
    expect(foods.map(({ name }) => name)).toEqual([
      'Bueno, last week',
      'Bueno',
    ]);
  });

  it('fetches only the files newer than the last delta import that succeeded', async () => {
    const { fetch, requests } = upstream({
      [olderFile]: [lineOf(kinderBueno)],
      [newerFile]: [lineOf(kinderBueno)],
    });

    await readAll(contextWith(fetch, { lastSucceededAt: afterTheOlderFile }));

    expect(requests).toEqual([
      `${offDeltasUrl}index.txt`,
      `${offDeltasUrl}${newerFile}`,
    ]);
  });

  it('skips a line that is not a product', async () => {
    const { fetch } = upstream({
      [newerFile]: ['{"code":', '{"code": 42}', lineOf(kinderBueno)],
    });

    const foods = await readAll(contextWith(fetch));

    expect(foods.map(({ sourceId }) => sourceId)).toEqual([kinderBueno]);
  });

  it('fails when a file it listed is not there', async () => {
    const { fetch } = upstream({ [newerFile]: [lineOf(kinderBueno)] });
    const missing = (async (url: string | URL | Request) =>
      String(url).endsWith('index.txt')
        ? fetch(url)
        : new Response(null, { status: 404 })) as typeof globalThis.fetch;

    await expect(readAll(contextWith(missing))).rejects.toThrow(
      `${offDeltasUrl}${newerFile} answered 404`,
    );
  });
});

describe('importing the Open Food Facts deltas', () => {
  const database = migratedDatabasePerTest();
  let workDir = '';
  let seconds = 0;
  let ids = 0;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-deltas-'));
    seconds = 0;
    ids = 0;
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  const run = (
    sources: readonly FoodSource[],
    fetch: typeof globalThis.fetch,
    day: number,
  ) =>
    importFoods({
      db: database(),
      sources,
      clock: {
        nextId: () => `id-${++ids}`,
        now: () =>
          new Date(Date.UTC(2026, 9, day, 4, 0, seconds++)).toISOString(),
      },
      logger: pino({ enabled: false }),
      signal: new AbortController().signal,
      workDir,
      fetch,
    });

  const offFood = (code: string) =>
    database()
      .selectFrom('foods')
      .select(['name', 'archived_at'])
      .where('source', '=', 'off')
      .where('source_id', '=', code)
      .executeTakeFirst();

  const fullExportOf = (lines: readonly string[]): FoodSource => ({
    id: 'off',
    kind: 'full',
    emits: ['off'],
    async *fetch(context) {
      const { fetch } = upstream({ [olderFile]: lines });
      yield* createOpenFoodFactsDeltasSource().fetch({ ...context, fetch });
    },
  });

  it('updates a product that changed upstream and archives nothing', async () => {
    const elsewhere = lineOf(guinness);
    await run(
      [fullExportOf([renamed(kinderBueno, 'Bueno, last month'), elsewhere])],
      globalThis.fetch,
      1,
    );
    const { fetch } = upstream({ [newerFile]: [lineOf(kinderBueno)] });

    const start = await run([createOpenFoodFactsDeltasSource()], fetch, 19);

    expect(start).toMatchObject({
      started: true,
      run: { sources: 'off-deltas', status: 'succeeded', archived: 0 },
    });
    expect(await offFood(kinderBueno)).toEqual({
      name: 'Bueno',
      archived_at: null,
    });
    expect(await offFood(guinness)).toMatchObject({ archived_at: null });
  });

  it('starts the next delta import from the last one that succeeded', async () => {
    const first = upstream({ [olderFile]: [lineOf(kinderBueno)] });
    await run([createOpenFoodFactsDeltasSource()], first.fetch, 19);
    const second = upstream({
      [olderFile]: [renamed(kinderBueno, 'Bueno, stale')],
      [newerFile]: [renamed(kinderBueno, 'Bueno, today')],
    });

    await run([createOpenFoodFactsDeltasSource()], second.fetch, 20);

    expect(second.requests).toEqual([
      `${offDeltasUrl}index.txt`,
      `${offDeltasUrl}${newerFile}`,
    ]);
    expect(await offFood(kinderBueno)).toMatchObject({ name: 'Bueno, today' });
  });
});
