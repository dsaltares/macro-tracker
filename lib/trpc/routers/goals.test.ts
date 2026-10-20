import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { defaultGoalSettings } from '../../domain/goals/settings.ts';
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

const derived = {
  mode: 'derived',
  weeklyRateKg: -0.5,
  proteinGPerKg: 1.8,
  fatEnergyShare: 0.3,
  overrides: {},
} as const;

const logWeight = (userId: string, date: string, value: number) =>
  as(userId).body.log({ date, metric: 'weight_kg', value });

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
  await as('user-2').profile.upsert({ ...profile, sex: 'male' });
});

describe('goals.get', () => {
  it('answers the default settings before any are saved', async () => {
    expect(await as('user-1').goals.get()).toEqual(defaultGoalSettings);
  });

  it('answers UNAUTHORIZED without a caller', async () => {
    await expect(as(null).goals.get()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('goals.set', () => {
  it('saves the settings, one row per user, replacing the last', async () => {
    await as('user-1').goals.set(derived);
    const settings = { ...derived, overrides: { iron: 18 } };

    expect(await as('user-1').goals.set(settings)).toEqual(settings);
    expect(await as('user-1').goals.get()).toEqual(settings);
    expect(await as('user-2').goals.get()).toEqual(defaultGoalSettings);
    expect(
      await database()
        .selectFrom('goals')
        .select(['user_id', 'overrides', 'created_at', 'updated_at'])
        .execute(),
    ).toEqual([
      {
        user_id: 'user-1',
        overrides: '{"iron":18}',
        created_at: '2026-10-20T12:02:00.000Z',
        updated_at: '2026-10-20T12:03:00.000Z',
      },
    ]);
  });

  it('refuses manual settings without an energy target', async () => {
    await expect(
      as('user-1').goals.set({ ...derived, mode: 'manual' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('goals.forDate', () => {
  it('has no derived goal before the first weight', async () => {
    await logWeight('user-1', '2026-10-21', 65);

    expect(await as('user-1').goals.forDate('2026-10-20')).toBeNull();
  });

  it('derives from the latest weight on or before the date', async () => {
    await as('user-1').goals.set(derived);
    await logWeight('user-1', '2026-10-18', 66);
    await logWeight('user-1', '2026-10-20', 65);

    expect(await as('user-1').goals.forDate('2026-10-19')).toMatchObject({
      mode: 'derived',
      weightKg: 66,
    });
    expect(await as('user-1').goals.forDate('2026-10-22')).toMatchObject({
      weightKg: 65,
      bmr: 1359,
      warnings: [],
    });
  });

  it("changes tomorrow's derived target when a new weight is logged, leaving earlier days alone", async () => {
    await as('user-1').goals.set(derived);
    await logWeight('user-1', '2026-10-20', 65);
    const today = await as('user-1').goals.forDate('2026-10-20');
    const tomorrow = await as('user-1').goals.forDate('2026-10-21');
    expect(tomorrow?.nutrients).toEqual(today?.nutrients);

    await logWeight('user-1', '2026-10-21', 60);

    expect(await as('user-1').goals.forDate('2026-10-20')).toEqual(today);
    const changed = await as('user-1').goals.forDate('2026-10-21');
    expect(changed?.weightKg).toBe(60);
    expect(changed?.nutrients.energy_kcal).toBeCloseTo(
      (today?.nutrients.energy_kcal ?? 0) - 10 * 5 * 1.55,
    );
    expect(changed?.nutrients.protein).toBeCloseTo(1.8 * 60);
  });

  it('lets an override win over the derived value for that nutrient only', async () => {
    await logWeight('user-1', '2026-10-20', 65);
    await as('user-1').goals.set(derived);
    const plain = await as('user-1').goals.forDate('2026-10-20');

    await as('user-1').goals.set({ ...derived, overrides: { protein: 140 } });

    expect(await as('user-1').goals.forDate('2026-10-20')).toEqual({
      ...plain,
      nutrients: { ...plain?.nutrients, protein: 140 },
    });
  });

  it('returns the manual targets over the derived micro defaults, with no weight needed', async () => {
    const overrides = { energy_kcal: 2000, protein: 150, iron: 18 };
    await as('user-1').goals.set({ ...derived, mode: 'manual', overrides });

    expect(await as('user-1').goals.forDate('2026-10-20')).toMatchObject({
      mode: 'manual',
      weightKg: null,
      bmr: null,
      tdee: null,
      nutrients: {
        ...overrides,
        fibre: 25,
        vitamin_c: 95,
        thiamin: expect.closeTo((0.1 * 2000 * 4.184) / 1000),
      },
    });
  });

  it("reads only the caller's profile, weights and settings", async () => {
    await as('user-2').goals.set({ ...derived, proteinGPerKg: 2 });
    await logWeight('user-2', '2026-10-20', 90);

    expect(await as('user-1').goals.forDate('2026-10-20')).toBeNull();
    await logWeight('user-1', '2026-10-20', 65);
    expect(await as('user-1').goals.forDate('2026-10-20')).toMatchObject({
      weightKg: 65,
      nutrients: { protein: 1.6 * 65 },
    });
  });

  it('has no goal without a profile', async () => {
    await database()
      .insertInto('users')
      .values({ id: 'user-3', name: 'user-3', email: 'user-3@example.test' })
      .execute();
    await logWeight('user-3', '2026-10-20', 65);

    expect(await as('user-3').goals.forDate('2026-10-20')).toBeNull();
  });

  it('refuses a date that is not one', async () => {
    await expect(
      as('user-1').goals.forDate('20 October'),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
