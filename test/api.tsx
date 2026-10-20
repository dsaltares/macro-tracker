import { QueryClient } from '@tanstack/react-query';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { Kysely } from 'kysely';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { type ReactNode, useState } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { createDatabase } from '@/lib/db/client';
import { migrateToLatest } from '@/lib/db/migrator';
import type { Database } from '@/lib/db/schema';
import { inMemory } from '@/lib/db/url';
import { TRPCClientProvider } from '@/lib/trpc/client';
import type { Context } from '@/lib/trpc/context';
import { trpcEndpoint } from '@/lib/trpc/endpoint';
import { appRouter } from '@/lib/trpc/root';

const origin = 'http://localhost:3014';

const firstTick = Date.UTC(2026, 9, 19, 10, 0);

const tickMs = 60_000;

const testQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const ApiProviders = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(testQueryClient);
  return (
    <TRPCClientProvider
      queryClient={queryClient}
      url={`${origin}${trpcEndpoint}`}
    >
      {children}
    </TRPCClientProvider>
  );
};

export type ServeApiOptions = {
  signedInAs?: string;
};

export const serveApi = ({ signedInAs }: ServeApiOptions = {}) => {
  let db: Kysely<Database>;
  let minted = 0;
  let ticks = 0;

  const context = (): Context => ({
    db,
    caller: signedInAs === undefined ? null : { userId: signedInAs },
    now: () => new Date(firstTick + ++ticks * tickMs).toISOString(),
    nextId: () => `id-${++minted}`,
  });

  const apiHandler = http.all(`${origin}${trpcEndpoint}/*`, ({ request }) =>
    fetchRequestHandler({
      endpoint: trpcEndpoint,
      req: request,
      router: appRouter,
      createContext: context,
    }),
  );

  const failingProcedure = (procedure: string) =>
    http.all(`${origin}${trpcEndpoint}/:procedures`, ({ params }) =>
      String(params.procedures).split(',').includes(procedure)
        ? HttpResponse.json(
            { error: { message: 'Internal server error', code: -32603 } },
            { status: 500 },
          )
        : undefined,
    );

  const server = setupServer(apiHandler);

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(async () => {
    db = createDatabase(inMemory);
    await migrateToLatest(db);
    if (signedInAs !== undefined) {
      await db
        .insertInto('users')
        .values({
          id: signedInAs,
          name: signedInAs,
          email: `${signedInAs}@example.test`,
          email_verified: 1,
        })
        .execute();
    }
    minted = 0;
    ticks = 0;
  });

  afterEach(async () => {
    server.resetHandlers(apiHandler);
    await db.destroy();
  });

  return {
    database: () => db,
    fails: (procedure: string) => server.use(failingProcedure(procedure)),
    wrap: (children: ReactNode) => <ApiProviders>{children}</ApiProviders>,
  };
};
