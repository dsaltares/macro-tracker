import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import {
  brokenProduct,
  offSamplePath,
} from '../../../../scripts/off-sample.ts';
import {
  type SourceFood,
  sourceFoodSchema,
} from '../../../domain/foods/source-food.ts';
import { createFixtureSource, sampleFixturePath } from '../fixture.ts';
import type { SourceContext } from '../types.ts';
import {
  createOpenFoodFactsSource,
  type ExportCounts,
  offExportUrl,
} from './export.ts';

const sampleExport = new Uint8Array(gzipSync(readFileSync(offSamplePath)));
const etag = '"export-v1"';

type Request = { url: string; headers: Record<string, string> };

const fetchServing = (
  respond: (request: Request, attempt: number) => Response,
) => {
  const requests: Request[] = [];
  const fetch = (async (url: string | URL | globalThis.Request, init) => {
    const request = {
      url: String(url),
      headers: Object.fromEntries(new Headers(init?.headers)),
    };
    requests.push(request);
    return respond(request, requests.length);
  }) as typeof globalThis.fetch;
  return { fetch, requests };
};

const whole = (bytes: Uint8Array<ArrayBuffer>) =>
  new Response(bytes, { headers: { etag } });

const failingAfter = (chunk: Uint8Array<ArrayBuffer>) => {
  let sent = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) {
        controller.error(new TypeError('terminated'));
      } else {
        sent = true;
        controller.enqueue(chunk);
      }
    },
  });
};

const cutAfter = (bytes: Uint8Array<ArrayBuffer>, length: number) =>
  new Response(failingAfter(bytes.subarray(0, length)), { headers: { etag } });

const partial = (bytes: Uint8Array<ArrayBuffer>, from: number) =>
  new Response(bytes.subarray(from), { status: 206, headers: { etag } });

type Log = { level: number; msg: string } & Record<string, unknown>;

const capturingLogger = () => {
  const logs: Log[] = [];
  const logger = pino(
    { level: 'debug' },
    new Writable({
      write(chunk, _encoding, done) {
        logs.push(JSON.parse(String(chunk)));
        done();
      },
    }),
  );
  return { logger, logs };
};

const contextWith = (
  fetch: typeof globalThis.fetch,
  overrides: Partial<SourceContext> = {},
): SourceContext => ({
  fetch,
  tempDir: '',
  logger: pino({ enabled: false }),
  signal: new AbortController().signal,
  ...overrides,
});

const readAll = async (
  context: SourceContext,
  source = createOpenFoodFactsSource({ resumeDelayMs: 0 }),
) => {
  const foods: SourceFood[] = [];
  for await (const food of source.fetch(context)) {
    foods.push(food);
  }
  return foods;
};

const sampleFoods = async () => {
  const foods: SourceFood[] = [];
  for await (const food of createFixtureSource().fetch(
    contextWith(globalThis.fetch),
  )) {
    foods.push(food);
  }
  return new Map(foods.map((food) => [food.sourceId, food]));
};

type SampleProduct = {
  code: string;
  countries_tags: string[];
  nutriments: Record<string, unknown>;
};

