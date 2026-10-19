import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@/lib/db/client.ts';
import { migrateToLatest } from '@/lib/db/migrator.ts';
import { inMemory } from '@/lib/db/url.ts';
import { createCaller } from '../root.ts';

let db: ReturnType<typeof createDatabase>;

beforeEach(async () => {
  db = createDatabase(inMemory);
  await migrateToLatest(db);
});

afterEach(async () => {
  await db.destroy();
});

const checkedAt = '2026-10-19T10:00:00.000Z';

const caller = () =>
  createCaller({
    db,
    caller: null,
    now: () => checkedAt,
    nextId: () => 'id-1',
  });

describe('health.check', () => {
  it('answers ok with the time it checked', async () => {
    expect(await caller().health.check()).toEqual({
      status: 'ok',
      checkedAt,
    });
  });

  it('fails when the database cannot be reached', async () => {
    await db.destroy();

    await expect(caller().health.check()).rejects.toThrow();
  });
});
