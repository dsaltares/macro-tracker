import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { addDays } from '../../domain/dates.ts';
import type { Profile } from '../../domain/profile.ts';
import { createCaller } from '../root.ts';

const database = migratedDatabasePerTest();

let ids = 0;
let ticks = 0;

const now = () => new Date(Date.UTC(2026, 9, 20, 12, ticks++)).toISOString();

const as = (userId: string | null) =>
  createCaller({
    db: database(),
    caller: userId === null ? null : { userId },
    now,
    nextId: () => `id-${++ids}`,
  });

const profile: Profile = {
  sex: 'female',
  birthDate: '1990-06-15',
  heightCm: 168,
  activityLevel: 'moderate',
};

const manual = {
  mode: 'manual',
  weeklyRateKg: 0,
  proteinGPerKg: 1.6,
  fatEnergyShare: 0.3,
  overrides: { energy_kcal: 2000, protein: 120 },
} as const;

const derived = { ...manual, mode: 'derived', overrides: {} } as const;

const from = '2026-09-21';
const to = '2026-10-20';
const fixtureDays = 30;

const isLogged = (day: number) => day % 5 !== 4;
const kcalOn = (day: number) => 1600 + 100 * (day % 7);

const logQuick = (
  userId: string,
  date: string,
  meal: 'breakfast' | 'dinner',
  totals: { energy_kcal: number; protein: number },
) =>
  as(userId).diary.addQuick({
    date,
    meal,
    label: meal,
    nutrients: { totals },
  });

const logFixture = async () => {
  for (let day = 0; day < fixtureDays; day++) {
    if (isLogged(day)) {
      const date = addDays(from, day);
      await logQuick('user-1', date, 'breakfast', {
        energy_kcal: 500,
        protein: 30,
      });
      await logQuick('user-1', date, 'dinner', {
        energy_kcal: kcalOn(day) - 500,
        protein: 70,
      });
    }
  }
  await logQuick('user-1', addDays(from, -1), 'dinner', {
    energy_kcal: 3000,
    protein: 100,
  });
  await logQuick('user-1', addDays(to, 1), 'dinner', {
    energy_kcal: 9000,
    protein: 100,
  });
  await logQuick('user-2', from, 'dinner', { energy_kcal: 9000, protein: 0 });
};

beforeEach(async () => {
  ids = 0;
  ticks = 0;
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
  await as('user-1').profile.upsert(profile);
  await as('user-2').profile.upsert(profile);
});

