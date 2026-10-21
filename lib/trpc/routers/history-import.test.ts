import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { keyRefused } from '../../imports/fitness-tracker/clients.ts';
import { createCaller } from '../root.ts';
import { alreadyRunning } from './history-import.ts';

const database = migratedDatabasePerTest();

let ids = 0;

const as = (userId: string | null) =>
  createCaller({
    db: database(),
    caller: userId === null ? null : { userId },
    now: () => '2026-10-21T10:00:00.000Z',
    nextId: () => `id-${++ids}`,
  });

const emptyFitnessTracker = (status = 200) =>
  vi.fn<typeof fetch>(async () =>
    Response.json({ rowCount: 0, truncated: false, rows: [] }, { status }),
  );

const start = {
  source: 'fitness-tracker',
  apiKey: 'secret',
  timeZone: 'UTC',
} as const;

beforeEach(async () => {
  ids = 0;
  await database()
    .insertInto('users')
    .values(
      ['user-1', 'user-2'].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
      })),
    )
    .execute();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const settled = async (userId: string) =>
  vi.waitFor(async () => {
    const latest = await as(userId).historyImport.latest();
    expect(latest?.status).not.toBe('running');
    return latest;
  });

describe('historyImport.start', () => {
  it('starts an import that runs on after the request, with the key sent to fitness-tracker', async () => {
    const fetch = emptyFitnessTracker();
    vi.stubGlobal('fetch', fetch);

    const run = await as('user-1').historyImport.start(start);

    expect(run).toMatchObject({
      source: 'fitness-tracker',
      status: 'running',
      phase: 'reading',
    });
    expect(await settled('user-1')).toMatchObject({
      id: run.id,
      status: 'succeeded',
      summary: { days: 0, entries: 0, weights: 0 },
    });
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer secret',
    });
  });

  it('refuses a key fitness-tracker refuses, starting nothing', async () => {
    vi.stubGlobal('fetch', emptyFitnessTracker(401));

    await expect(as('user-1').historyImport.start(start)).rejects.toMatchObject(
      { code: 'BAD_REQUEST', message: keyRefused },
    );
    expect(await as('user-1').historyImport.latest()).toBeNull();
  });

  it('refuses a second import while one runs', async () => {
    vi.stubGlobal('fetch', emptyFitnessTracker());
    await database()
      .insertInto('history_imports')
      .values({
        id: 'run-1',
        user_id: 'user-1',
        source: 'fitness-tracker',
        status: 'running',
        phase: 'matching',
        started_at: '2026-10-21T09:00:00.000Z',
      })
      .execute();

    await expect(as('user-1').historyImport.start(start)).rejects.toMatchObject(
      { code: 'CONFLICT', message: alreadyRunning },
    );
  });

  it('refuses a missing key or an unknown time zone', async () => {
    await expect(
      as('user-1').historyImport.start({ ...start, apiKey: ' ' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      as('user-1').historyImport.start({ ...start, timeZone: 'Mars/Olympus' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses anyone not signed in', async () => {
    await expect(as(null).historyImport.start(start)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('historyImport.latest', () => {
  it("is the caller's latest import alone", async () => {
    await database()
      .insertInto('history_imports')
      .values([
        {
          id: 'old',
          user_id: 'user-1',
          source: 'fitness-tracker',
          status: 'failed',
          phase: 'reading',
          done: 0,
          total: 0,
          error: 'Gone',
          started_at: '2026-10-01T09:00:00.000Z',
        },
        {
          id: 'new',
          user_id: 'user-1',
          source: 'fitness-tracker',
          status: 'running',
          phase: 'logging',
          done: 3,
          total: 10,
          started_at: '2026-10-21T09:00:00.000Z',
        },
      ])
      .execute();

    expect(await as('user-1').historyImport.latest()).toMatchObject({
      id: 'new',
      phase: 'logging',
      done: 3,
      total: 10,
      summary: null,
    });
    expect(await as('user-2').historyImport.latest()).toBeNull();
  });
});
