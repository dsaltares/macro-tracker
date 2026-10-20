import { describe, expect, it } from 'vitest';
import { migratedDatabasePerTest } from '@/test/db';
import type { Caller } from './context.ts';
import { accountProcedure, createCallerFactory, router } from './trpc.ts';

const database = migratedDatabasePerTest();

const probe = router({
  whoAmI: accountProcedure.query(({ ctx }) => ctx.caller.userId),
});

const as = (caller: Caller | null) =>
  createCallerFactory(probe)({
    db: database(),
    caller,
    now: () => '2026-10-19T10:00:00.000Z',
    nextId: () => 'id-1',
  });

describe('accountProcedure', () => {
  it('refuses a call without an account', async () => {
    await expect(as(null).whoAmI()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('hands the procedure the caller with an account', async () => {
    expect(await as({ userId: 'user-1' }).whoAmI()).toBe('user-1');
  });
});
