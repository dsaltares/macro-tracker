import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { createApiKey } from '../../db/api-keys.ts';
import { saveProfile } from '../../db/profiles.ts';
import { meRoute } from './me.ts';

const database = migratedDatabasePerTest();

const now = () => '2026-10-20T12:00:00.000Z';

const me = (key: string) =>
  meRoute({
    db: database(),
    now,
    nextId: () => 'unused',
    logger: pino({ enabled: false }),
  })(
    new Request('http://localhost/api/v1/me', {
      headers: { authorization: `Bearer ${key}` },
    }),
  );

const keyFor = async (userId: string) =>
  (
    await createApiKey(
      database(),
      userId,
      { name: 'Agent', scopes: ['read'] },
      { now, nextId: () => `key-${userId}` },
    )
  ).key;

beforeEach(async () => {
  await database()
    .insertInto('users')
    .values(
      ['user-1', 'user-2'].map((id) => ({
        id,
        name: `Name of ${id}`,
        email: `${id}@example.test`,
      })),
    )
    .execute();
});

describe('GET /api/v1/me', () => {
  it("is the key's account, profile and the key itself", async () => {
    await saveProfile(
      database(),
      'user-1',
      {
        sex: 'female',
        birthDate: '1990-04-02',
        heightCm: 168,
        activityLevel: 'moderate',
      },
      now(),
    );
    await keyFor('user-2');
    const key = await keyFor('user-1');

    const response = await me(key);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 'user-1',
      email: 'user-1@example.test',
      name: 'Name of user-1',
      profile: {
        sex: 'female',
        birthDate: '1990-04-02',
        heightCm: 168,
        activityLevel: 'moderate',
      },
      apiKey: { name: 'Agent', prefix: key.slice(0, 8), scopes: ['read'] },
    });
  });

  it('has no profile before onboarding', async () => {
    const response = await me(await keyFor('user-1'));

    expect(await response.json()).toMatchObject({ profile: null });
  });
});