const sampleProducts: SampleProduct[] = readFileSync(sampleFixturePath, 'utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))
  .filter((record) => !('source' in record));

const soldOnlyOutsideEurope = new Set(['en:united-states', 'en:argentina']);
const declaresPer100g = (product: SampleProduct, prefix: string) =>
  Object.keys(product.nutriments).some(
    (key) => key.startsWith(prefix) && key.endsWith('_100g'),
  );
const declaresBelowALimit = (product: SampleProduct) =>
  Object.keys(product.nutriments).some((key) => key.endsWith('_modifier'));

describe('createOpenFoodFactsSource', () => {
  it('is the Open Food Facts source, reading the daily export', async () => {
    const { fetch, requests } = fetchServing(() => whole(sampleExport));

    await readAll(contextWith(fetch));

    expect(createOpenFoodFactsSource()).toMatchObject({
      id: 'off',
      emits: ['off'],
    });
    expect(requests).toEqual([{ url: offExportUrl, headers: {} }]);
  });

  it('emits every European product with energy and a macro, and nothing else', async () => {
    const { fetch } = fetchServing(() => whole(sampleExport));

    const foods = await readAll(contextWith(fetch));

    const expected = sampleProducts.filter(
      (product) =>
        product.countries_tags.some((tag) => !soldOnlyOutsideEurope.has(tag)) &&
        declaresPer100g(product, 'energy') &&
        ['proteins', 'fat', 'carbohydrates'].some((macro) =>
          declaresPer100g(product, macro),
        ),
    );
    expect(foods.map(({ sourceId }) => sourceId).sort()).toEqual(
      expected.map(({ code }) => code).sort(),
    );
    expect(foods.length).toBeGreaterThan(150);
    expect(foods.length).toBeLessThan(sampleProducts.length);
  });

  it('maps each product as the fixture source does, through the same table', async () => {
    const { fetch } = fetchServing(() => whole(sampleExport));
    const fromFixture = await sampleFoods();
    const exactlyAsSampled = new Set(
      sampleProducts
        .filter((product) => !declaresBelowALimit(product))
        .map(({ code }) => code),
    );

    const foods = await readAll(contextWith(fetch));

    for (const food of foods) {
      expect(sourceFoodSchema.safeParse(food).error).toBeUndefined();
      if (exactlyAsSampled.has(food.sourceId)) {
        expect(food, food.sourceId).toEqual(fromFixture.get(food.sourceId));
      }
    }
  });

  it('reads the brand, the serving as a portion and the last modified time from the columns the export has', async () => {
    const { fetch } = fetchServing(() => whole(sampleExport));

    const foods = await readAll(contextWith(fetch));

    expect(foods.find(({ sourceId }) => sourceId === '3799668974576')).toEqual(
      expect.objectContaining({
        name: 'Blanc de poulet',
        brand: 'Les Prés Verts',
        quantityLabel: '150 g',
        portions: [{ label: '1 slice (30 g)', grams: 30 }],
        lastModified: '2025-03-15T23:03:08.000Z',
      }),
    );
  });

  it('skips a product sold only outside Europe', async () => {
    const { fetch } = fetchServing(() => whole(sampleExport));

    const foods = await readAll(contextWith(fetch));

    expect(foods.map(({ sourceId }) => sourceId)).not.toContain('088444516530');
    expect(foods.map(({ sourceId }) => sourceId)).not.toContain(
      '7801197072091',
    );
  });

  it('skips a product that declares no energy', async () => {
    const { fetch } = fetchServing(() => whole(sampleExport));

    const foods = await readAll(contextWith(fetch));

    expect(foods.map(({ sourceId }) => sourceId)).not.toContain(
      '8095224323105',
    );
  });

  it('skips a line that is not a whole row, and logs it', async () => {
    const { fetch } = fetchServing(() => whole(sampleExport));
    const { logger, logs } = capturingLogger();

    const foods = await readAll(contextWith(fetch, { logger }));

    expect(foods.map(({ sourceId }) => sourceId)).not.toContain(
      brokenProduct.code,
    );
    expect(
      logs
        .filter(({ msg }) => msg.startsWith('skipped a malformed line'))
        .map(({ line, fields }) => [line, fields]),
    ).toEqual([
      [194, 11],
      [195, 191],
    ]);
  });

  it('logs what it read, kept and skipped', async () => {
    const { fetch } = fetchServing(() => whole(sampleExport));
    const { logger, logs } = capturingLogger();

    const foods = await readAll(contextWith(fetch, { logger }));

    const summary = logs.find(
      ({ msg }) => msg === 'read the Open Food Facts export',
    ) as Log & ExportCounts;
    expect(summary).toMatchObject({
      bytes: sampleExport.byteLength,
      resumes: 0,
      lines: 194,
      malformed: 2,
      foods: foods.length,
    });
    expect(
      summary.malformed +
        summary.notInEurope +
        summary.invalidBarcode +
        summary.noNutritionFacts +
        summary.rejected +
        summary.foods,
    ).toBe(summary.lines);
    expect(summary.notInEurope).toBeGreaterThan(0);
    expect(summary.noNutritionFacts).toBeGreaterThan(0);
  });

  it('resumes an interrupted download where it stopped, asking for the same file', async () => {
    const cut = Math.floor(sampleExport.byteLength / 2);
    const { fetch, requests } = fetchServing((request, attempt) =>
      attempt === 1
        ? cutAfter(sampleExport, cut)
        : partial(
            sampleExport,
            Number(request.headers.range?.match(/\d+/)?.[0]),
          ),
    );
    const { fetch: uninterrupted } = fetchServing(() => whole(sampleExport));

    const foods = await readAll(contextWith(fetch));

    expect(foods).toEqual(await readAll(contextWith(uninterrupted)));
    expect(requests.map(({ headers }) => headers)).toEqual([
      {},
      { range: `bytes=${cut}-`, 'if-range': etag },
    ]);
  });

  it('resumes as many times as it is allowed to, then gives up', async () => {
    const step = 1_000;
    const { fetch, requests } = fetchServing((_request, attempt) =>
      attempt === 1
        ? cutAfter(sampleExport, step)
        : new Response(
            failingAfter(
              sampleExport.subarray(step * (attempt - 1), step * attempt),
            ),
            { status: 206, headers: { etag } },
          ),
    );

    await expect(
      readAll(
        contextWith(fetch),
        createOpenFoodFactsSource({ maxResumes: 2, resumeDelayMs: 0 }),
      ),
    ).rejects.toThrow('terminated');
    expect(requests).toHaveLength(3);
  });

  it('refuses to resume when the export changed upstream', async () => {
    const { fetch } = fetchServing((_request, attempt) =>
      attempt === 1 ? cutAfter(sampleExport, 1_000) : whole(sampleExport),
    );

    await expect(readAll(contextWith(fetch))).rejects.toThrow(
      `${offExportUrl} answered 200 to resuming at byte 1000`,
    );
  });

  it('cannot resume a download the server gave no validator for', async () => {
    const { fetch, requests } = fetchServing(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new TypeError('terminated'));
            },
          }),
        ),
    );

    await expect(readAll(contextWith(fetch))).rejects.toThrow('terminated');
    expect(requests).toHaveLength(1);
  });

  it('fails when the export is not there', async () => {
    const { fetch } = fetchServing(
      () => new Response('Not Found', { status: 404 }),
    );

    await expect(readAll(contextWith(fetch))).rejects.toThrow(
      `${offExportUrl} answered 404`,
    );
  });

  it('stops when aborted, without resuming', async () => {
    const controller = new AbortController();
    const { fetch, requests } = fetchServing(() => {
      controller.abort();
      return cutAfter(sampleExport, 1_000);
    });

    await expect(
      readAll(contextWith(fetch, { signal: controller.signal })),
    ).rejects.toThrow('terminated');
    expect(requests).toHaveLength(1);
  });
});
