import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { birthDateOutOfRange, type Profile } from '../../domain/profile.ts';
import { createCaller } from '../root.ts';

const database = migratedDatabasePerTest();

let ticks = 0;

const now = () => new Date(Date.UTC(2026, 9, 20, 12, ticks++)).toISOString();

beforeEach(async () => {
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
    nextId: () => 'id-1',
  });

const profile: Profile = {
  sex: 'female',
  birthDate: '1990-06-15',
  heightCm: 168,
  activityLevel: 'moderate',
};

const storedRows = () =>
  database().selectFrom('profiles').selectAll().orderBy('user_id').execute();

describe('profile.get', () => {
  it('is null until the caller saves a profile', async () => {
    expect(await as('user-1').profile.get()).toBeNull();
  });

  it("never returns another user's profile", async () => {
    await as('user-1').profile.upsert(profile);

    expect(await as('user-1').profile.get()).toEqual(profile);
    expect(await as('user-2').profile.get()).toBeNull();
  });

  it('needs an account', async () => {
    await expect(as(null).profile.get()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('profile.upsert', () => {
  it('creates the profile, then replaces it, keeping when it was created', async () => {
    const taller: Profile = {
      ...profile,
      heightCm: 170.5,
      activityLevel: 'active',
    };

    await as('user-1').profile.upsert(profile);
    expect(await as('user-1').profile.upsert(taller)).toEqual(taller);

    expect(await as('user-1').profile.get()).toEqual(taller);
    expect(await storedRows()).toEqual([
      {
        user_id: 'user-1',
        sex: 'female',
        birth_date: '1990-06-15',
        height_cm: 170.5,
        activity_level: 'active',
        created_at: '2026-10-20T12:00:00.000Z',
        updated_at: '2026-10-20T12:01:00.000Z',
      },
    ]);
  });

  it("writes only the caller's profile", async () => {
    await as('user-1').profile.upsert(profile);

    await as('user-2').profile.upsert({ ...profile, sex: 'male' });

    expect(await as('user-1').profile.get()).toEqual(profile);
    expect(await as('user-2').profile.get()).toEqual({
      ...profile,
      sex: 'male',
    });
  });

  it('ignores a user id smuggled into the input', async () => {
    await as('user-2').profile.upsert({
      ...profile,
      userId: 'user-1',
    } as Profile);

    expect(await as('user-1').profile.get()).toBeNull();
    expect(await as('user-2').profile.get()).toEqual(profile);
  });

  it('refuses someone younger than the minimum age on the day it is saved', async () => {
    const saving = as('user-1').profile.upsert({
      ...profile,
      birthDate: '2010-10-21',
    });

    await expect(saving).rejects.toThrow(TRPCError);
    await expect(saving).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: birthDateOutOfRange,
    });
    expect(await storedRows()).toEqual([]);
  });

  it('refuses a height out of range', async () => {
    await expect(
      as('user-1').profile.upsert({ ...profile, heightCm: 20 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('needs an account', async () => {
    await expect(as(null).profile.upsert(profile)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
