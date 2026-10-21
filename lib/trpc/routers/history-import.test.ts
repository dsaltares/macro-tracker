import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cronometerEmail,
  cronometerPassword,
  fakeCronometer,
} from '@/test/cronometer';
import { migratedDatabasePerTest } from '@/test/db';
import { loginRefused } from '../../imports/cronometer/client.ts';
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

const start = {
  source: 'cronometer',
  email: cronometerEmail,
  password: cronometerPassword,
  timeZone: 'UTC',
} as const;

const stubCronometer = () => {
  const cronometer = fakeCronometer();
  vi.stubGlobal('fetch', cronometer.fetch);
  return cronometer;
};

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
  it('starts an import that runs on after the request, signed in to Cronometer', async () => {
    const cronometer = stubCronometer();

    const run = await as('user-1').historyImport.start(start);

    expect(run).toMatchObject({
      source: 'cronometer',
      status: 'running',
      phase: 'reading',
    });
    expect(await settled('user-1')).toMatchObject({
      id: run.id,
      status: 'succeeded',
      summary: { days: 0, entries: 0, weights: 0 },
    });
    expect(cronometer.requests[0]).toMatchObject({
      endpoint: 'login',
      body: { email: cronometerEmail, password: cronometerPassword },
    });
  });

  it('refuses a password Cronometer refuses, starting nothing', async () => {
    stubCronometer();

    await expect(
      as('user-1').historyImport.start({ ...start, password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: loginRefused });
    expect(await as('user-1').historyImport.latest()).toBeNull();
  });

  it('refuses a second import while one runs', async () => {
    stubCronometer();
    await database()
      .insertInto('history_imports')
      .values({
        id: 'run-1',
        user_id: 'user-1',
        source: 'cronometer',
        status: 'running',
        phase: 'matching',
        started_at: '2026-10-21T09:00:00.000Z',
      })
      .execute();

    await expect(as('user-1').historyImport.start(start)).rejects.toMatchObject(
      { code: 'CONFLICT', message: alreadyRunning },
    );
  });

  it('refuses a missing email or password, or an unknown time zone', async () => {
    await expect(
      as('user-1').historyImport.start({ ...start, email: ' ' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      as('user-1').historyImport.start({ ...start, password: '' }),
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
          source: 'cronometer',
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
          source: 'cronometer',
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
