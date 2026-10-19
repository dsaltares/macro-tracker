import { describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from './db.ts';

const database = migratedDatabasePerTest();

describe('migratedDatabasePerTest', () => {
  it('hands each test a migrated database', async () => {
    await database()
      .insertInto('meta')
      .values({ key: 'first', value: 'test' })
      .execute();

    expect(await database().selectFrom('meta').selectAll().execute()).toEqual([
      { key: 'first', value: 'test' },
    ]);
  });

  it('starts every test from an empty one', async () => {
    expect(await database().selectFrom('meta').selectAll().execute()).toEqual(
      [],
    );
  });
});
