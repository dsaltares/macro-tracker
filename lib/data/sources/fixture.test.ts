import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type SourceFood,
  sourceFoodSchema,
} from '../../domain/foods/source-food.ts';
import { nutrientKeys } from '../../domain/nutrition/nutrients.ts';
import { createFixtureSource, sampleFixturePath } from './fixture.ts';
import type { SourceContext } from './types.ts';

let tempDir = '';

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'macro-tracker-fixture-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

const contextWith = (signal = new AbortController().signal): SourceContext => ({
  fetch: globalThis.fetch,
  tempDir,
  logger: pino({ enabled: false }),
  signal,
});

const readAll = async (
  source = createFixtureSource(),
  context = contextWith(),
) => {
  const foods: SourceFood[] = [];
  for await (const food of source.fetch(context)) {
    foods.push(food);
  }
  return foods;
};

const fixtureWith = async (lines: string[]) => {
  const path = join(tempDir, 'sample.jsonl');
  await writeFile(path, lines.join('\n'));
  return path;
};

const genericFood: SourceFood = {
  source: 'usda',
  sourceId: '173944',
  barcode: null,
  name: 'Bananas, raw',
  brand: null,
  quantityLabel: null,
  nutrients: { energy_kcal: 89, protein: 1.09 },
  traces: [],
  portions: [{ label: '1 medium', grams: 118 }],
  lastModified: null,
};

const offProduct = {
  code: '8480000592569',
  product_name: 'Jamón cocido lonchas',
  brands: 'Hacienda Real',
  nutriments: { 'energy-kcal_100g': 102, salt_100g: 1.9 },
};

