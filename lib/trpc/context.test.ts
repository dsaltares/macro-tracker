import { describe, expect, it } from 'vitest';
import { createAuth } from '@/lib/auth/auth.ts';
import { migratedDatabasePerTest } from '@/test/db';
import { createContext } from './context.ts';

const database = migratedDatabasePerTest();

const contextFor = (headers = new Headers()) => {
  const db = database();
  return createContext({
    headers,
    db,
    auth: createAuth({
      db,
      secret: 'a-secret-only-these-tests-sign-with-0123456789',
      baseUrl: 'http://macros.example.test',
    }),
  });
};

describe('createContext', () => {
  it('uses the database it is given', async () => {
    expect((await contextFor()).db).toBe(database());
  });

  it('has no caller without a session', async () => {
    expect((await contextFor()).caller).toBeNull();
  });

  it('has no caller for a session cookie nobody signed', async () => {
    const headers = new Headers({
      cookie: 'better-auth.session_token=forged.signature',
    });

    expect((await contextFor(headers)).caller).toBeNull();
  });

  it('mints a fresh id and an ISO timestamp for each write', async () => {
    const context = await contextFor();

    expect(context.nextId()).not.toBe(context.nextId());
    expect(context.now()).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });
});
