import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '../../../../test/db.ts';
import { zipOf, zipOfDirectory } from '../../../../test/zip.ts';
import {
  type SourceFood,
  sourceFoodSchema,
} from '../../../domain/foods/source-food.ts';
import { importFoods } from '../../import-foods.ts';
import type { SourceContext } from '../types.ts';
import { createUsdaSource, usdaDatasetUrls } from './fooddata-central.ts';
import { type UsdaDataset, usdaDatasets } from './mapping.ts';

const fixtureArchives = Object.fromEntries(
  usdaDatasets.map((dataset) => [
    usdaDatasetUrls[dataset],
    zipOfDirectory(
      `test/fixtures/usda/${dataset}`,
      `FoodData_Central_${dataset}`,
    ),
  ]),
);

const fetchServing = (archives: Record<string, Buffer> = fixtureArchives) => {
  const requested: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    requested.push(String(url));
    const archive = archives[String(url)];
    return archive
      ? new Response(new Uint8Array(archive))
      : new Response('Not found', { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, requested };
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
  lastSucceededAt: null,
  ...overrides,
});

const readAll = async (context: SourceContext) => {
  const foods: SourceFood[] = [];
  for await (const food of createUsdaSource().fetch(context)) {
    foods.push(food);
  }
  return foods;
};

const fixtureFoods = async () => {
  const foods = await readAll(contextWith(fetchServing().fetch));
  return new Map(foods.map((food) => [food.sourceId, food]));
};

const labels = (food: SourceFood | undefined) =>
  food?.portions.map(({ label, grams }) => `${label} = ${grams} g`);

