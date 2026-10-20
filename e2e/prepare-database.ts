import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { seedDevUser } from '../lib/auth/seed-dev-user.ts';
import { seedFoods } from '../lib/data/seed-foods.ts';
import { createDatabase } from '../lib/db/client.ts';
import { migrateToLatest } from '../lib/db/migrator.ts';
import { getLogger } from '../lib/logger.ts';
import { e2eDatabaseUrl, e2eOutboxDir } from '../playwright.config.ts';

const sqliteSidecars = ['', '-wal', '-shm'];

// Playwright starts the web server before globalSetup, so a reset there deletes the database
// the server already holds open. The server command runs this first instead.
const prepareDatabase = async () => {
  await Promise.all([
    ...sqliteSidecars.map((suffix) =>
      rm(`${e2eDatabaseUrl}${suffix}`, { force: true }),
    ),
    rm(e2eOutboxDir, { recursive: true, force: true }),
  ]);
  const db = createDatabase(e2eDatabaseUrl);
  try {
    await migrateToLatest(db);
    await seedDevUser({
      db,
      now: () => new Date().toISOString(),
      nextId: () => randomUUID(),
    });
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
};

await prepareDatabase();
