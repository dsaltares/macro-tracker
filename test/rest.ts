import type { Kysely } from 'kysely';
import pino from 'pino';
import type { ApiServer, RouteContext } from '@/lib/api/handler';
import { createApiKey } from '@/lib/db/api-keys';
import type { Database } from '@/lib/db/schema';
import type { ApiKeyScope } from '@/lib/domain/api-keys';
import { createCaller } from '@/lib/trpc/root';

export type RestRoute = (
  server: ApiServer,
) => (request: Request, context?: RouteContext) => Promise<Response>;

export type RestRequest = {
  key: string;
  method?: string;
  query?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
};

export const restClient = (db: () => Kysely<Database>) => {
  let ids = 0;
  let seconds = 0;
  const server = (): ApiServer => ({
    db: db(),
    now: () => new Date(Date.UTC(2026, 9, 20, 12, 0, seconds++)).toISOString(),
    nextId: () => `id-${++ids}`,
    logger: pino({ enabled: false }),
  });

  const keyFor = async (userId: string, scopes: ApiKeyScope[]) =>
    (
      await createApiKey(
        db(),
        userId,
        { name: 'Agent', scopes },
        { now: server().now, nextId: () => `key-${++ids}` },
      )
    ).key;

  const call = (
    route: RestRoute,
    { key, method = 'GET', query = {}, body, params = {} }: RestRequest,
  ) =>
    route(server())(
      new Request(
        `http://localhost/api/v1/test?${new URLSearchParams(query)}`,
        {
          method,
          headers: { authorization: `Bearer ${key}` },
          body: body === undefined ? null : JSON.stringify(body),
        },
      ),
      { params: Promise.resolve(params) },
    );

  const app = (userId: string) => {
    const { db, now, nextId } = server();
    return createCaller({ db, caller: { userId }, now, nextId });
  };

  return { server, keyFor, call, app };
};
