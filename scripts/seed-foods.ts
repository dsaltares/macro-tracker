import { randomUUID } from 'node:crypto';
import { foodImportWorkDir } from '../lib/data/import-foods.ts';
import { seedFoods } from '../lib/data/seed-foods.ts';
import { createDatabase } from '../lib/db/client.ts';
import { migrateToLatest } from '../lib/db/migrator.ts';
import { databaseUrl } from '../lib/db/url.ts';
import { getLogger } from '../lib/logger.ts';

const run = async () => {
  const db = createDatabase();
  try {
    await migrateToLatest(db);
    const seed = await seedFoods({
      db,
      clock: {
        now: () => new Date().toISOString(),
        nextId: () => randomUUID(),
      },
      logger: getLogger('seed-foods'),
      signal: new AbortController().signal,
      workDir: foodImportWorkDir(),
    });
    if (!seed.seeded) {
      console.log(`${databaseUrl()} already has foods; nothing to seed`);
      return;
    }
    if (!seed.start.started) {
      console.error(
        `Refused: import ${seed.start.running.id} has been running since ${seed.start.running.started_at}`,
      );
      process.exitCode = 1;
      return;
    }
    const { status, inserted, error } = seed.start.run;
    console.log(`Seeded ${databaseUrl()}: ${status}, ${inserted} foods`);
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
