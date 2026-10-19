import { rm } from 'node:fs/promises';
import { createDatabase } from '../lib/db/client.ts';
import { migrateToLatest } from '../lib/db/migrator.ts';
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
  } finally {
    await db.destroy();
  }
}
