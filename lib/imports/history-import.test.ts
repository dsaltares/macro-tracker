import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cronometerEmail,
  cronometerPassword,
  type FakeCronometer,
  fakeCronometer,
} from '@/test/cronometer';
import { migratedDatabasePerTest } from '@/test/db';
import {
  failInterruptedHistoryImports,
  latestHistoryImport,
} from '../db/history-imports.ts';
import { interruptedHistoryImport } from '../domain/imports/history-import.ts';
import type { EmailMessage, SendEmail } from '../email/transport.ts';
import type { ServiceContext } from '../services/context.ts';
import { loginRefused, unexpectedAnswer } from './cronometer/client.ts';
import { launchHistoryImport } from './history-import.ts';

const database = migratedDatabasePerTest();

const yogurt = {
  id: 3,
  name: 'Goat yogurt with honey and chia',
  source: 'Custom',
  measures: [{ id: 30, name: 'Serving', value: 137.1, type: 'Weight' }],
  nutrients: [
    { id: 208, amount: 102.7 },
    { id: 203, amount: 4.9 },
    { id: 205, amount: 9.3 },
    { id: 204, amount: 5.1 },
  ],
};

const history = {
  diary: { '2026-10-20': [{ foodId: 3, measureId: 30, grams: 137.1 }] },
  foods: [yogurt],
  weights: [{ day: '2026-10-20', value: 71.5 }],
};

let sent: EmailMessage[] = [];
const sendEmail: SendEmail = async (message) => {
  sent.push(message);
  return { delivered: true, id: 'email-1' };
};

let ids = 0;
const context = (): ServiceContext => ({
  db: database(),
  caller: { userId: 'user-1' },
  now: () => '2026-10-21T10:00:00.000Z',
  nextId: () => `id-${++ids}`,
});

const launch = (
  cronometer: FakeCronometer = history,
  password = cronometerPassword,
) =>
  launchHistoryImport(
    context(),
    {
      source: 'cronometer',
      email: cronometerEmail,
      password,
      timeZone: 'Europe/Madrid',
    },
    {
      fetch: fakeCronometer(cronometer).fetch,
      sendEmail,
      baseUrl: () => 'https://macros.example.test',
      logger: pino({ enabled: false }),
    },
  );

beforeEach(async () => {
  sent = [];
  ids = 0;
  await database()
    .insertInto('users')
    .values({ id: 'user-1', name: 'user-1', email: 'user-1@example.test' })
    .execute();
});

describe('launchHistoryImport', () => {
  it('imports in the background, records the summary and emails the result', async () => {
    const launched = await launch();
    if (!launched.started) {
      throw new Error('The import did not start');
    }
    expect(launched.run).toMatchObject({ status: 'running', phase: 'reading' });

    const finished = await launched.finished;

    expect(finished).toMatchObject({
      status: 'succeeded',
      error: null,
      finished_at: '2026-10-21T10:00:00.000Z',
      summary: {
        days: 1,
        entries: 1,
        weights: 1,
        foods: [{ name: 'Goat yogurt with honey and chia', kind: 'new' }],
      },
    });
    expect(await latestHistoryImport(database(), 'user-1')).toEqual(finished);
    expect(sent).toMatchObject([
      { to: 'user-1@example.test', subject: 'Your import finished' },
    ]);
    expect(sent[0]?.text).toContain(
      'https://macros.example.test/settings/import',
    );
  });

  it('refuses a password Cronometer refuses, before starting', async () => {
    await expect(launch(history, 'wrong')).rejects.toThrow(loginRefused);
    expect(await latestHistoryImport(database(), 'user-1')).toBeNull();
  });

  it('fails the run and emails why when Cronometer fails midway', async () => {
    const launched = await launch({ ...history, failing: 'get_foods' });
    if (!launched.started) {
      throw new Error('The import did not start');
    }

    expect(await launched.finished).toMatchObject({
      status: 'failed',
      error: unexpectedAnswer,
      summary: null,
    });
    expect(sent).toMatchObject([{ subject: 'Your import stopped' }]);
  });

  it('answers the running import instead of starting a second', async () => {
    const first = await launch();
    const second = await launch();

    expect(second).toMatchObject({
      started: false,
      running: { status: 'running' },
    });
    if (first.started) {
      await first.finished;
    }
  });
});

describe('failInterruptedHistoryImports', () => {
  it('fails the runs a restart cut short', async () => {
    await database()
      .insertInto('history_imports')
      .values({
        id: 'run-1',
        user_id: 'user-1',
        source: 'cronometer',
        status: 'running',
        phase: 'logging',
        started_at: '2026-10-21T09:00:00.000Z',
      })
      .execute();

    expect(
      await failInterruptedHistoryImports(
        database(),
        () => '2026-10-21T10:00:00.000Z',
      ),
    ).toEqual(['run-1']);
    expect(await latestHistoryImport(database(), 'user-1')).toMatchObject({
      status: 'failed',
      error: interruptedHistoryImport,
    });
  });
});
