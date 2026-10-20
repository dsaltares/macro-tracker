import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { FoodImportStart } from '../db/food-imports.ts';
import { getLogger } from '../logger.ts';
import { type ImportFoodsOptions, launchFoodImport } from './import-foods.ts';
import type { ImportWorkerData, ImportWorkerMessage } from './import-worker.ts';
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

// Next doesn't bundle a worker thread's entry, so the image bundles it on its own
// (`yarn build:import-worker`) and names it in `FOOD_IMPORT_WORKER`; anywhere else Node runs the
// source, stripping its types as it does for `scripts/`.
// The source path is in parts: Turbopack follows a whole one into `new Worker` and panics.
const importWorkerSource = ['lib', 'data', 'import-worker.ts'];

const importWorkerPath = () =>
  process.env.FOOD_IMPORT_WORKER || join(process.cwd(), ...importWorkerSource);

// Answers once the worker has its `food_imports` row; the import runs on after that.
export const serverFoodImport: StartFoodImport = (sources) =>
  new Promise((resolve, reject) => {
    const logger = getLogger('import-foods');
    const workerData: ImportWorkerData = {
      sourceIds: sources.map(({ id }) => id),
    };
    const worker = new Worker(importWorkerPath(), {
      workerData,
    });
    let answered = false;
    worker.once('message', (start: ImportWorkerMessage) => {
      answered = true;
      resolve(start);
    });
    worker.on('error', (error) => {
      if (answered) {
        logger.error({ err: error }, 'The food import worker failed');
      } else {
        reject(error);
      }
    });
    worker.on('exit', (code) => {
      if (!answered) {
        reject(new Error(`The food import worker exited with ${code}`));
      }
    });
  });
