import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { restClient } from '@/test/rest';
import { trendsRoute } from './trends.ts';

const database = migratedDatabasePerTest();
const { keyFor, call, app } = restClient(database);

let reader: string;

beforeEach(async () => {
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
  reader = await keyFor('user-1', ['read']);
});

const quick = (date: string, energy_kcal: number) => ({
  date,
  meal: 'lunch' as const,
  label: 'Lunch out',
  nutrients: { totals: { energy_kcal, protein: 30 } },
});

describe('GET /api/v1/trends', () => {
  it('is each date of the range with its totals, average and goal', async () => {
    const user = app('user-1');
    await user.profile.upsert({
      sex: 'male',
      birthDate: '1988-03-01',
      heightCm: 180,
      activityLevel: 'light',
    });
    await user.goals.set({
      mode: 'manual',
      weeklyRateKg: 0,
      proteinGPerKg: 1.6,
      fatEnergyShare: 0.3,
      overrides: { energy_kcal: 2000 },
    });
    await user.diary.addQuick(quick('2026-10-18', 1900));
    await user.diary.addQuick(quick('2026-10-20', 2600));
    await app('user-2').diary.addQuick(quick('2026-10-19', 1500));
    const range = { from: '2026-10-18', to: '2026-10-20' };

    const response = await call(trendsRoute, { key: reader, query: range });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(await user.trends.range(range));
    expect(body).toMatchObject({
      ...range,
      adherence: 0.5,
      days: [
        { date: '2026-10-18', logged: true, totals: { energy_kcal: 1900 } },
        { date: '2026-10-19', logged: false, totals: {} },
        { date: '2026-10-20', logged: true, totals: { energy_kcal: 2600 } },
      ],
    });
    expect(body.days[0].goal).toMatchObject({ energy_kcal: 2000 });
  });

  it.each([
    ['a range that ends before it starts', '2026-10-20', '2026-10-19'],
    ['a range over a year', '2025-10-19', '2026-10-20'],
    ['a date that is not one', '2026-02-30', '2026-03-01'],
  ])('refuses %s', async (_, from, to) => {
    const response = await call(trendsRoute, {
      key: reader,
      query: { from, to },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST' },
    });
  });
});
