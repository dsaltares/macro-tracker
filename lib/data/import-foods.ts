import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import {
  type FoodImportCounts,
  type FoodImportOutcome,
  type FoodImportStart,
  finishFoodImport,
  recordFoodImportProgress,
  startFoodImport,
} from '../db/food-imports.ts';
import {
  archiveUnseenFoods,
  type FoodWriteContext,
  type ReferenceFoodInput,
  upsertFoods,
} from '../db/foods.ts';
import type { Database } from '../db/schema.ts';
import { databaseUrl } from '../db/url.ts';
import type { SourceFood } from '../domain/foods/source-food.ts';
import type { FoodSource, SourceContext } from './sources/types.ts';

export const defaultBatchSize = 2000;

export const foodImportWorkDir = () => join(dirname(databaseUrl()), 'imports');

export type ImportFoodsOptions = {
  db: Kysely<Database>;
  sources: readonly FoodSource[];
  clock: FoodWriteContext;
  logger: Logger;
  signal: AbortSignal;
  workDir: string;
  fetch?: typeof globalThis.fetch;
  batchSize?: number;
};

const referenceFood = (food: SourceFood): ReferenceFoodInput => ({
  source: food.source,
  source_id: food.sourceId,
  barcode: food.barcode,
  name: food.name,
  original_name: food.originalName,
  brand: food.brand,
  quantity_label: food.quantityLabel,
  nutrients: food.nutrients,
  portions: food.portions,
});

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const importFoods = async ({
  db,
  sources,
  clock,
  logger,
  signal,
  workDir,
  fetch = globalThis.fetch,
  batchSize = defaultBatchSize,
}: ImportFoodsOptions): Promise<FoodImportStart> => {
  const startedAt = clock.now();
  const start = await startFoodImport(db, {
    id: clock.nextId(),
    sources: sources.map(({ id }) => id),
    startedAt,
  });
  if (!start.started) {
    logger.warn({ running: start.running.id }, 'An import is already running');
    return start;
  }
  const { run } = start;
  const runLogger = logger.child({ import: run.id });
  const counts: FoodImportCounts = { inserted: 0, updated: 0, archived: 0 };

  const writeBatch = async (batch: ReferenceFoodInput[]) => {
    signal.throwIfAborted();
    const written = await upsertFoods(db, batch, clock);
    counts.inserted += written.inserted;
    counts.updated += written.updated;
    await recordFoodImportProgress(db, run.id, counts);
    await setImmediate();
  };

  const importSource = async (source: FoodSource, context: SourceContext) => {
    let batch: ReferenceFoodInput[] = [];
    for await (const food of source.fetch(context)) {
      batch.push(referenceFood(food));
      if (batch.length >= batchSize) {
        await writeBatch(batch);
        batch = [];
      }
    }
    if (batch.length > 0) {
      await writeBatch(batch);
    }
    signal.throwIfAborted();
    counts.archived += await archiveUnseenFoods(
      db,
      source.emits,
      startedAt,
      clock.now,
    );
    await recordFoodImportProgress(db, run.id, counts);
  };

  const finish = async (outcome: FoodImportOutcome) => ({
    started: true as const,
    run: await finishFoodImport(db, run.id, counts, outcome, clock.now),
  });

  let tempDir: string | undefined;
  try {
    runLogger.info({ sources: run.sources }, 'Importing foods');
    await mkdir(workDir, { recursive: true });
    tempDir = await mkdtemp(join(workDir, 'food-import-'));
    for (const source of sources) {
      const sourceLogger = runLogger.child({ source: source.id });
      await importSource(source, {
        fetch,
        tempDir,
        logger: sourceLogger,
        signal,
      });
      sourceLogger.info({ ...counts }, 'Imported a source');
    }
    runLogger.info({ ...counts }, 'Imported foods');
    return await finish({ status: 'succeeded' });
  } catch (error) {
    runLogger.error({ err: error }, 'Food import failed');
    return await finish({ status: 'failed', error: reasonOf(error) });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
};