describe('createUsdaSource', () => {
  it('is the USDA source, reading Foundation, SR Legacy and FNDDS', async () => {
    const { fetch, requested } = fetchServing();

    await readAll(contextWith(fetch));

    expect(createUsdaSource()).toMatchObject({ id: 'usda', emits: ['usda'] });
    expect(requested).toEqual([
      usdaDatasetUrls.foundation,
      usdaDatasetUrls['sr-legacy'],
      usdaDatasetUrls.fndds,
    ]);
  });

  it('emits one food per NDB number, Foundation first and then SR Legacy, then the FNDDS foods that describe neither by food code', async () => {
    const foods = await fixtureFoods();

    expect([...foods.keys()]).toEqual([
      'ndb:11296',
      'ndb:9123',
      'ndb:11251',
      'ndb:1077',
      'ndb:16500',
      'ndb:11090',
      'ndb:4582',
      'ndb:9500',
      'ndb:4042',
      'ndb:100259',
      'ndb:16222',
      'ndb:100274',
      'ndb:9266',
      'ndb:100310',
      'ndb:100300',
      'ndb:15266',
      'ndb:11267',
      'ndb:11109',
      'ndb:21240',
      'ndb:13366',
      'ndb:22974',
      'fndds:11100000',
      'fndds:24198736',
    ]);
  });

  it('emits only valid generic foods', async () => {
    for (const food of (await fixtureFoods()).values()) {
      expect(sourceFoodSchema.parse(food)).toEqual(food);
      expect(food).toMatchObject({
        source: 'usda',
        barcode: null,
        brand: null,
      });
    }
  });

  it('maps a food through the nutrient table, carbohydrate without its fibre', async () => {
    const cabbage = (await fixtureFoods()).get('ndb:11109');

    expect(cabbage).toMatchObject({
      name: 'Cabbage, raw',
      lastModified: '2019-04-01T00:00:00.000Z',
      nutrients: {
        energy_kcal: 25,
        protein: 1.28,
        fat: 0.1,
        fibre: 2.5,
        sugars: 3.2,
        vitamin_c: 36.6,
        vitamin_k: 76,
        folate: 43,
        choline: 10.7,
      },
    });
    expect(cabbage?.nutrients.carbohydrate).toBeCloseTo(5.8 - 2.5);
  });

  it('keeps portions in upstream order', async () => {
    const foods = await fixtureFoods();

    expect(labels(foods.get('fndds:24198736'))).toEqual([
      '1 nugget = 16 g',
      '1 cup = 140 g',
    ]);
  });

  it('attaches the portions of an FNDDS food made of one uncooked ingredient to that SR Legacy food, its own portions first', async () => {
    const foods = await fixtureFoods();

    expect(labels(foods.get('ndb:11109'))).toEqual([
      '1 cup, chopped = 89 g',
      '1 cup, shredded = 70 g',
      '1 head, large (about 7" dia) = 1248 g',
      '1 leaf, large = 33 g',
      '1 head, medium (about 5-3/4" dia) = 908 g',
      '1 leaf, medium = 23 g',
      '1 head, small (about 4-1/2" dia) = 714 g',
      '1 leaf = 15 g',
      '1 cup = 90 g',
      '1 head = 900 g',
    ]);
  });

  it('attaches the same FNDDS portions to a Foundation food', async () => {
    const foods = await fixtureFoods();

    expect(labels(foods.get('ndb:100300'))).toEqual([
      '1 cracker-size slice = 9 g',
      '1 slice = 21 g',
      '1 cup = 135 g',
      '1 oz = 28.35 g',
      '1 cubic inch = 18 g',
    ]);
  });

  it('merges a food in both Foundation and SR Legacy: Foundation wins, SR Legacy fills what it lacks', async () => {
    const milk = (await fixtureFoods()).get('ndb:1077');

    expect(milk).toMatchObject({
      name: 'Milk, whole, 3.25% milkfat, with added vitamin D',
      nutrients: {
        energy_kcal: 60,
        protein: 3.27,
        fat: 3.2,
        carbohydrate: 4.63,
        sugars: 4.81,
        choline: 17.8,
        folate: 0,
        iodine: 37.9,
        fibre: 0,
        vitamin_k: 0.3,
        vitamin_c: 0,
        caffeine: 0,
      },
    });
    expect(labels(milk)).toEqual([
      '1 cup = 249 g',
      '1 fl oz = 30.5 g',
      '1 tbsp = 15 g',
      '1 quart = 976 g',
      '1 individual school container = 244 g',
    ]);
  });

  it('emits an FNDDS food of several ingredients, or of a cooked one, itself', async () => {
    const foods = await fixtureFoods();

    expect(foods.get('fndds:11100000')).toMatchObject({
      name: 'Milk, NFS',
      lastModified: '2022-10-28T00:00:00.000Z',
    });
    expect(labels(foods.get('fndds:11100000'))).toEqual([
      '1 cup = 244 g',
      '1 fl oz = 30.5 g',
      '1 individual school container = 244 g',
    ]);
    expect(foods.get('fndds:24198736')?.name).toBe(
      'Chicken nuggets, from frozen',
    );
  });

  it('logs what it read, the FNDDS foods it attached and the foods it rejected', async () => {
    const { logger, logs } = capturingLogger();

    await readAll(contextWith(fetchServing().fetch, { logger }));

    expect(logs.filter(({ msg }) => msg === 'rejected a USDA food')).toEqual([
      expect.objectContaining({ reason: 'fndds:11000000: declares no energy' }),
    ]);
    expect(
      logs.find(({ msg }) => msg === 'read USDA FoodData Central'),
    ).toMatchObject({
      read: { foundation: 16, 'sr-legacy': 6, fndds: 8 },
      analysedInBoth: 1,
      describedByFndds: 5,
      rejected: 1,
      foods: 23,
    });
    expect(
      logs.some(({ msg }) => msg.includes('neither mapped nor ignored')),
    ).toBe(false);
  });

  it('warns about nutrient numbers it neither maps nor ignores', async () => {
    const { logger, logs } = capturingLogger();
    const withUnknown = zipOf([
      ...[
        'food.csv',
        'nutrient.csv',
        'measure_unit.csv',
        'food_portion.csv',
        'input_food.csv',
        'survey_fndds_food.csv',
      ].map((file) => ({
        name: file,
        content: Buffer.from(
          {
            'food.csv':
              '"fdc_id","data_type","description","food_category_id","publication_date"\n"1","survey_fndds_food","Water, tap","","2024-10-31"\n',
            'nutrient.csv': '"id","name","unit_name","nutrient_nbr","rank"\n',
            'measure_unit.csv': '"id","name"\n',
            'food_portion.csv':
              '"id","fdc_id","seq_num","amount","measure_unit_id","portion_description","modifier","gram_weight"\n',
            'input_food.csv': '"id","fdc_id","sr_code","retention_code"\n',
            'survey_fndds_food.csv': '"fdc_id","food_code"\n"1","94000100"\n',
          }[file] ?? '',
        ),
      })),
      {
        name: 'food_nutrient.csv',
        content: Buffer.from(
          '"id","fdc_id","nutrient_id","amount"\n"1","1","208","0"\n"2","1","999","1"\n',
        ),
      },
    ]);
    const { fetch } = fetchServing({
      ...fixtureArchives,
      [usdaDatasetUrls.fndds]: withUnknown,
    });

    const foods = await readAll(contextWith(fetch, { logger }));

    expect(foods.at(-1)).toMatchObject({
      sourceId: 'fndds:94000100',
      nutrients: { energy_kcal: 0 },
    });
    expect(
      logs.find(({ msg }) => msg.includes('neither mapped nor ignored')),
    ).toMatchObject({ numbers: ['999'] });
  });

  it.each(usdaDatasets)(
    'fails when the %s download fails',
    async (dataset: UsdaDataset) => {
      const { fetch } = fetchServing({
        ...fixtureArchives,
        [usdaDatasetUrls[dataset]]: undefined as unknown as Buffer,
      });

      await expect(readAll(contextWith(fetch))).rejects.toThrow(
        `${usdaDatasetUrls[dataset]} answered 404`,
      );
    },
  );

  it('fails when an archive lacks a file it reads', async () => {
    const { fetch } = fetchServing({
      ...fixtureArchives,
      [usdaDatasetUrls['sr-legacy']]: zipOf([
        { name: 'nutrient.csv', content: Buffer.from('"id"\n') },
      ]),
    });

    await expect(readAll(contextWith(fetch))).rejects.toThrow(
      'The sr-legacy archive has no sr_legacy_food.csv',
    );
  });
});

