import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import type { SourceFood } from '../../../domain/foods/source-food.ts';
import type { SourceContext } from '../types.ts';
import { cofidWorkbookUrl, createCofidSource } from './workbook.ts';

const sampleWorkbook = new Uint8Array(
  readFileSync('test/fixtures/cofid/sample.xlsx'),
);
const lastModified = 'Thu, 18 Mar 2021 17:19:13 GMT';

const fetchServing = (respond: () => Response) => {
  const urls: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return respond();
  }) as typeof globalThis.fetch;
  return { fetch, urls };
};

const servingSample = (
  headers: HeadersInit = { 'last-modified': lastModified },
) => fetchServing(() => new Response(sampleWorkbook, { headers }));

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
  lastSucceededAt: null,
  ...overrides,
});

const readAll = async (context: SourceContext) => {
  const foods: SourceFood[] = [];
  for await (const food of createCofidSource().fetch(context)) {
    foods.push(food);
  }
  return foods;
};

const byCode = (foods: SourceFood[], code: string) => {
  const found = foods.find(({ sourceId }) => sourceId === code);
  if (!found) {
    throw new Error(`No food ${code}`);
  }
  return found;
};

describe('createCofidSource', () => {
  it('is the CoFID source, reading the 2021 workbook', async () => {
    const { fetch, urls } = servingSample();
    const source = createCofidSource();

    await readAll(contextWith(fetch));

    expect(source.id).toBe('cofid');
    expect(source.emits).toEqual(['cofid']);
    expect(urls).toEqual([cofidWorkbookUrl]);
  });

  it('emits every food in the workbook once, in its order', async () => {
    const foods = await readAll(contextWith(servingSample().fetch));

    expect(foods.map(({ sourceId, name }) => [sourceId, name])).toEqual([
      ['13-145', 'Ackee, canned, drained'],
      ['14-870', 'Almonds, flaked and ground'],
      ['14-319', 'Apples, eating, raw, flesh and skin'],
      ['13-669', 'Aubergine, flesh and skin, roasted in rapeseed oil'],
      ['16-386', 'Bass, sea, flesh only, baked'],
      ['17-506', 'Beer, bitter, average (<4% ABV)'],
      ['12-491', 'Cheese, Brie, rind only'],
      ['18-323', 'Chicken, breast, grilled without skin, meat only'],
      ['13-880', 'Pepper, black'],
      ['11-1146', 'Yorkshire pudding, made with whole milk'],
    ]);
  });

  it('joins the proximates, inorganics and vitamins of a food on its code', async () => {
    const foods = await readAll(contextWith(servingSample().fetch));

    expect(byCode(foods, '18-323')).toEqual({
      source: 'cofid',
      sourceId: '18-323',
      barcode: null,
      name: 'Chicken, breast, grilled without skin, meat only',
      originalName: null,
      brand: null,
      quantityLabel: null,
      nutrients: {
        energy_kcal: 148,
        protein: 32,
        carbohydrate: 0,
        fat: 2.2,
        fibre: 0,
        alcohol: 0,
        water: 66.6,
        saturated_fat: 0.6,
        monounsaturated_fat: 1,
        polyunsaturated_fat: 0.4,
        trans_fat: 0.03,
        omega_3: 0.11,
        omega_6: 0.41,
        cholesterol: 94,
        sugars: 0,
        starch: 0,
        sodium: 55,
        potassium: 460,
        chloride: 67,
        calcium: 6,
        phosphorus: 310,
        magnesium: 36,
        iron: 0.4,
        zinc: 0.8,
        copper: 0.04,
        manganese: 0.01,
        selenium: 16,
        iodine: 7,
        vitamin_a: 0,
        vitamin_d: 0.3,
        vitamin_e: 0.17,
        vitamin_c: 0,
        thiamin: 0.14,
        riboflavin: 0.13,
        niacin: 15.8,
        vitamin_b6: 0.63,
        folate: 6,
        vitamin_b12: 0,
        biotin: 2,
        pantothenic_acid: 1.67,
      },
      traces: ['vitamin_a', 'vitamin_b12'],
      portions: [],
      lastModified: '2021-03-18T17:19:13.000Z',
    });
  });

  it('flags Tr as a trace and leaves N out', async () => {
    const ackee = byCode(
      await readAll(contextWith(servingSample().fetch)),
      '13-145',
    );

    expect(ackee.traces).toEqual(['starch', 'iodine']);
    expect(ackee.nutrients).toMatchObject({ starch: 0, iodine: 0 });
    expect(ackee.nutrients).not.toHaveProperty('saturated_fat');
    expect(ackee.nutrients).not.toHaveProperty('fibre');
  });

  it('leaves energy out of a food CoFID gives none for', async () => {
    const pepper = byCode(
      await readAll(contextWith(servingSample().fetch)),
      '13-880',
    );

    expect(pepper.nutrients).not.toHaveProperty('energy_kcal');
    expect(pepper.nutrients).toMatchObject({ protein: 10.4, fat: 3.3 });
  });

  it('keeps the first food under a code CoFID gives to two, and logs the second', async () => {
    const { logger, logs } = capturingLogger();

    const foods = await readAll(contextWith(servingSample().fetch, { logger }));

    expect(byCode(foods, '13-669')).toMatchObject({
      name: 'Aubergine, flesh and skin, roasted in rapeseed oil',
      nutrients: { energy_kcal: 62, sodium: 2, folate: 20 },
    });
    expect(foods.filter(({ sourceId }) => sourceId === '13-669')).toHaveLength(
      1,
    );
    expect(
      logs.filter(({ msg }) => msg.includes('skipped a food whose code')),
    ).toEqual([expect.objectContaining({ level: 40, code: '13-669' })]);
  });

  it('logs what it read, kept and skipped', async () => {
    const { logger, logs } = capturingLogger();

    await readAll(contextWith(servingSample().fetch, { logger }));

    expect(logs.find(({ msg }) => msg === 'read the CoFID workbook')).toEqual(
      expect.objectContaining({
        level: 30,
        bytes: sampleWorkbook.byteLength,
        rows: 11,
        duplicates: 1,
        rejected: 0,
        foods: 10,
      }),
    );
  });

  it('has no last modified time when the server gives none', async () => {
    const foods = await readAll(contextWith(servingSample({}).fetch));

    expect(foods.every(({ lastModified }) => lastModified === null)).toBe(true);
  });

  it('fails when the workbook is not there', async () => {
    const { fetch } = fetchServing(() => new Response(null, { status: 404 }));

    await expect(readAll(contextWith(fetch))).rejects.toThrow(
      `${cofidWorkbookUrl} answered 404`,
    );
  });

  it('fails when what it downloaded is not the workbook', async () => {
    const { fetch } = fetchServing(() => new Response('<html></html>'));

    await expect(readAll(contextWith(fetch))).rejects.toThrow();
  });
});
