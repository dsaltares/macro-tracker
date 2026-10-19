import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupDatabase, backupsKept } from './backup.ts';
import { createDatabase } from './client.ts';
import { migrateToLatest } from './migrator.ts';

let directory: string;
let databaseFile: string;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'macro-tracker-backup-'));
  databaseFile = join(directory, 'db.sqlite');
  const db = createDatabase(databaseFile);
  await migrateToLatest(db);
  await db.insertInto('meta').values({ key: 'kept', value: 'yes' }).execute();
  await db.destroy();
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const backups = () => join(directory, 'backups');

const minutesPast = (minutes: number) =>
  new Date(Date.UTC(2026, 9, 19, 12, minutes, 0));

describe('backupDatabase', () => {
  it('writes a timestamped copy into backups/ beside the database', async () => {
    const target = await backupDatabase(
      databaseFile,
      undefined,
      minutesPast(0),
    );

    expect(target).toBe(join(backups(), 'db-20261019T120000Z.sqlite'));
  });

  it('copies the data', async () => {
    const target = await backupDatabase(databaseFile);

    const copy = createDatabase(target);
    expect(await copy.selectFrom('meta').selectAll().execute()).toEqual([
      { key: 'kept', value: 'yes' },
    ]);
    await copy.destroy();
  });

  it('writes into the directory it is given', async () => {
    const elsewhere = join(directory, 'elsewhere');

    const target = await backupDatabase(databaseFile, elsewhere);

    expect(readdirSync(elsewhere)).toEqual([
      target.slice(elsewhere.length + 1),
    ]);
  });

  it(`keeps the newest ${backupsKept} and deletes the rest`, async () => {
    for (let minute = 0; minute < backupsKept + 2; minute++) {
      await backupDatabase(databaseFile, backups(), minutesPast(minute));
    }

    const kept = readdirSync(backups()).sort();
    expect(kept).toHaveLength(backupsKept);
    expect(kept[0]).toBe('db-20261019T120200Z.sqlite');
  });

  it('leaves files that are not its backups alone', async () => {
    await backupDatabase(databaseFile, backups(), minutesPast(0));
    writeFileSync(join(backups(), 'notes.txt'), 'mine');
    for (let minute = 1; minute <= backupsKept; minute++) {
      await backupDatabase(databaseFile, backups(), minutesPast(minute));
    }

    expect(readdirSync(backups())).toContain('notes.txt');
  });

  it('refuses a database that does not exist', async () => {
    await expect(
      backupDatabase(join(directory, 'missing.sqlite')),
    ).rejects.toThrow(/does not exist/);
  });
});
