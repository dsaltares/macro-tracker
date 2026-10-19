import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import SQLite from 'better-sqlite3';

export const backupsKept = 10;

const backupPattern = /^db-\d{8}T\d{6}Z\.sqlite$/;

const timestamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');

export const backupDirectory = (databaseFile: string) =>
  join(dirname(databaseFile), 'backups');

const pruneBackups = (directory: string) => {
  const stale = readdirSync(directory)
    .filter((name) => backupPattern.test(name))
    .sort()
    .reverse()
    .slice(backupsKept);
  for (const name of stale) {
    rmSync(join(directory, name));
  }
};

export const backupDatabase = async (
  databaseFile: string,
  directory: string = backupDirectory(databaseFile),
  now: Date = new Date(),
) => {
  if (!existsSync(databaseFile)) {
    throw new Error(
      `${databaseFile} does not exist, so there is nothing to back up.`,
    );
  }
  mkdirSync(directory, { recursive: true });
  const target = join(directory, `db-${timestamp(now)}.sqlite`);
  const database = new SQLite(databaseFile, { fileMustExist: true });
  try {
    await database.backup(target);
  } finally {
    database.close();
  }
  pruneBackups(directory);
  return target;
};
