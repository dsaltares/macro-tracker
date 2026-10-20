import { setTimeout } from 'node:timers/promises';
import type { FoodSource, SourceContext } from '../types.ts';
import { decompressedLines } from './lines.ts';
import type { OffProduct } from './mapping.ts';
import {
  emptyProductCounts,
  keptFood,
  type ProductCounts,
  type ProductRead,
} from './products.ts';

export const offExportUrl =
  'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz';

export type ExportOptions = {
  url?: string;
  maxResumes?: number;
  resumeDelayMs?: number;
};

export type ExportCounts = {
  bytes: number;
  resumes: number;
  lines: number;
  malformed: number;
} & ProductCounts;

const defaultMaxResumes = 5;
const defaultResumeDelayMs = 5_000;
const partialContent = 206;
const progressEveryLines = 500_000;

const columnSeparator = '\t';
const listSeparator = ',';
const nutrimentSuffix = '_100g';
const unixSeconds = /^\d+$/;

const emptyCounts = (): ExportCounts => ({
  bytes: 0,
  resumes: 0,
  lines: 0,
  malformed: 0,
  ...emptyProductCounts(),
});

type Resume = { from: number; validator: string };

const requestFor = (
  signal: AbortSignal,
  resume: Resume | undefined,
): RequestInit =>
  resume
    ? {
        signal,
        headers: {
          Range: `bytes=${resume.from}-`,
          'If-Range': resume.validator,
        },
      }
    : { signal };

const assertAnswered = (
  url: string,
  response: Response,
  resume: Resume | undefined,
): ReadableStream<Uint8Array> => {
  if (resume && response.status !== partialContent) {
    throw new Error(
      `${url} answered ${response.status} to resuming at byte ${resume.from}: the export changed upstream or the server no longer resumes`,
    );
  }
  if (!response.ok || !response.body) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response.body;
};

async function* exportBytes(
  url: string,
  { fetch, logger, signal }: SourceContext,
  { maxResumes, resumeDelayMs }: Required<Omit<ExportOptions, 'url'>>,
  counts: ExportCounts,
): AsyncGenerator<Uint8Array> {
  let validator: string | null = null;
  let resume: Resume | undefined;
  for (;;) {
    const response = await fetch(url, requestFor(signal, resume));
    const body = assertAnswered(url, response, resume);
    validator ??=
      response.headers.get('etag') ?? response.headers.get('last-modified');
    try {
      for await (const chunk of body) {
        counts.bytes += chunk.byteLength;
        yield chunk;
      }
      return;
    } catch (error) {
      if (
        signal.aborted ||
        validator === null ||
        counts.resumes >= maxResumes
      ) {
        throw error;
      }
      counts.resumes += 1;
      logger.warn(
        { err: error, bytes: counts.bytes, resumes: counts.resumes },
        'the Open Food Facts export was interrupted; resuming',
      );
      await setTimeout(resumeDelayMs, undefined, { signal });
      resume = { from: counts.bytes, validator };
    }
  }
}

const readerOf = (header: string[]) => {
  const index = new Map(header.map((column, at) => [column, at]));
  const nutrimentColumns = header.flatMap((column, at) =>
    column.endsWith(nutrimentSuffix) ? [[column, at] as const] : [],
  );
  return (fields: string[]): ProductRead => {
    const field = (column: string) => {
      const at = index.get(column);
      return at === undefined ? undefined : fields[at] || undefined;
    };
    return {
      countryTags: () => field('countries_tags')?.split(listSeparator) ?? [],
      code: () => field('code') ?? '',
      nutriments: () =>
        Object.fromEntries(
          nutrimentColumns.flatMap(([column, at]) =>
            fields[at] ? [[column, fields[at]]] : [],
          ),
        ),
      product: (nutriments): OffProduct => ({
        code: field('code') ?? '',
        product_name: field('product_name'),
        brands: field('brands') ?? field('brands_en'),
        quantity: field('quantity'),
        serving_size: field('serving_size'),
        serving_quantity: field('serving_quantity'),
        // The export's header swaps the `_t` and `_datetime` names, so the Unix time is under either.
        last_modified_t: [
          field('last_modified_t'),
          field('last_modified_datetime'),
        ].find((value) => value !== undefined && unixSeconds.test(value)),
        nutriments,
      }),
    };
  };
};

export const createOpenFoodFactsSource = ({
  url = offExportUrl,
  maxResumes = defaultMaxResumes,
  resumeDelayMs = defaultResumeDelayMs,
}: ExportOptions = {}): FoodSource => ({
  id: 'off',
  kind: 'full',
  emits: ['off'],
  async *fetch(context) {
    const { logger } = context;
    const startedAt = performance.now();
    const counts = emptyCounts();
    const bytes = exportBytes(
      url,
      context,
      { maxResumes, resumeDelayMs },
      counts,
    );
    let read: ReturnType<typeof readerOf> | undefined;
    let width = 0;
    for await (const line of decompressedLines(bytes)) {
      if (read === undefined) {
        const header = line.split(columnSeparator);
        read = readerOf(header);
        width = header.length;
        continue;
      }
      counts.lines += 1;
      if (counts.lines % progressEveryLines === 0) {
        logger.info(counts, 'reading the Open Food Facts export');
      }
      const fields = line.split(columnSeparator);
      if (fields.length !== width) {
        counts.malformed += 1;
        logger.debug(
          { line: counts.lines + 1, fields: fields.length, expected: width },
          'skipped a malformed line of the Open Food Facts export',
        );
        continue;
      }
      const food = keptFood(read(fields), counts, logger);
      if (food) {
        yield food;
      }
    }
    logger.info(
      { ...counts, ms: Math.round(performance.now() - startedAt) },
      'read the Open Food Facts export',
    );
  },
});