describe('importing USDA FoodData Central', () => {
  const db = migratedDatabasePerTest();

  it('writes every food with its portions, and changes nothing on a second run', async () => {
    let tick = 0;
    const clock = {
      now: () => new Date(Date.UTC(2026, 9, 19, 0, 0, tick++)).toISOString(),
      nextId: () => `id-${tick++}`,
    };
    const run = () =>
      importFoods({
        db: db(),
        sources: [createUsdaSource()],
        clock,
        logger: pino({ enabled: false }),
        signal: new AbortController().signal,
        workDir: join(tmpdir(), 'macro-tracker-usda-import'),
        fetch: fetchServing().fetch,
      });

    const first = await run();
    const second = await run();

    expect(first.started && first.run).toMatchObject({
      status: 'succeeded',
      inserted: 23,
      archived: 0,
    });
    expect(second.started && second.run).toMatchObject({
      status: 'succeeded',
      inserted: 0,
      updated: 23,
      archived: 0,
    });
    const portions = await db()
      .selectFrom('food_portions')
      .innerJoin('foods', 'foods.id', 'food_portions.food_id')
      .where('foods.source_id', '=', 'ndb:1077')
      .select(['label', 'grams'])
      .orderBy('position')
      .execute();
    expect(portions.map(({ label }) => label)).toEqual([
      '1 cup',
      '1 fl oz',
      '1 tbsp',
      '1 quart',
      '1 individual school container',
    ]);
  });
});
