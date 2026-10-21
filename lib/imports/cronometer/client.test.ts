import { describe, expect, it } from 'vitest';
import {
  cronometerEmail,
  cronometerPassword,
  fakeCronometer,
} from '@/test/cronometer';
import {
  cronometerClient,
  cronometerDay,
  isCronometerFailure,
  loginRefused,
  unexpectedAnswer,
  unreachable,
} from './client.ts';

const egg = {
  id: 7,
  name: 'Egg, Raw',
  source: 'NCCDB:11710',
  defaultMeasureId: 70,
  measures: [{ id: 70, name: 'large', value: 50, type: 'Weight' }],
  nutrients: [{ id: 208, amount: 143 }],
};

const client = (
  cronometer: ReturnType<typeof fakeCronometer>,
  password = cronometerPassword,
) =>
  cronometerClient({
    email: cronometerEmail,
    password,
    fetch: cronometer.fetch,
  });

describe('cronometerDay', () => {
  it('is a date without leading zeros, as Cronometer takes it', () => {
    expect(cronometerDay('2026-09-01')).toBe('2026-9-1');
    expect(cronometerDay('2026-10-21')).toBe('2026-10-21');
  });
});

describe('cronometerClient', () => {
  it('logs in as the app does, never sending a time zone', async () => {
    const cronometer = fakeCronometer();

    await client(cronometer).login();

    expect(cronometer.requests[0]).toMatchObject({
      endpoint: 'login',
      body: {
        email: cronometerEmail,
        password: cronometerPassword,
        timezone: null,
        auth: { userId: null, token: null, api: 3, os: 'Android' },
      },
    });
  });

  it('refuses a wrong password with a message for the user', async () => {
    const error = await client(fakeCronometer(), 'wrong')
      .login()
      .catch((caught: unknown) => caught);

    expect(isCronometerFailure(error)).toBe(true);
    expect(error).toMatchObject({ message: loginRefused });
  });

  it('reads the servings of a day, leaving out notes and the like', async () => {
    const cronometer = fakeCronometer({
      diary: {
        '2026-09-01': [
          { foodId: 7, measureId: 70, grams: 100, time: '8:05:00' },
        ],
      },
    });

    const entries = await client(cronometer).diary('2026-09-01');

    expect(entries).toEqual([
      {
        type: 'Serving',
        time: '8:05:00',
        foodId: 7,
        measureId: 70,
        grams: 100,
        servingId: '2026-9-1-0',
        order: 1 << 16,
      },
    ]);
    expect(cronometer.requests.at(-1)).toMatchObject({
      endpoint: 'get_diary',
      body: { day: '2026-9-1', auth: { userId: 42, token: 'session-1' } },
    });
  });

  it('logs in again once when the session has expired', async () => {
    const cronometer = fakeCronometer();
    const send: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      const body = JSON.parse(await request.clone().text());
      if (body.auth?.token === 'session-1' && expiredOnce) {
        expiredOnce = false;
        return Response.json({ result: 'FAIL' });
      }
      return cronometer.answer(request);
    };
    let expiredOnce = true;
    const reader = cronometerClient({
      email: cronometerEmail,
      password: cronometerPassword,
      fetch: send,
    });
    await reader.login();

    expect(await reader.diary('2026-09-01')).toEqual([]);
    expect(
      cronometer.requests.filter(({ endpoint }) => endpoint === 'login'),
    ).toHaveLength(2);
  });

  it('reads foods in batches of 50', async () => {
    const foods = Array.from({ length: 60 }, (_, index) => ({
      ...egg,
      id: index + 1,
    }));
    const cronometer = fakeCronometer({ foods });

    const read = await client(cronometer).foods(foods.map(({ id }) => id));

    expect(read).toHaveLength(60);
    expect(read[0]).toEqual({ ...egg, id: 1 });
    expect(
      cronometer.requests
        .filter(({ endpoint }) => endpoint === 'get_foods')
        .map(({ body }) => (body.ids as number[]).length),
    ).toEqual([50, 10]);
  });

  it('reads the weights in kilograms over a range', async () => {
    const cronometer = fakeCronometer({
      weights: [{ day: '2026-9-1', value: 71.5 }],
    });

    expect(
      await client(cronometer).weights({
        from: '2026-08-01',
        to: '2026-10-21',
      }),
    ).toEqual([{ date: '2026-09-01', kilograms: 71.5 }]);
    expect(cronometer.requests.at(-1)).toMatchObject({
      endpoint: 'get_biometrics',
      body: { metricId: 1, unitId: 1, start: '2026-8-1', end: '2026-10-21' },
    });
  });

  it('says when Cronometer cannot be reached or answers an error', async () => {
    const offline = cronometerClient({
      email: cronometerEmail,
      password: cronometerPassword,
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(offline.login()).rejects.toThrow(unreachable);

    await expect(
      client(fakeCronometer({ failing: 'get_diary' })).diary('2026-09-01'),
    ).rejects.toThrow(unexpectedAnswer);
  });
});
