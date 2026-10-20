import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { restClient } from '@/test/rest';
import { defaultGoalSettings } from '../../domain/goals/settings.ts';
import { goalsRoute, setGoalsRoute } from './goals.ts';

const database = migratedDatabasePerTest();
const { keyFor, call, app } = restClient(database);

let reader: string;
let writer: string;

const derived = {
  mode: 'derived',
  weeklyRateKg: -0.5,
  proteinGPerKg: 1.8,
  fatEnergyShare: 0.3,
  overrides: { iron: 18 },
} as const;

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
  writer = await keyFor('user-1', ['write']);
});

const goalsOn = (date: string) =>
  call(goalsRoute, { key: reader, query: { date } });

describe('GET /api/v1/goals', () => {
  it('has the default settings and no goal before onboarding', async () => {
    const response = await goalsOn('2026-10-20');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: '2026-10-20',
      settings: defaultGoalSettings,
      goal: null,
    });
  });

  it('is the goal tRPC derives for the date, from the weight then', async () => {
    const user = app('user-1');
    await user.profile.upsert({
      sex: 'female',
      birthDate: '1990-06-15',
      heightCm: 168,
      activityLevel: 'moderate',
    });
    await user.goals.set(derived);
    await user.body.log({ date: '2026-10-01', metric: 'weight_kg', value: 70 });
    await user.body.log({ date: '2026-10-15', metric: 'weight_kg', value: 68 });

    for (const date of ['2026-09-30', '2026-10-10', '2026-10-20']) {
      const body = await (await goalsOn(date)).json();
      const goal = await user.goals.forDate(date);

      expect(body.settings).toEqual(derived);
      expect(body.goal).toEqual(goal);
    }
    expect((await (await goalsOn('2026-10-10')).json()).goal).toMatchObject({
      mode: 'derived',
      weightKg: 70,
      nutrients: { iron: 18, energy_kcal: expect.any(Number) },
    });
    expect((await (await goalsOn('2026-09-30')).json()).goal).toBeNull();
  });

  it("never reads another user's settings", async () => {
    await app('user-2').goals.set(derived);

    expect((await (await goalsOn('2026-10-20')).json()).settings).toEqual(
      defaultGoalSettings,
    );
  });

  it('needs a date', async () => {
    const response = await call(goalsRoute, { key: reader });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { issues: [{ path: ['date'] }] },
    });
  });
});

describe('PUT /api/v1/goals', () => {
  it('replaces the settings and answers them', async () => {
    const response = await call(setGoalsRoute, {
      key: writer,
      method: 'PUT',
      body: derived,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(derived);
    expect(await app('user-1').goals.get()).toEqual(derived);
    expect(await app('user-2').goals.get()).toEqual(defaultGoalSettings);
  });

  it('refuses a manual goal without an energy target', async () => {
    const response = await call(setGoalsRoute, {
      key: writer,
      method: 'PUT',
      body: { ...derived, mode: 'manual', overrides: {} },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { issues: [{ path: ['overrides', 'energy_kcal'] }] },
    });
  });

  it('needs the write scope', async () => {
    const response = await call(setGoalsRoute, {
      key: reader,
      method: 'PUT',
      body: derived,
    });

    expect(response.status).toBe(403);
  });
});
