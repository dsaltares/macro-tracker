import { parentPort, workerData } from 'node:worker_threads';
import { v7 } from 'uuid';
import { createDatabase } from '../db/client.ts';
import type { FoodImportStart } from '../db/food-imports.ts';
import { getLogger } from '../logger.ts';
import { foodImportWorkDir, launchFoodImport } from './import-foods.ts';
import { chooseSources } from './sources/registry.ts';

// The server's food import, on a worker thread with a connection of its own: better-sqlite3
// is synchronous, so on the main thread every batch would hold up the requests the server answers.

export type ImportWorkerData = { sourceIds: string[] };

export type ImportWorkerMessage = FoodImportStart;

const { sourceIds } = workerData as ImportWorkerData;
const chosen = chooseSources({ ids: sourceIds });
if (!chosen.found) {
  throw new Error(`No source adapter for ${chosen.unknown.join(', ')}`);
}
const db = createDatabase(undefined, { bulkWrites: true });
try {
  const launch = await launchFoodImport({
    db,
    sources: chosen.sources,
    clock: { now: () => new Date().toISOString(), nextId: v7 },
    logger: getLogger('import-foods'),
    signal: new AbortController().signal,
    workDir: foodImportWorkDir(),
  });
  const message: ImportWorkerMessage = launch.started
    ? { started: true, run: launch.run }
    : launch;
  parentPort?.postMessage(message);
  if (launch.started) {
    await launch.finished;
  }
} finally {
  await db.destroy();
}
