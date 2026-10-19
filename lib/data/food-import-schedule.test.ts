import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Cron } from 'croner';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { importFoodsInBackground } from './background-import.ts';
import {
  defaultFoodImportCron,
  foodImportCron,
  scheduleFoodImports,
} from './food-import-schedule.ts';
import { createFixtureSource } from './sources/fixture.ts';

const database = migratedDatabasePerTest();
const logger = pino({ enabled: false });

describe('foodImportCron', () => {
  it('runs on the first Sunday of the month at 03:00 by default', () => {
    expect(foodImportCron({ NODE_ENV: 'production' })).toBe(
      defaultFoodImportCron,
    );
  });

  it('takes the schedule from FOOD_IMPORT_CRON', () => {
    expect(
      foodImportCron({ NODE_ENV: 'production', FOOD_IMPORT_CRON: '0 4 * * *' }),
    ).toBe('0 4 * * *');
  });

  it.each(['', '  '])('is off when FOOD_IMPORT_CRON is %j', (value) => {
    expect(
      foodImportCron({ NODE_ENV: 'production', FOOD_IMPORT_CRON: value }),
    ).toBeUndefined();
  });

  it('is off under test', () => {
    expect(
      foodImportCron({ NODE_ENV: 'test', FOOD_IMPORT_CRON: '0 4 * * *' }),
    ).toBeUndefined();
  });
});

describe('scheduleFoodImports', () => {
  let schedule: Cron | undefined;
  let workDir = '';

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'macro-tracker-schedule-'));
    vi.useFakeTimers({
      now: new Date(2026, 9, 19, 12, 0),
      toFake: ['Date', 'setTimeout', 'clearTimeout'],
    });
  });

  afterEach(async () => {
    schedule?.stop();
    vi.useRealTimers();
    await rm(workDir, { recursive: true, force: true });
  });

  const scheduleTheFixture = () => {
    const startImport = vi.fn(() =>
      importFoodsInBackground({
        db: database(),
        sources: [createFixtureSource()],
        clock: {
          now: () => new Date().toISOString(),
          nextId: () => crypto.randomUUID(),
        },
        logger,
        signal: new AbortController().signal,
        workDir,
      }),
    );
    schedule = scheduleFoodImports({
      pattern: defaultFoodImportCron,
      startImport,
      logger,
    });
    return startImport;
  };

  it('imports foods on the first Sunday of the month at 03:00', async () => {
    const startImport = scheduleTheFixture();

    expect(schedule?.nextRun()).toEqual(new Date(2026, 10, 1, 3, 0));
    await vi.advanceTimersByTimeAsync(
      new Date(2026, 10, 1, 2, 59).getTime() - Date.now(),
    );
    expect(startImport).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(startImport).toHaveBeenCalledOnce();
    await expect
      .poll(() =>
        database()
          .selectFrom('food_imports')
          .select(['sources', 'status', 'started_at'])
          .execute(),
      )
      .toEqual([
        {
          sources: 'fixture',
          status: 'succeeded',
          started_at: new Date(2026, 10, 1, 3, 0).toISOString(),
        },
      ]);
    expect(schedule?.nextRun()).toEqual(new Date(2026, 11, 6, 3, 0));
  });

  it('keeps the schedule when an import fails to start', async () => {
    const startImport = vi.fn(() => Promise.reject(new Error('locked')));
    schedule = scheduleFoodImports({
      pattern: '0 3 * * *',
      startImport,
      logger,
    });

    await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);

    expect(startImport).toHaveBeenCalledTimes(2);
  });
});
