import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { createCaller } from '../root.ts';

const database = migratedDatabasePerTest();

let ids = 0;
let ticks = 0;

const now = () => new Date(Date.UTC(2026, 9, 20, 12, ticks++)).toISOString();

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
});

const as = (userId: string | null) =>
  createCaller({
    db: database(),
    caller: userId === null ? null : { userId },
    now,
    nextId: () => `id-${++ids}`,
  });

const weight = (date: string, value: number) =>
  ({ date, metric: 'weight_kg', value }) as const;

const logWeights = async (
  userId: string,
  weights: readonly (readonly [string, number])[],
) => {
  for (const [date, value] of weights) {
    await as(userId).body.log(weight(date, value));
  }
};

const storedRows = () =>
  database()
    .selectFrom('body_measurements')
    .selectAll()
    .orderBy('user_id')
    .orderBy('date')
    .execute();

describe('body.log', () => {
  it('records a weight for the day', async () => {
    expect(await as('user-1').body.log(weight('2026-10-20', 72.4))).toEqual({
      id: 'id-1',
      date: '2026-10-20',
      metric: 'weight_kg',
      value: 72.4,
    });

    expect(await storedRows()).toEqual([
      {
        id: 'id-1',
        user_id: 'user-1',
        date: '2026-10-20',
        metric: 'weight_kg',
        value: 72.4,
        created_at: '2026-10-20T12:00:00.000Z',
      },
    ]);
  });

  it('replaces the weight of a day already logged, keeping its id and when it was first logged', async () => {
    await as('user-1').body.log(weight('2026-10-20', 72.4));

    expect(await as('user-1').body.log(weight('2026-10-20', 71.9))).toEqual({
      id: 'id-1',
      date: '2026-10-20',
      metric: 'weight_kg',
      value: 71.9,
    });
    expect(await storedRows()).toEqual([
      expect.objectContaining({
        id: 'id-1',
        value: 71.9,
        created_at: '2026-10-20T12:00:00.000Z',
      }),
    ]);
  });

  it("keeps each user's day apart", async () => {
    await as('user-1').body.log(weight('2026-10-20', 72.4));
    await as('user-2').body.log(weight('2026-10-20', 90));

    expect(
      (await storedRows()).map(({ user_id, value }) => [user_id, value]),
    ).toEqual([
      ['user-1', 72.4],
      ['user-2', 90],
    ]);
  });

  it('ignores a smuggled userId', async () => {
    await as('user-1').body.log({
      ...weight('2026-10-20', 72.4),
      userId: 'user-2',
    } as never);

    expect((await storedRows()).map(({ user_id }) => user_id)).toEqual([
      'user-1',
    ]);
  });

  it.each([
    ['under 20 kg', weight('2026-10-20', 19.9)],
    ['over 400 kg', weight('2026-10-20', 400.1)],
    ['not a date', weight('2026-02-30', 72)],
    [
      'an unknown metric',
      { date: '2026-10-20', metric: 'waist_cm', value: 80 },
    ],
  ])('refuses %s', async (_, input) => {
    await expect(as('user-1').body.log(input as never)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(await storedRows()).toEqual([]);
  });

  it('needs an account', async () => {
    await expect(
      as(null).body.log(weight('2026-10-20', 72.4)),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('body.list', () => {
  beforeEach(async () => {
    await logWeights('user-1', [
      ['2026-10-18', 73],
      ['2026-10-20', 72.4],
      ['2026-10-19', 72.8],
      ['2026-10-21', 72.1],
    ]);
    await logWeights('user-2', [['2026-10-19', 90]]);
  });

  const datesOf = (measurements: { date: string }[]) =>
    measurements.map(({ date }) => date);

  it("lists the caller's whole log, newest first", async () => {
    expect(
      datesOf(await as('user-1').body.list({ metric: 'weight_kg' })),
    ).toEqual(['2026-10-21', '2026-10-20', '2026-10-19', '2026-10-18']);
  });

  it('lists the days between two dates, both included', async () => {
    expect(
      datesOf(
        await as('user-1').body.list({
          metric: 'weight_kg',
          from: '2026-10-19',
          to: '2026-10-20',
        }),
      ),
    ).toEqual(['2026-10-20', '2026-10-19']);
  });

  it('lists from a date on, or up to one', async () => {
    expect(
      datesOf(
        await as('user-1').body.list({
          metric: 'weight_kg',
          from: '2026-10-20',
        }),
      ),
    ).toEqual(['2026-10-21', '2026-10-20']);
    expect(
      datesOf(
        await as('user-1').body.list({ metric: 'weight_kg', to: '2026-10-18' }),
      ),
    ).toEqual(['2026-10-18']);
  });

  it("never lists another user's measurements", async () => {
    expect(await as('user-2').body.list({ metric: 'weight_kg' })).toEqual([
      { id: 'id-5', date: '2026-10-19', metric: 'weight_kg', value: 90 },
    ]);
  });

  it('refuses a range that ends before it starts', async () => {
    await expect(
      as('user-1').body.list({
        metric: 'weight_kg',
        from: '2026-10-20',
        to: '2026-10-19',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('needs an account', async () => {
    await expect(
      as(null).body.list({ metric: 'weight_kg' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('body.latest', () => {
  it('is null until the caller logs a weight', async () => {
    await logWeights('user-2', [['2026-10-19', 90]]);

    expect(await as('user-1').body.latest({ metric: 'weight_kg' })).toBeNull();
  });

  it("is the caller's most recent day, not the most recently logged", async () => {
    await logWeights('user-1', [
      ['2026-10-20', 72.4],
      ['2026-10-18', 73],
    ]);
    await logWeights('user-2', [['2026-10-21', 90]]);

    expect(await as('user-1').body.latest({ metric: 'weight_kg' })).toEqual({
      id: 'id-1',
      date: '2026-10-20',
      metric: 'weight_kg',
      value: 72.4,
    });
  });

  it('is the latest on or before a date', async () => {
    await logWeights('user-1', [
      ['2026-10-18', 73],
      ['2026-10-20', 72.4],
    ]);
    const latestOn = async (onOrBefore: string) =>
      (await as('user-1').body.latest({ metric: 'weight_kg', onOrBefore }))
        ?.date ?? null;

    expect(await latestOn('2026-10-20')).toBe('2026-10-20');
    expect(await latestOn('2026-10-19')).toBe('2026-10-18');
    expect(await latestOn('2026-10-17')).toBeNull();
  });

  it('needs an account', async () => {
    await expect(
      as(null).body.latest({ metric: 'weight_kg' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('body.remove', () => {
  it("removes the caller's measurement", async () => {
    const { id } = await as('user-1').body.log(weight('2026-10-20', 72.4));

    await as('user-1').body.remove(id);

    expect(await storedRows()).toEqual([]);
  });

  it("never removes another user's measurement", async () => {
    const { id } = await as('user-1').body.log(weight('2026-10-20', 72.4));

    await expect(as('user-2').body.remove(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await storedRows()).toHaveLength(1);
  });

  it('is NOT_FOUND for a measurement that does not exist', async () => {
    await expect(as('user-1').body.remove('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('needs an account', async () => {
    await expect(as(null).body.remove('id-1')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
