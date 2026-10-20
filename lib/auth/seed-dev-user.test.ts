import { describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import { findProfile } from '../db/profiles.ts';
import { createAuth } from './auth.ts';
import { resolveCaller } from './caller.ts';
import { devProfile, devUser } from './dev-user.ts';
import { refusedInProduction, seedDevUser } from './seed-dev-user.ts';

const database = migratedDatabasePerTest();

const now = () => '2026-10-20T12:00:00.000Z';

const auth = () =>
  createAuth({
    db: database(),
    secret: 'a-secret-only-these-tests-sign-with-0123456789',
    baseUrl: 'http://macros.example.test',
    sendEmail: async () => ({ delivered: true, id: 'unsent' }),
    google: undefined,
  });

const seed = (environment = 'development') =>
  seedDevUser({ db: database(), now, nextId: () => 'dev-1', environment });

const signIn = async (withAuth: ReturnType<typeof auth>) => {
  const { headers } = await withAuth.api.signInEmail({
    body: { email: devUser.email, password: devUser.password },
    returnHeaders: true,
  });
  const cookie = headers.get('set-cookie')?.split(';')[0] ?? '';
  return resolveCaller(new Headers({ cookie }), withAuth);
};

const users = () =>
  database()
    .selectFrom('users')
    .select(['id', 'email', 'email_verified', 'terms_accepted_at'])
    .execute();

describe('seedDevUser', () => {
  it('creates a confirmed dev user who signs in with its password and has a profile', async () => {
    const withAuth = auth();

    expect(await seed()).toEqual({ created: true });

    const [user] = await users();
    expect(user).toMatchObject({
      email: devUser.email,
      email_verified: 1,
      terms_accepted_at: expect.any(String),
    });
    expect(await signIn(withAuth)).toEqual({ userId: user?.id });
    expect(await findProfile(database(), user?.id ?? '')).toEqual(devProfile);
  });

  it('does nothing the second time', async () => {
    await seed();
    const before = await users();

    expect(await seed()).toEqual({ created: false });
    expect(await users()).toEqual(before);
  });

  it('refuses under NODE_ENV=production', async () => {
    await expect(seed('production')).rejects.toThrow(refusedInProduction);
    expect(await users()).toEqual([]);
  });
});
