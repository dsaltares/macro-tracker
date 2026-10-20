import { createHash } from 'node:crypto';
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

const storedRows = () =>
  database().selectFrom('api_keys').selectAll().orderBy('id').execute();

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('apiKeys.create', () => {
  it('returns the new key in plain text, with what it is stored as', async () => {
    const created = await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read', 'write'],
    });

    expect(created).toEqual({
      id: 'id-1',
      name: 'Shortcuts',
      prefix: created.key.slice(0, 8),
      scopes: ['read', 'write'],
      lastUsedAt: null,
      createdAt: '2026-10-20T12:00:00.000Z',
      key: expect.stringMatching(/^mt_[0-9A-Za-z]{43}$/),
    });
  });

  it('stores a hash of the key and its prefix, never the key', async () => {
    const { key } = await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read'],
    });

    const rows = await storedRows();
    expect(rows).toEqual([
      {
        id: 'id-1',
        user_id: 'user-1',
        name: 'Shortcuts',
        prefix: key.slice(0, 8),
        key_hash: sha256(key),
        scopes: '["read"]',
        last_used_at: null,
        created_at: '2026-10-20T12:00:00.000Z',
        revoked_at: null,
      },
    ]);
    const secret = key.slice(8);
    for (const value of Object.values(rows[0] ?? {})) {
      expect(String(value)).not.toContain(secret);
    }
  });

  it('makes a different key every time, even with the same name', async () => {
    const first = await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read'],
    });
    const second = await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read'],
    });

    expect(second.key).not.toBe(first.key);
    expect(await storedRows()).toHaveLength(2);
  });

  it('trims the name and keeps each scope once, read first', async () => {
    const created = await as('user-1').apiKeys.create({
      name: '  Shortcuts ',
      scopes: ['write', 'read', 'write'],
    });

    expect(created).toMatchObject({
      name: 'Shortcuts',
      scopes: ['read', 'write'],
    });
  });

  it('ignores a smuggled userId', async () => {
    await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read'],
      userId: 'user-2',
    } as never);

    expect((await storedRows()).map(({ user_id }) => user_id)).toEqual([
      'user-1',
    ]);
  });

  it.each([
    ['an empty name', { name: '  ', scopes: ['read'] }],
    ['a name too long', { name: 'x'.repeat(61), scopes: ['read'] }],
    ['no scopes', { name: 'Shortcuts', scopes: [] }],
    ['an unknown scope', { name: 'Shortcuts', scopes: ['admin'] }],
  ])('refuses %s', async (_, input) => {
    await expect(
      as('user-1').apiKeys.create(input as never),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await storedRows()).toEqual([]);
  });

  it('needs an account', async () => {
    await expect(
      as(null).apiKeys.create({ name: 'Shortcuts', scopes: ['read'] }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('apiKeys.list', () => {
  it("lists the caller's keys, newest first, without the key or its hash", async () => {
    const older = await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read'],
    });
    const newer = await as('user-1').apiKeys.create({
      name: 'Agent',
      scopes: ['read', 'write'],
    });
    await as('user-2').apiKeys.create({ name: 'Theirs', scopes: ['read'] });

    expect(await as('user-1').apiKeys.list()).toEqual([
      {
        id: newer.id,
        name: 'Agent',
        prefix: newer.prefix,
        scopes: ['read', 'write'],
        lastUsedAt: null,
        createdAt: '2026-10-20T12:01:00.000Z',
      },
      {
        id: older.id,
        name: 'Shortcuts',
        prefix: older.prefix,
        scopes: ['read'],
        lastUsedAt: null,
        createdAt: '2026-10-20T12:00:00.000Z',
      },
    ]);
  });

  it('shows when each key was last used', async () => {
    const { id } = await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read'],
    });
    await database()
      .updateTable('api_keys')
      .set({ last_used_at: '2026-10-21T08:30:00.000Z' })
      .where('id', '=', id)
      .execute();

    expect(await as('user-1').apiKeys.list()).toEqual([
      expect.objectContaining({ lastUsedAt: '2026-10-21T08:30:00.000Z' }),
    ]);
  });

  it('needs an account', async () => {
    await expect(as(null).apiKeys.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('apiKeys.revoke', () => {
  it('no longer lists a revoked key as active, and keeps its row', async () => {
    const revoked = await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read'],
    });
    const kept = await as('user-1').apiKeys.create({
      name: 'Agent',
      scopes: ['write'],
    });

    await as('user-1').apiKeys.revoke(revoked.id);

    expect((await as('user-1').apiKeys.list()).map(({ name }) => name)).toEqual(
      [kept.name],
    );
    expect(
      (await storedRows()).map(({ id, revoked_at }) => [id, revoked_at]),
    ).toEqual([
      [revoked.id, '2026-10-20T12:02:00.000Z'],
      [kept.id, null],
    ]);
  });

  it("never revokes another user's key", async () => {
    const { id } = await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read'],
    });

    await expect(as('user-2').apiKeys.revoke(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await as('user-1').apiKeys.list()).toHaveLength(1);
  });

  it('is NOT_FOUND for a key already revoked, keeping when it was', async () => {
    const { id } = await as('user-1').apiKeys.create({
      name: 'Shortcuts',
      scopes: ['read'],
    });
    await as('user-1').apiKeys.revoke(id);

    await expect(as('user-1').apiKeys.revoke(id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await storedRows())[0]?.revoked_at).toBe(
      '2026-10-20T12:01:00.000Z',
    );
  });

  it('is NOT_FOUND for a key that does not exist', async () => {
    await expect(as('user-1').apiKeys.revoke('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('needs an account', async () => {
    await expect(as(null).apiKeys.revoke('id-1')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