describe('the sample fixture', () => {
  it('validates against the source food schema, every line of it', async () => {
    const foods = await readAll();

    for (const food of foods) {
      expect(sourceFoodSchema.safeParse(food).error).toBeUndefined();
    }
  });

  it('holds about 200 Open Food Facts products and about 30 generic foods', async () => {
    const foods = await readAll();
    const bySource = Object.groupBy(foods, ({ source }) => source);

    expect(bySource.off?.length).toBeGreaterThanOrEqual(180);
    expect(bySource.ciqual?.length).toBeGreaterThan(0);
    expect(bySource.cofid?.length).toBeGreaterThan(0);
    expect(bySource.usda?.length).toBeGreaterThan(0);
    expect(foods.length - (bySource.off?.length ?? 0)).toBe(30);
  });

  it('never repeats a source id within a source, or a barcode', async () => {
    const foods = await readAll();
    const keys = foods.map(({ source, sourceId }) => `${source}:${sourceId}`);
    const barcodes = foods.flatMap(({ barcode }) => (barcode ? [barcode] : []));

    expect(new Set(keys).size).toBe(foods.length);
    expect(new Set(barcodes).size).toBe(barcodes.length);
  });

  it('gives every generic food the full nutrient panel', async () => {
    const generic = (await readAll()).filter(({ source }) => source !== 'off');

    for (const food of generic) {
      expect(Object.keys(food.nutrients).sort(), food.name).toEqual(
        [...nutrientKeys].sort(),
      );
    }
  });

  it('keeps the edge cases the adapters and the app have to handle', async () => {
    const foods = await readAll();
    const off = foods.filter(({ source }) => source === 'off');
    const brands = new Set(off.map(({ brand }) => brand));

    expect(brands.size).toBeGreaterThan(20);
    expect(foods.some(({ traces }) => traces.length > 0)).toBe(true);
    expect(off.some(({ barcode }) => barcode?.length === 8)).toBe(true);
    expect(off.some(({ sourceId }) => sourceId.length === 12)).toBe(true);
    expect(off.some(({ brand }) => brand === null)).toBe(true);
    expect(off.some(({ quantityLabel }) => quantityLabel === null)).toBe(true);
    expect(off.some(({ lastModified }) => lastModified === null)).toBe(true);
    expect(off.some(({ portions }) => portions.length === 0)).toBe(true);
    expect(off.some(({ nutrients }) => (nutrients.alcohol ?? 0) > 0)).toBe(
      true,
    );
    expect(off.some(({ nutrients }) => nutrients.energy_kcal === 0)).toBe(true);
    expect(off.some(({ name }) => name.length > 100)).toBe(true);
    expect(off.some(({ name }) => /[À-ž]/.test(name))).toBe(true);
    expect(foods.some(({ portions }) => portions.length > 1)).toBe(true);
  });

  it('declares its products the ways Open Food Facts does', async () => {
    const products = (await readFile(sampleFixturePath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((record) => !('source' in record));
    const declaring = (
      predicate: (nutriments: Record<string, unknown>) => boolean,
    ) => products.some(({ nutriments }) => predicate(nutriments));
    const has = (nutriments: Record<string, unknown>, key: string) =>
      key in nutriments;

    expect(
      declaring(
        (n) =>
          has(n, 'energy-kj_100g') &&
          !has(n, 'energy-kcal_100g') &&
          !has(n, 'energy_100g'),
      ),
    ).toBe(true);
    expect(
      declaring((n) => has(n, 'energy_100g') && !has(n, 'energy-kcal_100g')),
    ).toBe(true);
    expect(
      declaring(
        (n) =>
          !Object.keys(n).some((key) => key.startsWith('energy')) &&
          has(n, 'fat_100g'),
      ),
    ).toBe(true);
    expect(
      declaring((n) => has(n, 'salt_100g') && !has(n, 'sodium_100g')),
    ).toBe(true);
    expect(
      declaring((n) => has(n, 'sodium_100g') && !has(n, 'salt_100g')),
    ).toBe(true);
    expect(
      declaring(
        (n) =>
          has(n, 'proteins_serving') &&
          !Object.keys(n).some((key) => key.endsWith('_100g')),
      ),
    ).toBe(true);
    expect(declaring((n) => Object.values(n).includes('<'))).toBe(true);
    expect(declaring((n) => typeof n.proteins_100g === 'string')).toBe(true);
    expect(
      products.some(({ countries_tags }) =>
        countries_tags.every((tag: string) =>
          ['en:united-states', 'en:argentina'].includes(tag),
        ),
      ),
    ).toBe(true);
  });
});

describe('createFixtureSource', () => {
  it('is the fixture source', () => {
    expect(createFixtureSource().id).toBe('fixture');
  });

  it('emits generic foods as they are and maps Open Food Facts products', async () => {
    const path = await fixtureWith([
      JSON.stringify(genericFood),
      JSON.stringify(offProduct),
    ]);

    expect(await readAll(createFixtureSource(path))).toEqual([
      genericFood,
      {
        source: 'off',
        sourceId: '8480000592569',
        barcode: '8480000592569',
        name: 'Jamón cocido lonchas',
        brand: 'Hacienda Real',
        quantityLabel: null,
        nutrients: { energy_kcal: 102, sodium: 760 },
        traces: [],
        portions: [],
        lastModified: null,
      },
    ]);
  });

  it('skips blank lines', async () => {
    const path = await fixtureWith(['', JSON.stringify(genericFood), '  ', '']);

    expect(await readAll(createFixtureSource(path))).toEqual([genericFood]);
  });

  it('names the file and line of an invalid source food', async () => {
    const path = await fixtureWith([
      JSON.stringify(genericFood),
      JSON.stringify({ ...genericFood, nutrients: { salt: 1 } }),
    ]);

    await expect(readAll(createFixtureSource(path))).rejects.toThrow(
      `${path}:2: not a valid fixture line`,
    );
  });

  it('names the file and line of a product it cannot map', async () => {
    const path = await fixtureWith([
      JSON.stringify({ ...offProduct, code: '8480000592560' }),
    ]);

    await expect(readAll(createFixtureSource(path))).rejects.toMatchObject({
      message: `${path}:1: not a valid fixture line`,
      cause: new Error('8480000592560: not a valid EAN-8, EAN-13 or UPC-A'),
    });
  });

  it('names the file and line of a line that is not JSON', async () => {
    const path = await fixtureWith(['{"source":']);

    await expect(readAll(createFixtureSource(path))).rejects.toThrow(
      `${path}:1: not a valid fixture line`,
    );
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const foods = createFixtureSource().fetch(contextWith(controller.signal));
    const iterator = foods[Symbol.asyncIterator]();

    await iterator.next();
    controller.abort();

    await expect(
      (async () => {
        for (;;) {
          if ((await iterator.next()).done) {
            return;
          }
        }
      })(),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
