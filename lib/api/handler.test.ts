import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { migratedDatabasePerTest } from '@/test/db';
import { createApiKey, revokeApiKey } from '../db/api-keys.ts';
import type { ApiKeyScope } from '../domain/api-keys.ts';
import { apiError } from './errors.ts';
import { type ApiServer, apiHandler, type RouteParams } from './handler.ts';

const database = migratedDatabasePerTest();

let clock = 0;
let ids = 0;

const server = (): ApiServer => ({
  db: database(),
  now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, clock)).toISOString(),
  nextId: () => `id-${++ids}`,
  logger: pino({ enabled: false }),
});

beforeEach(async () => {
  clock = 0;
  ids = 0;
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

const keyWith = async (scopes: ApiKeyScope[], userId = 'user-1') =>
  (
    await createApiKey(
      database(),
      userId,
      { name: 'Shortcuts', scopes },
      { now: server().now, nextId: () => `key-${++ids}` },
    )
  ).key;

const url = 'http://localhost/api/v1/things';

const request = (
  key: string | null,
  {
    method = 'GET',
    query = '',
    body,
  }: { method?: string; query?: string; body?: string | undefined } = {},
) =>
  new Request(`${url}${query}`, {
    method,
    headers: key === null ? {} : { authorization: `Bearer ${key}` },
    body: body ?? null,
  });

const withParams = (params: RouteParams) => ({
  params: Promise.resolve(params),
});

const described = {
  method: 'GET',
  path: '/things',
  operationId: 'things',
  summary: 'Things',
  description: 'A route of the tests.',
  example: {},
} as const;

const whoAmI = apiHandler({
  ...described,
  scope: 'read',
  handle: ({ context, apiKey }) => ({
    userId: context.caller.userId,
    key: apiKey.name,
  }),
});

const lastUsedAt = async () =>
  (
    await database()
      .selectFrom('api_keys')
      .select('last_used_at')
      .executeTakeFirstOrThrow()
  ).last_used_at;

describe('apiHandler', () => {
  describe('authentication', () => {
    it('calls the route as the user who owns the key', async () => {
      await keyWith(['read'], 'user-2');
      const key = await keyWith(['read']);

      const response = await whoAmI(server())(request(key));

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        userId: 'user-1',
        key: 'Shortcuts',
      });
    });

    it('answers 401 MISSING_API_KEY to a request without a key', async () => {
      const response = await whoAmI(server())(request(null));

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
      expect(await response.json()).toEqual({
        error: {
          code: 'MISSING_API_KEY',
          message: 'Send an API key as Authorization: Bearer <key>.',
        },
      });
    });

    it.each([
      ['a key nobody holds', () => `mt_${'A'.repeat(43)}`],
      ['a value that is not a key', () => 'not-a-key'],
      ['an empty bearer', () => ''],
    ])('answers 401 INVALID_API_KEY to %s', async (_, key) => {
      await keyWith(['read']);

      const response = await whoAmI(server())(request(key()));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: {
          code: 'INVALID_API_KEY',
          message: 'The API key is not valid.',
        },
      });
    });

    it.each([
      ['another scheme', (key: string) => `Basic ${key}`],
      ['the key alone', (key: string) => key],
      ['the key with extra characters', (key: string) => `Bearer ${key}x`],
    ])('answers 401 INVALID_API_KEY to %s', async (_, authorization) => {
      const key = await keyWith(['read']);

      const response = await whoAmI(server())(
        new Request(url, { headers: { authorization: authorization(key) } }),
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: { code: 'INVALID_API_KEY' },
      });
    });

    it('accepts the scheme in any case', async () => {
      const key = await keyWith(['read']);

      const response = await whoAmI(server())(
        new Request(url, { headers: { authorization: `bearer ${key}` } }),
      );

      expect(response.status).toBe(200);
    });

    it('answers 401 REVOKED_API_KEY to a revoked key', async () => {
      const key = await keyWith(['read']);
      await revokeApiKey(database(), 'user-1', 'key-1', server().now());

      const response = await whoAmI(server())(request(key));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: {
          code: 'REVOKED_API_KEY',
          message: 'The API key has been revoked.',
        },
      });
      expect(await lastUsedAt()).toBeNull();
    });

    it('stops working once the account is deleted', async () => {
      const key = await keyWith(['read']);
      await database().deleteFrom('users').where('id', '=', 'user-1').execute();

      const response = await whoAmI(server())(request(key));

      expect(response.status).toBe(401);
    });
  });

  describe('scopes', () => {
    const write = apiHandler({
      ...described,
      method: 'POST',
      scope: 'write',
      handle: () => ({ ok: true }),
    });

    it('answers 403 INSUFFICIENT_SCOPE to a key without the route scope', async () => {
      const key = await keyWith(['read']);

      const response = await write(server())(request(key, { method: 'POST' }));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: {
          code: 'INSUFFICIENT_SCOPE',
          message: 'This API key does not have the write scope.',
        },
      });
    });

    it('does not take write to include read', async () => {
      const key = await keyWith(['write']);

      const response = await whoAmI(server())(request(key));

      expect(response.status).toBe(403);
    });

    it('serves a key with the route scope among others', async () => {
      const key = await keyWith(['read', 'write']);

      expect(
        (await write(server())(request(key, { method: 'POST' }))).status,
      ).toBe(200);
      expect((await whoAmI(server())(request(key))).status).toBe(200);
    });
  });

  describe('last use', () => {
    it('records when a live key is used', async () => {
      const key = await keyWith(['read']);
      clock = 30;

      await whoAmI(server())(request(key));

      expect(await lastUsedAt()).toBe('2026-10-20T12:00:30.000Z');
    });

    it('records it at most once a minute', async () => {
      const key = await keyWith(['read']);
      const handler = whoAmI(server());
      await handler(request(key));

      clock = 59;
      await handler(request(key));
      expect(await lastUsedAt()).toBe('2026-10-20T12:00:00.000Z');

      clock = 61;
      await handler(request(key));
      expect(await lastUsedAt()).toBe('2026-10-20T12:01:01.000Z');
    });

    it('records the use of a key refused for its scope', async () => {
      const key = await keyWith(['write']);

      await whoAmI(server())(request(key));

      expect(await lastUsedAt()).toBe('2026-10-20T12:00:00.000Z');
    });
  });

  describe('input', () => {
    const search = apiHandler({
      ...described,
      scope: 'read',
      input: z.object({
        q: z.string().min(1),
        page: z.coerce.number().int().optional(),
        tag: z.array(z.string()).optional(),
      }),
      handle: ({ input }) => input,
    });

    const create = apiHandler({
      ...described,
      method: 'POST',
      scope: 'write',
      input: z.object({
        name: z.string().min(1),
        grams: z.number().positive(),
      }),
      status: 201,
      handle: ({ input }) => input,
    });

    it('validates the query of a GET', async () => {
      const key = await keyWith(['read']);

      const response = await search(server())(
        request(key, { query: '?q=oats&page=2&tag=a&tag=b' }),
      );

      expect(await response.json()).toEqual({
        q: 'oats',
        page: 2,
        tag: ['a', 'b'],
      });
    });

    it('answers 400 INVALID_REQUEST with the issues of a bad query', async () => {
      const key = await keyWith(['read']);

      const response = await search(server())(
        request(key, { query: '?page=x' }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: 'INVALID_REQUEST',
          message: 'The request is not valid.',
          issues: [
            { path: ['q'], message: expect.any(String) },
            { path: ['page'], message: expect.any(String) },
          ],
        },
      });
    });

    it('validates the JSON body of a POST and answers its status', async () => {
      const key = await keyWith(['write']);

      const response = await create(server())(
        request(key, {
          method: 'POST',
          body: JSON.stringify({ name: 'Oats', grams: 40 }),
        }),
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ name: 'Oats', grams: 40 });
    });

    it.each([
      ['a body that is not JSON', '{', 'The body is not JSON.'],
      ['no body', undefined, 'The request is not valid.'],
      [
        'a body the schema refuses',
        JSON.stringify({ name: '' }),
        'The request is not valid.',
      ],
    ])('answers 400 INVALID_REQUEST to %s', async (_, body, message) => {
      const key = await keyWith(['write']);

      const response = await create(server())(
        request(key, { method: 'POST', body }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'INVALID_REQUEST', message },
      });
    });

    it('authenticates before it reads the body', async () => {
      const response = await create(server())(
        request(null, { method: 'POST', body: '{' }),
      );

      expect(response.status).toBe(401);
    });
  });

  describe('path parameters', () => {
    const one = apiHandler({
      ...described,
      scope: 'read',
      params: z.object({ id: z.string().regex(/^\d+$/) }),
      handle: ({ params }) => params,
    });

    it('validates them', async () => {
      const key = await keyWith(['read']);

      const response = await one(server())(
        request(key),
        withParams({ id: '42' }),
      );

      expect(await response.json()).toEqual({ id: '42' });
    });

    it('answers 400 INVALID_REQUEST to a bad one', async () => {
      const key = await keyWith(['read']);

      const response = await one(server())(
        request(key),
        withParams({ id: 'x' }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: {
          code: 'INVALID_REQUEST',
          message: 'The path is not valid.',
          issues: [{ path: ['id'] }],
        },
      });
    });
  });

  describe('results and failures', () => {
    it('answers 204 with no body to a route that returns nothing', async () => {
      const key = await keyWith(['write']);
      const remove = apiHandler({
        ...described,
        method: 'DELETE',
        scope: 'write',
        handle: () => undefined,
      });

      const response = await remove(server())(
        request(key, { method: 'DELETE' }),
      );

      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
    });

    it('answers the envelope of an error the route throws', async () => {
      const key = await keyWith(['read']);
      const missing = apiHandler({
        ...described,
        scope: 'read',
        handle: () => {
          throw apiError('NOT_FOUND', 'No such food.');
        },
      });

      const response = await missing(server())(request(key));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'No such food.' },
      });
    });

    it('answers 500 INTERNAL_ERROR to anything else, without its details', async () => {
      const key = await keyWith(['read']);
      const broken = apiHandler({
        ...described,
        scope: 'read',
        handle: () => {
          throw new Error('secret detail');
        },
      });

      const response = await broken(server())(request(key));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong on our side.',
        },
      });
    });
  });
});
