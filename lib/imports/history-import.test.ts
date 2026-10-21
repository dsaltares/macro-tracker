import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import {
  failInterruptedHistoryImports,
  latestHistoryImport,
} from '../db/history-imports.ts';
import { interruptedHistoryImport } from '../domain/imports/history-import.ts';
import type { EmailMessage, SendEmail } from '../email/transport.ts';
import type { ServiceContext } from '../services/context.ts';
import { keyRefused } from './fitness-tracker/clients.ts';
import { launchHistoryImport, unexpectedFailure } from './history-import.ts';

const database = migratedDatabasePerTest();

const yogurt = {
  food_id: 3,
  name: 'Goat yogurt with honey and chia',
  source: 'Custom',
  measures_json: JSON.stringify([
    { name: 'Serving', value: 137.1, type: 'Weight', hidden: false },
  ]),
  nutrients_json: JSON.stringify([
    { id: 208, amount: 102.7 },
    { id: 203, amount: 4.9 },
    { id: 205, amount: 9.3 },
    { id: 204, amount: 5.1 },
  ]),
};

const serving = {
  serving_id: '1',
  day: '2026-09-01',
  time: null,
  meal_group: 'breakfast',
  food_id: 3,
  measure_name: 'Serving',
  quantity_grams: 137.1,
  energy_kcal: 140.8,
  nutrients_json: JSON.stringify([
    { id: 208, amount: 140.8 },
    { id: 203, amount: 6.7 },
    { id: 205, amount: 12.75 },
    { id: 204, amount: 7 },
  ]),
};

const weighIn = { measured_at: '2026-09-01T06:00:00.000Z', weight: 71.5 };

type Answer = { status?: number; rows?: unknown[] };

const fitnessTracker = (answers: {
  check?: Answer;
  servings?: Answer;
}): typeof fetch => {
  const rowsFor = (sql: string): Answer => {
    if (sql.includes('nutrition_servings')) {
      return answers.servings ?? { rows: [serving] };
    }
    if (sql.includes('from foods')) {
      return { rows: [yogurt] };
    }
    if (sql.includes('body_composition')) {
      return { rows: [weighIn] };
    }
    return answers.check ?? { rows: [{ 1: 1 }] };
  };
  return async (_input, init) => {
    const { sql } = JSON.parse(String(init?.body));
    const { status = 200, rows = [] } = rowsFor(sql);
    return Response.json(
      { rowCount: rows.length, truncated: false, rows },
      {
        status,
      },
    );
  };
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

const launch = (send: typeof fetch) =>
  launchHistoryImport(
    context(),
    { source: 'fitness-tracker', apiKey: 'secret', timeZone: 'Europe/Madrid' },
    {
      fetch: send,
      sendEmail,
      baseUrl: () => 'https://macros.example.test',
      sourceUrl: () => 'https://fitness-tracker.example.test',
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
    const launched = await launch(fitnessTracker({}));
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

  it('refuses a key fitness-tracker refuses, before starting', async () => {
    await expect(
      launch(fitnessTracker({ check: { status: 401 } })),
    ).rejects.toThrow(keyRefused);
    expect(await latestHistoryImport(database(), 'user-1')).toBeNull();
  });

  it('fails the run and emails why when fitness-tracker fails midway', async () => {
    const launched = await launch(
      fitnessTracker({ servings: { status: 500 } }),
    );
    if (!launched.started) {
      throw new Error('The import did not start');
    }

    expect(await launched.finished).toMatchObject({
      status: 'failed',
      error: 'fitness-tracker answered 500. Try again later.',
      summary: null,
    });
    expect(sent).toMatchObject([{ subject: 'Your import stopped' }]);
  });

  it('hides an unexpected error behind a general message', async () => {
    const launched = await launch(
      fitnessTracker({ servings: { rows: [{ nonsense: true }] } }),
    );
    if (!launched.started) {
      throw new Error('The import did not start');
    }

    expect(await launched.finished).toMatchObject({
      status: 'failed',
      error: unexpectedFailure,
    });
  });

  it('answers the running import instead of starting a second', async () => {
    const first = await launch(fitnessTracker({}));
    const second = await launch(fitnessTracker({}));

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
        source: 'fitness-tracker',
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
