import type { SourcePortion } from '../../../domain/foods/source-food.ts';
import type { FoodSource, SourceContext } from '../types.ts';
import { csvRecords } from './csv.ts';
import {
  ignoredUsdaNutrients,
  mergeReferenceFoods,
  sourceFoodFromUsda,
  type UsdaDataset,
  type UsdaFood,
  usdaNutrients,
  usdaPortion,
} from './mapping.ts';
import { findZipEntry, readZipEntry, zipEntries } from './zip.ts';

const fdcDatasets = 'https://fdc.nal.usda.gov/fdc-datasets';

export const usdaDatasetUrls: Readonly<Record<UsdaDataset, string>> = {
  foundation: `${fdcDatasets}/FoodData_Central_foundation_food_csv_2026-04-30.zip`,
  'sr-legacy': `${fdcDatasets}/FoodData_Central_sr_legacy_food_csv_2018-04.zip`,
  fndds: `${fdcDatasets}/FoodData_Central_survey_food_csv_2024-10-31.zip`,
};

type DatasetLayout = {
  foods: string;
  code: string;
  nutrientIdIs: 'id' | 'number';
};

const layouts: Record<UsdaDataset, DatasetLayout> = {
  foundation: {
    foods: 'foundation_food.csv',
    code: 'NDB_number',
    nutrientIdIs: 'id',
  },
  'sr-legacy': {
    foods: 'sr_legacy_food.csv',
    code: 'NDB_number',
    nutrientIdIs: 'id',
  },
  fndds: {
    foods: 'survey_fndds_food.csv',
    code: 'food_code',
    nutrientIdIs: 'number',
  },
};

const referenceDatasets = ['foundation', 'sr-legacy'] as const;

const noRetention = new Set(['', '0']);

const mappedNumbers = new Set(usdaNutrients.map(({ number }) => number));
const ignoredNumbers = new Set(Object.keys(ignoredUsdaNutrients));

export type UsdaCounts = {
  bytes: number;
  read: Record<UsdaDataset, number>;
  analysedInBoth: number;
  describedByFndds: number;
  rejected: number;
  foods: number;
};

const perDataset = () => ({ foundation: 0, 'sr-legacy': 0, fndds: 0 });

const emptyCounts = (): UsdaCounts => ({
  bytes: 0,
  read: perDataset(),
  analysedInBoth: 0,
  describedByFndds: 0,
  rejected: 0,
  foods: 0,
});

type Archive = {
  dataset: UsdaDataset;
  records: (file: string) => AsyncGenerator<Record<string, string>>;
};

const download = async (
  url: string,
  { fetch, signal }: SourceContext,
  counts: UsdaCounts,
) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  const zip = Buffer.from(await response.arrayBuffer());
  counts.bytes += zip.byteLength;
  return zip;
};

const archiveOf = (dataset: UsdaDataset, zip: Buffer): Archive => {
  const entries = zipEntries(zip);
  return {
    dataset,
    records: (file) => {
      const entry = findZipEntry(entries, file);
      if (!entry) {
        throw new Error(`The ${dataset} archive has no ${file}`);
      }
      return csvRecords(readZipEntry(zip, entry).setEncoding('utf8'));
    },
  };
};

const codesOf = async ({ dataset, records }: Archive) => {
  const { foods, code } = layouts[dataset];
  const codes = new Map<string, string>();
  for await (const row of records(foods)) {
    const value = row[code]?.trim();
    if (row.fdc_id && value) {
      codes.set(row.fdc_id, value);
    }
  }
  return codes;
};

type MutableFood = UsdaFood & {
  amounts: Map<string, number>;
  portions: SourcePortion[];
};

const readFoods = async (
  archive: Archive,
  unknownNumbers: Set<string>,
): Promise<Map<string, MutableFood>> => {
  const { dataset, records } = archive;
  const codes = await codesOf(archive);
  const foods = new Map<string, MutableFood>();

  const numbers = new Map<string, string>();
  for await (const row of records('nutrient.csv')) {
    if (row.id && row.nutrient_nbr) {
      numbers.set(row.id, row.nutrient_nbr);
    }
  }
  const units = new Map<string, string>();
  for await (const row of records('measure_unit.csv')) {
    units.set(row.id ?? '', row.name ?? '');
  }

  for await (const row of records('food.csv')) {
    const code = codes.get(row.fdc_id ?? '');
    if (code !== undefined) {
      foods.set(row.fdc_id ?? '', {
        dataset,
        code,
        name: row.description ?? '',
        publishedOn: row.publication_date ?? '',
        amounts: new Map(),
        portions: [],
      });
    }
  }

  const ranked = new Map<SourcePortion, number>();
  for await (const row of records('food_portion.csv')) {
    const food = foods.get(row.fdc_id ?? '');
    const portion =
      food &&
      usdaPortion(dataset, {
        amount: row.amount ?? '',
        unit: units.get(row.measure_unit_id ?? ''),
        description: row.portion_description ?? '',
        modifier: row.modifier ?? '',
        grams: row.gram_weight ?? '',
      });
    if (portion) {
      const seq = Number(row.seq_num || Number.POSITIVE_INFINITY);
      ranked.set(
        portion,
        Number.isFinite(seq) ? seq : Number.POSITIVE_INFINITY,
      );
      food.portions.push(portion);
    }
  }
  for (const food of foods.values()) {
    food.portions.sort((a, b) => (ranked.get(a) ?? 0) - (ranked.get(b) ?? 0));
  }

  const numberOf =
    layouts[dataset].nutrientIdIs === 'id'
      ? (id: string) => numbers.get(id)
      : (id: string) => id;
  for await (const row of records('food_nutrient.csv')) {
    const food = foods.get(row.fdc_id ?? '');
    const number = numberOf(row.nutrient_id ?? '');
    const amount = Number(row.amount || Number.NaN);
    if (!food || number === undefined || !Number.isFinite(amount)) {
      continue;
    }
    if (mappedNumbers.has(number)) {
      food.amounts.set(number, amount);
    } else if (!ignoredNumbers.has(number)) {
      unknownNumbers.add(number);
    }
  }
  return foods;
};

