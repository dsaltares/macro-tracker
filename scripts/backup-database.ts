import { backupDatabase } from '../lib/db/backup.ts';
import { databaseUrl } from '../lib/db/url.ts';

try {
  const source = databaseUrl();
  const target = await backupDatabase(
    source,
    process.env.BACKUP_DIR || undefined,
  );
  console.log(`Backed up ${source} to ${target}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
