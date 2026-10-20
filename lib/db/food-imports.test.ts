import { describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import {
  failInterruptedFoodImports,
  interrupted,
  lastSucceededFoodImport,
  startFoodImport,
} from './food-imports.ts';

const database = migratedDatabasePerTest();

const now = () => '2026-10-19T13:00:00.000Z';

const statuses = () =>
  database()
    .selectFrom('food_imports')
    .select(['id', 'status', 'error', 'finished_at'])
    .orderBy('id')
    .execute();

describe('food_imports', () => {
  it('refuses a second running import', async () => {
    await startFoodImport(database(), {
      id: 'first',
      sources: ['off'],
      startedAt: now(),
    });

    await expect(
      database()
        .insertInto('food_imports')
        .values({ id: 'second', sources: 'off', status: 'running' })
        .execute(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it('keeps any number of finished imports', async () => {
    await database()
      .insertInto('food_imports')
      .values([
        { id: 'a', sources: 'off', status: 'succeeded' },
        { id: 'b', sources: 'off', status: 'failed' },
        { id: 'c', sources: 'off', status: 'succeeded' },
      ])
      .execute();

    expect(await statuses()).toHaveLength(3);
  });
});

describe('startFoodImport', () => {
  it('starts an import when none is running', async () => {
    expect(
      await startFoodImport(database(), {
        id: 'first',
        sources: ['off', 'ciqual'],
        startedAt: now(),
      }),
    ).toEqual({
      started: true,
      run: {
        id: 'first',
        sources: 'off,ciqual',
        status: 'running',
        started_at: now(),
        finished_at: null,
        inserted: 0,
        updated: 0,
        archived: 0,
        error: null,
      },
    });
  });

  it('answers with the running import instead of starting another', async () => {
    await startFoodImport(database(), {
      id: 'first',
      sources: ['off'],
      startedAt: now(),
    });

    expect(
      await startFoodImport(database(), {
        id: 'second',
        sources: ['ciqual'],
        startedAt: now(),
      }),
    ).toEqual({
      started: false,
      running: expect.objectContaining({ id: 'first', sources: 'off' }),
    });
    expect(await statuses()).toEqual([
      expect.objectContaining({ id: 'first' }),
    ]);
  });
});

describe('failInterruptedFoodImports', () => {
  it('fails the running import as interrupted, and only that one', async () => {
    await database()
      .insertInto('food_imports')
      .values([
        { id: 'done', sources: 'off', status: 'succeeded' },
        { id: 'queued', sources: 'off', status: 'queued' },
        { id: 'running', sources: 'off', status: 'running' },
      ])
      .execute();

    expect(await failInterruptedFoodImports(database(), now)).toEqual([
      'running',
    ]);
    expect(await statuses()).toEqual([
      { id: 'done', status: 'succeeded', error: null, finished_at: null },
      { id: 'queued', status: 'queued', error: null, finished_at: null },
      {
        id: 'running',
        status: 'failed',
        error: interrupted,
        finished_at: now(),
      },
    ]);
  });

  it('does nothing when no import is running', async () => {
    expect(await failInterruptedFoodImports(database(), now)).toEqual([]);
  });
});

describe('lastSucceededFoodImport', () => {
  it('is the latest succeeded import that read the source', async () => {
    await database()
      .insertInto('food_imports')
      .values([
        {
          id: 'older',
          sources: 'off-deltas',
          status: 'succeeded',
          started_at: '2026-10-17T04:00:00.000Z',
        },
        {
          id: 'latest',
          sources: 'usda,off-deltas',
          status: 'succeeded',
          started_at: '2026-10-18T04:00:00.000Z',
        },
        {
          id: 'failed',
          sources: 'off-deltas',
          status: 'failed',
          started_at: '2026-10-19T04:00:00.000Z',
        },
        {
          id: 'other',
          sources: 'off',
          status: 'succeeded',
          started_at: '2026-10-19T05:00:00.000Z',
        },
      ])
      .execute();

    expect(
      await lastSucceededFoodImport(database(), 'off-deltas'),
    ).toMatchObject({ id: 'latest' });
  });

  it('does not take a source for another whose id contains it', async () => {
    await database()
      .insertInto('food_imports')
      .values({
        id: 'deltas',
        sources: 'off-deltas',
        status: 'succeeded',
        started_at: '2026-10-19T04:00:00.000Z',
      })
      .execute();

    expect(await lastSucceededFoodImport(database(), 'off')).toBeUndefined();
  });
});
