import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { seedFoods } from '../lib/data/seed-foods.ts';
import { createDatabase } from '../lib/db/client.ts';
import { migrateToLatest } from '../lib/db/migrator.ts';
import { getLogger } from '../lib/logger.ts';
import { e2eDatabaseUrl } from '../playwright.config.ts';

const sqliteSidecars = ['', '-wal', '-shm'];

export default async function globalSetup() {
  await Promise.all(
    sqliteSidecars.map((suffix) =>
      rm(`${e2eDatabaseUrl}${suffix}`, { force: true }),
    ),
  );
  const db = createDatabase(e2eDatabaseUrl);
  try {
    await migrateToLatest(db);
    const seed = await seedFoods({
      db,
      clock: {
        now: () => new Date().toISOString(),
        nextId: () => randomUUID(),
      },
      logger: getLogger('e2e-seed'),
      signal: new AbortController().signal,
      workDir: join(dirname(e2eDatabaseUrl), 'imports'),
    });
    if (
      seed.seeded &&
      seed.start.started &&
      seed.start.run.status !== 'succeeded'
    ) {
      throw new Error(
        `Seeding the e2e database failed: ${seed.start.run.error}`,
      );
    }
  } finally {
    await db.destroy();
  }
}
