import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { getLogger } from '@/lib/logger';
import { createContext } from '@/lib/trpc/context';
import { trpcEndpoint } from '@/lib/trpc/endpoint';
import { appRouter } from '@/lib/trpc/root';

const log = getLogger('trpc');

const handler = (request: Request) =>
  fetchRequestHandler({
    endpoint: trpcEndpoint,
    req: request,
    router: appRouter,
    createContext: () => createContext({ headers: request.headers }),
    onError: ({ error, path }) => {
      log.error({ err: error, path, code: error.code }, 'tRPC call failed');
    },
  });

export { handler as GET, handler as POST };
