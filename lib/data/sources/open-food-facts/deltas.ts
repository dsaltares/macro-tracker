import { z } from 'zod';
import type { FoodSource, SourceContext } from '../types.ts';
import { decompressedLines } from './lines.ts';
import {
  nutrimentsFromNutrition,
  offNutritionSchema,
  offProductSchema,
} from './mapping.ts';
import {
  emptyProductCounts,
  keptFood,
  type ProductCounts,
  type ProductRead,
} from './products.ts';

export const offDeltasUrl = 'https://static.openfoodfacts.org/data/delta/';

const indexName = 'index.txt';
const deltaFileName = /^openfoodfacts_products_(\d+)_(\d+)\.json\.gz$/;
const millisecondsPerSecond = 1000;

export type DeltaFile = { name: string; from: number; to: number };

export type DeltasOptions = { url?: string };

export type DeltaCounts = {
  files: number;
  bytes: number;
  lines: number;
  malformed: number;
} & ProductCounts;

const emptyCounts = (): DeltaCounts => ({
  files: 0,
  bytes: 0,
  lines: 0,
  malformed: 0,
  ...emptyProductCounts(),
});

export const deltaFilesOf = (index: string): DeltaFile[] =>
  index
    .split('\n')
    .flatMap((line) => {
      const match = deltaFileName.exec(line.trim());
      return match
        ? [{ name: match[0], from: Number(match[1]), to: Number(match[2]) }]
        : [];
    })
    .sort((a, b) => a.from - b.from);

export const deltaFilesSince = (
  files: readonly DeltaFile[],
  since: string | null,
) => {
  if (since === null) {
    return [...files];
  }
  const sinceSeconds = Date.parse(since) / millisecondsPerSecond;
  return files.filter(({ to }) => to > sinceSeconds);
};

const deltaProductSchema = offProductSchema.extend({
  countries_tags: z.array(z.string()).nullish(),
  nutrition: offNutritionSchema.nullish(),
});

type DeltaProduct = z.output<typeof deltaProductSchema>;

const nutrimentsOf = (product: DeltaProduct) =>
  product.nutrition?.aggregated_set
    ? nutrimentsFromNutrition(product.nutrition)
    : product.nutriments;

const readOf = (product: DeltaProduct): ProductRead => ({
  countryTags: () => product.countries_tags ?? [],
  code: () => product.code,
  nutriments: () => nutrimentsOf(product),
  product: (nutriments) => ({ ...product, nutriments }),
});

const parseProduct = (line: string) => {
  try {
    return deltaProductSchema.safeParse(JSON.parse(line));
  } catch {
    return undefined;
  }
};

const fetchOk = async (url: string, { fetch, signal }: SourceContext) => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response;
};

async function* countedBytes(
  body: ReadableStream<Uint8Array> | null,
  counts: DeltaCounts,
): AsyncGenerator<Uint8Array> {
  for await (const chunk of body ?? []) {
    counts.bytes += chunk.byteLength;
    yield chunk;
  }
}

export const createOpenFoodFactsDeltasSource = ({
  url = offDeltasUrl,
}: DeltasOptions = {}): FoodSource => ({
  id: 'off-deltas',
  kind: 'delta',
  emits: ['off'],
  async *fetch(context) {
    const { logger, lastSucceededAt } = context;
    const startedAt = performance.now();
    const counts = emptyCounts();
    const index = await (
      await fetchOk(new URL(indexName, url).href, context)
    ).text();
    const files = deltaFilesSince(deltaFilesOf(index), lastSucceededAt);
    logger.info(
      { since: lastSucceededAt, files: files.map(({ name }) => name) },
      'reading the Open Food Facts deltas',
    );
    for (const file of files) {
      const response = await fetchOk(new URL(file.name, url).href, context);
      for await (const line of decompressedLines(
        countedBytes(response.body, counts),
      )) {
        if (line.trim() === '') {
          continue;
        }
        counts.lines += 1;
        const parsed = parseProduct(line);
        if (!parsed?.success) {
          counts.malformed += 1;
          logger.debug(
            { file: file.name, line: counts.lines },
            'skipped a malformed line of an Open Food Facts delta',
          );
          continue;
        }
        const food = keptFood(readOf(parsed.data), counts, logger);
        if (food) {
          yield food;
        }
      }
      counts.files += 1;
    }
    logger.info(
      { ...counts, ms: Math.round(performance.now() - startedAt) },
      'read the Open Food Facts deltas',
    );
  },
});