const describedCodes = async ({ records }: Archive) => {
  const ingredients = new Map<string, Record<string, string>[]>();
  for await (const row of records('input_food.csv')) {
    const fdcId = row.fdc_id ?? '';
    ingredients.set(fdcId, [...(ingredients.get(fdcId) ?? []), row]);
  }
  const described = new Map<string, string>();
  for (const [fdcId, rows] of ingredients) {
    const [only] = rows;
    const code = only?.sr_code?.trim();
    if (
      rows.length === 1 &&
      code &&
      noRetention.has(only?.retention_code ?? '')
    ) {
      described.set(fdcId, code);
    }
  }
  return described;
};

export const createUsdaSource = ({
  urls = usdaDatasetUrls,
}: {
  urls?: Readonly<Record<UsdaDataset, string>>;
} = {}): FoodSource => ({
  id: 'usda',
  emits: ['usda'],
  async *fetch(context) {
    const { logger } = context;
    const startedAt = performance.now();
    const counts = emptyCounts();
    const unknownNumbers = new Set<string>();

    const archives = {} as Record<UsdaDataset, Archive>;
    for (const dataset of [...referenceDatasets, 'fndds'] as const) {
      archives[dataset] = archiveOf(
        dataset,
        await download(urls[dataset], context, counts),
      );
    }

    const referenceCodes = new Set<string>();
    for (const dataset of referenceDatasets) {
      for (const code of (await codesOf(archives[dataset])).values()) {
        referenceCodes.add(code);
      }
    }

    const fndds = await readFoods(archives.fndds, unknownNumbers);
    const described = await describedCodes(archives.fndds);
    const fnddsPortions = new Map<string, SourcePortion[]>();
    const standalone: UsdaFood[] = [];
    for (const [fdcId, food] of fndds) {
      const code = described.get(fdcId);
      if (code !== undefined && referenceCodes.has(code)) {
        fnddsPortions.set(code, [
          ...(fnddsPortions.get(code) ?? []),
          ...food.portions,
        ]);
        counts.describedByFndds += 1;
      } else {
        standalone.push(food);
      }
    }

    const foundation = await readFoods(archives.foundation, unknownNumbers);
    const srLegacy = await readFoods(archives['sr-legacy'], unknownNumbers);
    counts.read.foundation = foundation.size;
    counts.read['sr-legacy'] = srLegacy.size;
    counts.read.fndds = fndds.size;
    const srLegacyByCode = new Map(
      [...srLegacy.values()].map((food) => [food.code, food]),
    );
    const referenceFoods: UsdaFood[] = [];
    for (const analysed of foundation.values()) {
      const legacy = srLegacyByCode.get(analysed.code);
      srLegacyByCode.delete(analysed.code);
      if (legacy) {
        counts.analysedInBoth += 1;
      }
      referenceFoods.push(
        legacy ? mergeReferenceFoods(analysed, legacy) : analysed,
      );
    }
    referenceFoods.push(...srLegacyByCode.values());

    const mapped = (food: UsdaFood) => {
      const mapping = sourceFoodFromUsda(food);
      if (!mapping.success) {
        counts.rejected += 1;
        logger.debug({ reason: mapping.reason }, 'rejected a USDA food');
        return undefined;
      }
      counts.foods += 1;
      return mapping.food;
    };

    for (const food of referenceFoods) {
      const sourceFood = mapped({
        ...food,
        portions: [...food.portions, ...(fnddsPortions.get(food.code) ?? [])],
      });
      if (sourceFood) {
        yield sourceFood;
      }
    }
    for (const food of standalone) {
      const sourceFood = mapped(food);
      if (sourceFood) {
        yield sourceFood;
      }
    }

    if (unknownNumbers.size > 0) {
      logger.warn(
        { numbers: [...unknownNumbers].sort() },
        'USDA nutrients neither mapped nor ignored',
      );
    }
    logger.info(
      { ...counts, ms: Math.round(performance.now() - startedAt) },
      'read USDA FoodData Central',
    );
  },
});