describe('trends.range', () => {
  beforeEach(async () => {
    await as('user-1').goals.set(manual);
    await logFixture();
  });

  it('answers every day of the range with its totals, flagging the days with no entries', async () => {
    const { days } = await as('user-1').trends.range({ from, to });

    expect(days).toHaveLength(fixtureDays);
    expect(days.map(({ date }) => date)).toEqual(
      Array.from({ length: fixtureDays }, (_, day) => addDays(from, day)),
    );
    expect(days.filter(({ logged }) => !logged)).toHaveLength(6);
    expect(days[0]).toMatchObject({
      date: from,
      logged: true,
      totals: { energy_kcal: 1600, protein: 100 },
    });
    expect(days[4]).toMatchObject({
      date: '2026-09-25',
      logged: false,
      totals: {},
    });
  });

  it("answers each day's goal vector", async () => {
    const { days } = await as('user-1').trends.range({ from, to });
    const goal = await as('user-1').goals.forDate(to);

    expect(days.every((day) => day.goal?.energy_kcal === 2000)).toBe(true);
    expect(days.at(-1)?.goal).toEqual(goal?.nutrients);
  });

  it('averages each day with the six before it, reaching back before the range', async () => {
    const { days } = await as('user-1').trends.range({ from, to });

    expect(days[0]?.rollingAverage).toEqual({
      energy_kcal: (3000 + 1600) / 2,
      protein: 100,
    });
    expect(days.at(-1)?.rollingAverage).toEqual({
      energy_kcal: 1940,
      protein: 100,
    });
  });

  it('answers the share of logged days within 10% of the kcal goal', async () => {
    expect(
      (await as('user-1').trends.range({ from, to })).adherence,
    ).toBeCloseTo(16 / 24, 10);
  });

  it('answers a goal per day from the latest weight on or before it', async () => {
    await as('user-1').goals.set(derived);
    await as('user-1').body.log({
      date: '2026-09-01',
      metric: 'weight_kg',
      value: 70,
    });
    await as('user-1').body.log({
      date: '2026-10-10',
      metric: 'weight_kg',
      value: 68,
    });
    await as('user-1').body.log({
      date: '2026-10-21',
      metric: 'weight_kg',
      value: 60,
    });

    const { days } = await as('user-1').trends.range({ from, to });

    for (const date of [from, '2026-10-09', '2026-10-10', to]) {
      expect(days.find((day) => day.date === date)?.goal).toEqual(
        (await as('user-1').goals.forDate(date))?.nutrients,
      );
    }
    expect(days[0]?.goal).not.toEqual(days.at(-1)?.goal);
  });

  it('has no goal and no adherence before the first weight of a derived goal', async () => {
    await as('user-1').goals.set(derived);

    const { days, adherence } = await as('user-1').trends.range({ from, to });

    expect(days.every(({ goal }) => goal === null)).toBe(true);
    expect(adherence).toBeNull();
  });

  it('answers only the caller’s diary', async () => {
    const { days, adherence } = await as('user-2').trends.range({ from, to });

    expect(days[0]?.totals).toEqual({ energy_kcal: 9000, protein: 0 });
    expect(days.slice(1).every(({ logged }) => !logged)).toBe(true);
    expect(adherence).toBeNull();
  });
});

describe('an account without a profile', () => {
  it('has its totals and no goal', async () => {
    await database()
      .insertInto('users')
      .values({ id: 'user-3', name: 'user-3', email: 'user-3@example.test' })
      .execute();
    await logQuick('user-3', to, 'dinner', { energy_kcal: 1800, protein: 90 });

    const { days, adherence } = await as('user-3').trends.range({ from, to });

    expect(days.at(-1)).toMatchObject({
      logged: true,
      totals: { energy_kcal: 1800, protein: 90 },
      goal: null,
    });
    expect(adherence).toBeNull();
  });
});

describe('trends.nutrients', () => {
  beforeEach(async () => {
    await as('user-1').goals.set(manual);
    await logFixture();
  });

  it('averages each nutrient over the logged days, against the goal', async () => {
    const result = await as('user-1').trends.nutrients({ from, to });

    expect(result).toMatchObject({
      from,
      to,
      days: fixtureDays,
      loggedDays: 24,
      average: { energy_kcal: expect.closeTo(1891.67, 2), protein: 100 },
      goal: { energy_kcal: 2000, protein: 120 },
    });
  });

  it('has no average and no goal for a range with no entries', async () => {
    expect(
      await as('user-1').trends.nutrients({
        from: '2026-01-01',
        to: '2026-01-31',
      }),
    ).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      days: 31,
      loggedDays: 0,
      average: null,
      goal: null,
    });
  });
});

describe('the range', () => {
  it('refuses a range that ends before it starts', async () => {
    await expect(
      as('user-1').trends.range({ from: to, to: from }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('refuses a range over 366 days and takes one of 366', async () => {
    await expect(
      as('user-1').trends.nutrients({ from: '2025-01-01', to: '2026-01-02' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      (
        await as('user-1').trends.nutrients({
          from: '2025-01-01',
          to: '2026-01-01',
        })
      ).days,
    ).toBe(366);
  });

  it('refuses a date that is not one', async () => {
    await expect(
      as('user-1').trends.range({ from: '2026-02-30', to }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('answers UNAUTHORIZED without a caller', async () => {
    await expect(as(null).trends.range({ from, to })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(as(null).trends.nutrients({ from, to })).rejects.toMatchObject(
      { code: 'UNAUTHORIZED' },
    );
  });
});
