import { z } from 'zod';
import type { FoodSource, SourceContext } from '../types.ts';
import {
  type CiqualComposition,
  declaresEnergy,
  sourceFoodFromCiqual,
} from './mapping.ts';
import { xmlRecords } from './xml.ts';

const dataverse = 'https://entrepot.recherche.data.gouv.fr';

export const ciqualDatasetDoi = 'doi:10.57745/RDMHWY';

export const ciqualDatasetUrl = `${dataverse}/api/datasets/:persistentId/?persistentId=${ciqualDatasetDoi}`;

export const ciqualFileUrl = (id: number) =>
  `${dataverse}/api/access/datafile/${id}`;

export type TableOptions = {
  datasetUrl?: string;
};

export type TableCounts = {
  foods: number;
  noEnergy: number;
  unnamed: number;
  rejected: number;
  kept: number;
};

const datasetSchema = z.object({
  data: z.object({
    latestVersion: z.object({
      releaseTime: z.iso.datetime({ offset: true }).nullish(),
      files: z.array(
        z.object({
          dataFile: z.object({ id: z.number(), filename: z.string() }),
        }),
      ),
    }),
  }),
});

const foodsFile = /^alim_\d{4}_\d{2}_\d{2}\.xml$/;
const compositionFile = /^compo_\d{4}_\d{2}_\d{2}\.xml$/;

const answered = async (
  url: string,
  { fetch, signal }: SourceContext,
): Promise<Response & { body: ReadableStream<Uint8Array> }> => {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response as Response & { body: ReadableStream<Uint8Array> };
};

const releaseOf = async (url: string, context: SourceContext) => {
  const { latestVersion } = datasetSchema.parse(
    await (await answered(url, context)).json(),
  ).data;
  const fileMatching = (pattern: RegExp) => {
    const file = latestVersion.files.find(({ dataFile }) =>
      pattern.test(dataFile.filename),
    );
    if (!file) {
      throw new Error(`${url} lists no file named like ${pattern}`);
    }
    return ciqualFileUrl(file.dataFile.id);
  };
  return {
    foods: fileMatching(foodsFile),
    composition: fileMatching(compositionFile),
    lastModified: latestVersion.releaseTime
      ? new Date(latestVersion.releaseTime).toISOString()
      : null,
  };
};

type Names = { english: string | undefined; french: string | undefined };

const recordsAt = async (url: string, tag: string, context: SourceContext) =>
  xmlRecords((await answered(url, context)).body, tag);

const namesAt = async (url: string, context: SourceContext) => {
  const names = new Map<string, Names>();
  for await (const food of await recordsAt(url, 'ALIM', context)) {
    if (food.alim_code !== undefined) {
      names.set(food.alim_code, {
        english: food.alim_nom_eng,
        french: food.alim_nom_fr,
      });
    }
  }
  return names;
};

type FoodComposition = { code: string; composition: CiqualComposition };

async function* compositionsAt(
  url: string,
  context: SourceContext,
): AsyncGenerator<FoodComposition> {
  const done = new Set<string>();
  let current = null as {
    code: string;
    composition: Record<string, string>;
  } | null;
  for await (const row of await recordsAt(url, 'COMPO', context)) {
    const { alim_code: code, const_code: constituent, teneur } = row;
    if (code === undefined || constituent === undefined) {
      continue;
    }
    if (current?.code !== code) {
      if (current) {
        done.add(current.code);
        yield current;
      }
      if (done.has(code)) {
        throw new Error(
          `${url} is not grouped by food: ${code} appears again after another food`,
        );
      }
      current = { code, composition: {} };
    }
    if (teneur !== undefined) {
      current.composition[constituent] = teneur;
    }
  }
  if (current) {
    yield current;
  }
}

const emptyCounts = (): TableCounts => ({
  foods: 0,
  noEnergy: 0,
  unnamed: 0,
  rejected: 0,
  kept: 0,
});

export const createCiqualSource = ({
  datasetUrl = ciqualDatasetUrl,
}: TableOptions = {}): FoodSource => ({
  id: 'ciqual',
  kind: 'full',
  emits: ['ciqual'],
  async *fetch(context) {
    const { logger } = context;
    const startedAt = performance.now();
    const counts = emptyCounts();
    const release = await releaseOf(datasetUrl, context);
    const names = await namesAt(release.foods, context);
    for await (const { code, composition } of compositionsAt(
      release.composition,
      context,
    )) {
      counts.foods += 1;
      const name = names.get(code);
      if (!name) {
        counts.unnamed += 1;
        logger.debug({ code }, 'skipped a CIQUAL food with no name');
        continue;
      }
      if (!declaresEnergy(composition)) {
        counts.noEnergy += 1;
        continue;
      }
      const mapped = sourceFoodFromCiqual({
        code,
        nameEnglish: name.english,
        nameFrench: name.french,
        composition,
        lastModified: release.lastModified,
      });
      if (!mapped.success) {
        counts.rejected += 1;
        logger.debug({ reason: mapped.reason }, 'rejected a CIQUAL food');
        continue;
      }
      counts.kept += 1;
      yield mapped.food;
    }
    logger.info(
      { ...counts, ms: Math.round(performance.now() - startedAt) },
      'read the CIQUAL table',
    );
  },
});
