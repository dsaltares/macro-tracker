import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { FoodImportStart } from '../db/food-imports.ts';
import type { Database } from '../db/schema.ts';
import { getLogger } from '../logger.ts';
import {
  foodImportWorkDir,
  type ImportFoodsOptions,
  launchFoodImport,
} from './import-foods.ts';
import type { FoodSource } from './sources/types.ts';

export const importFoodsInBackground = async (
  options: ImportFoodsOptions,
): Promise<FoodImportStart> => {
  const launch = await launchFoodImport(options);
  if (!launch.started) {
    return launch;
  }
  launch.finished.catch((error: unknown) => {
    options.logger.error(
      { err: error, import: launch.run.id },
      'Could not record the end of a food import',
    );
  });
  return { started: true, run: launch.run };
};

export type StartFoodImport = (
  sources: readonly FoodSource[],
) => Promise<FoodImportStart>;

export const serverFoodImport =
  (db: Kysely<Database>): StartFoodImport =>
  (sources) =>
    importFoodsInBackground({
      db,
      sources,
      clock: {
        now: () => new Date().toISOString(),
        nextId: () => randomUUID(),
      },
      logger: getLogger('import-foods'),
      signal: new AbortController().signal,
      workDir: foodImportWorkDir(),
    });
