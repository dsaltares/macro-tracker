import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { foodImportWorkDir, importFoods } from '../lib/data/import-foods.ts';
import { createFixtureSource } from '../lib/data/sources/fixture.ts';
import { chooseSources } from '../lib/data/sources/registry.ts';
import type { FoodSource } from '../lib/data/sources/types.ts';
import { createDatabase } from '../lib/db/client.ts';
import { migrateToLatest } from '../lib/db/migrator.ts';
import { databaseUrl } from '../lib/db/url.ts';
import { referenceSources } from '../lib/domain/foods/sources.ts';
import { getLogger } from '../lib/logger.ts';

const usage = `Usage: yarn db:import-foods [--source ${referenceSources.join(',')}] [--fixture]`;

const chosenSources = (): FoodSource[] => {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      fixture: { type: 'boolean', default: false },
    },
  });
  if (values.fixture) {
    if (values.source !== undefined) {
      throw new Error(`--fixture imports the fixture alone\n${usage}`);
    }
    return [createFixtureSource()];
  }
  const chosen = chooseSources({
    ids: values.source?.split(',').map((id) => id.trim()),
  });
  if (!chosen.found) {
    throw new Error(
      `No source adapter for ${chosen.unknown.join(', ')}\n${usage}`,
    );
  }
  if (chosen.sources.length === 0) {
    throw new Error(`No source adapters yet; pass --fixture\n${usage}`);
  }
  return chosen.sources;
};

const run = async () => {
  const sources = chosenSources();
  const db = createDatabase();
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort(new Error('Interrupted')));
  try {
    await migrateToLatest(db);
    console.log(
      `Importing ${sources.map(({ id }) => id).join(', ')} into ${databaseUrl()}`,
    );
    const outcome = await importFoods({
      db,
      sources,
      clock: {
        now: () => new Date().toISOString(),
        nextId: () => randomUUID(),
      },
      logger: getLogger('import-foods'),
      signal: controller.signal,
      workDir: foodImportWorkDir(),
    });
    if (!outcome.started) {
      console.error(
        `Refused: import ${outcome.running.id} has been running since ${outcome.running.started_at}`,
      );
      process.exitCode = 1;
      return;
    }
    const { status, inserted, updated, archived, error } = outcome.run;
    console.log(
      `${status}: ${inserted} inserted, ${updated} updated, ${archived} archived`,
    );
    if (status === 'failed') {
      console.error(error);
      process.exitCode = 1;
    }
  } finally {
    await db.destroy();
  }
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
