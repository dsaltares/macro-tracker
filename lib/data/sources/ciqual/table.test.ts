import { readFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import {
  type SourceFood,
  sourceFoodSchema,
} from '../../../domain/foods/source-food.ts';
import type { SourceContext } from '../types.ts';
import {
  ciqualDatasetUrl,
  ciqualFileUrl,
  createCiqualSource,
  type TableCounts,
} from './table.ts';

const foodsXml = readFileSync('test/fixtures/ciqual/alim.xml');
const compositionXml = readFileSync('test/fixtures/ciqual/compo.xml');

const foodsId = 666252;
const compositionId = 666249;
const releaseTime = '2025-11-19T16:29:04Z';

const datasetListing = (
  files: { id: number; filename: string }[] = [
    { id: 666250, filename: 'alim_grp_2025_11_03.xml' },
    { id: foodsId, filename: 'alim_2025_11_03.xml' },
    { id: compositionId, filename: 'compo_2025_11_03.xml' },
    { id: 666246, filename: 'const_2025_11_03.xml' },
  ],
) => ({
  status: 'OK',
  data: {
    latestVersion: {
      releaseTime,
      files: files.map((dataFile) => ({ dataFile })),
    },
  },
});

type Upstream = {
  dataset?: Response;
  foods?: string | Uint8Array<ArrayBuffer>;
  composition?: string | Uint8Array<ArrayBuffer>;
};

const fetchServing = ({
  dataset = Response.json(datasetListing()),
  foods = new Uint8Array(foodsXml),
  composition = new Uint8Array(compositionXml),
}: Upstream = {}) => {
  const requests: string[] = [];
  const responses = new Map<string, () => Response>([
    [ciqualDatasetUrl, () => dataset],
    [ciqualFileUrl(foodsId), () => new Response(foods)],
    [ciqualFileUrl(compositionId), () => new Response(composition)],
  ]);
  const fetch = (async (url: string | URL | Request) => {
    requests.push(String(url));
    return (
      responses.get(String(url))?.() ??
      new Response('Not Found', { status: 404 })
    );
  }) as typeof globalThis.fetch;
  return { fetch, requests };
};

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

const readAll = async (context: SourceContext) => {
  const foods: SourceFood[] = [];
  for await (const food of createCiqualSource().fetch(context)) {
    foods.push(food);
  }
  return foods;
};

const compositionText = compositionXml.toString('utf8');
const firstFood = '1000';
const firstFoodRow = compositionText.match(
  /\r\n {3}<COMPO>\r\n {6}<alim_code> 1000 <\/alim_code>[\s\S]*?<\/COMPO>/,
)?.[0];

describe('createCiqualSource', () => {
  it('is the CIQUAL source, reading the files of the latest release', async () => {
    const { fetch, requests } = fetchServing();

    await readAll(contextWith(fetch));

    expect(createCiqualSource()).toMatchObject({
      id: 'ciqual',
      emits: ['ciqual'],
    });
    expect(requests).toEqual([
      ciqualDatasetUrl,
      ciqualFileUrl(foodsId),
      ciqualFileUrl(compositionId),
    ]);
  });

  it('emits every food that declares energy or every energy macro, and nothing else', async () => {
    const { fetch } = fetchServing();

    const foods = await readAll(contextWith(fetch));

    expect(foods.map(({ sourceId }) => sourceId)).toEqual([
      '1000',
      '1031',
      '12061',
      '13039',
      '20503',
    ]);
    for (const food of foods) {
      expect(sourceFoodSchema.safeParse(food).error).toBeUndefined();
    }
  });

  it('names each food in English, keeps the French name and dates it by the release', async () => {
    const { fetch } = fetchServing();

    const foods = await readAll(contextWith(fetch));

    expect(
      foods.map(({ name, originalName, lastModified }) => [
        name,
        originalName,
        lastModified,
      ]),
    ).toEqual([
      ['Pastis (anise-flavoured spirit)', 'Pastis', '2025-11-19T16:29:04.000Z'],
      [
        'Plant-based pâté, prepacked',
        'Spécialité végétale type pâté, préemballée',
        '2025-11-19T16:29:04.000Z',
      ],
      [
        "Feta or Feta-type cheese, 100% from ewe's milk",
        'Fromage type feta, au lait de brebis 100%',
        '2025-11-19T16:29:04.000Z',
      ],
      [
        'Apple, flesh and skin, raw',
        'Pomme, chair et peau, crue',
        '2025-11-19T16:29:04.000Z',
      ],
      [
        'Red kidney bean, boiled/cooked in water',
        "Haricot rouge, bouilli/cuit à l'eau",
        '2025-11-19T16:29:04.000Z',
      ],
    ]);
  });

  it('reads the nutrients of each food from the composition', async () => {
    const { fetch } = fetchServing();

    const foods = await readAll(contextWith(fetch));

    expect(
      foods.find(({ sourceId }) => sourceId === '13039')?.nutrients,
    ).toMatchObject({ energy_kcal: 54, water: 85.4, sodium: 1.5 });
    expect(
      foods.find(({ sourceId }) => sourceId === '1000')?.nutrients.alcohol,
    ).toBeGreaterThan(0);
  });

  it('dates its foods by nothing when the release has no time', async () => {
    const listing = datasetListing();
    const { fetch } = fetchServing({
      dataset: Response.json({
        data: {
          latestVersion: { ...listing.data.latestVersion, releaseTime: null },
        },
      }),
    });

    const foods = await readAll(contextWith(fetch));

    expect(foods.every(({ lastModified }) => lastModified === null)).toBe(true);
  });

  it('logs what it read, kept and skipped', async () => {
    const { fetch } = fetchServing();
    const { logger, logs } = capturingLogger();

    await readAll(contextWith(fetch, { logger }));

    expect(
      logs.find(({ msg }) => msg === 'read the CIQUAL table'),
    ).toMatchObject({
      foods: 7,
      noEnergy: 2,
      unnamed: 0,
      rejected: 0,
      kept: 5,
    } satisfies TableCounts);
  });

  it('skips a food the composition has and the food list does not, and logs it', async () => {
    const { fetch } = fetchServing({
      foods: foodsXml
        .toString('utf8')
        .replace(
          / {3}<ALIM>\r\n {6}<alim_code> 1000 <[\s\S]*?<\/ALIM>\r\n/,
          '',
        ),
    });
    const { logger, logs } = capturingLogger();

    const foods = await readAll(contextWith(fetch, { logger }));

    expect(foods.map(({ sourceId }) => sourceId)).not.toContain(firstFood);
    expect(
      logs
        .filter(({ msg }) => msg === 'skipped a CIQUAL food with no name')
        .map(({ code }) => code),
    ).toEqual([firstFood]);
  });

  it('rejects a food that fails the schema, and logs why', async () => {
    const { fetch } = fetchServing({
      foods: foodsXml
        .toString('utf8')
        .replace('<alim_nom_fr> Pastis </alim_nom_fr>', '<alim_nom_fr />')
        .replace(
          '<alim_nom_eng> Pastis (anise-flavoured spirit) </alim_nom_eng>',
          '<alim_nom_eng />',
        ),
    });
    const { logger, logs } = capturingLogger();

    const foods = await readAll(contextWith(fetch, { logger }));

    expect(foods.map(({ sourceId }) => sourceId)).not.toContain(firstFood);
    expect(
      logs.filter(({ msg }) => msg === 'rejected a CIQUAL food'),
    ).toHaveLength(1);
  });

  it('fails when the composition is not grouped by food', async () => {
    const { fetch } = fetchServing({
      composition: compositionText.replace(
        '\r\n</TABLE>',
        `${firstFoodRow}\r\n</TABLE>`,
      ),
    });

    await expect(readAll(contextWith(fetch))).rejects.toThrow(
      `${ciqualFileUrl(compositionId)} is not grouped by food: 1000 appears again after another food`,
    );
  });

  it('fails when the release has no composition file', async () => {
    const { fetch } = fetchServing({
      dataset: Response.json(
        datasetListing([{ id: foodsId, filename: 'alim_2025_11_03.xml' }]),
      ),
    });

    await expect(readAll(contextWith(fetch))).rejects.toThrow(
      `${ciqualDatasetUrl} lists no file named like /^compo_`,
    );
  });

  it('fails when a file is not there', async () => {
    const { fetch } = fetchServing({
      dataset: Response.json(
        datasetListing([
          { id: 1, filename: 'alim_2025_11_03.xml' },
          { id: compositionId, filename: 'compo_2025_11_03.xml' },
        ]),
      ),
    });

    await expect(readAll(contextWith(fetch))).rejects.toThrow(
      `${ciqualFileUrl(1)} answered 404`,
    );
  });
});
