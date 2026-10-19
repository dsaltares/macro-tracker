'use client';

import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { type ReactNode, useState } from 'react';
import { trpcEndpoint } from './endpoint.ts';
import { createQueryClient } from './query-client.ts';
import type { AppRouter } from './root.ts';

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

const inDevelopment = process.env.NODE_ENV === 'development';

const isBrowser = () => typeof window !== 'undefined';

let browserQueryClient: QueryClient | undefined;

const getQueryClient = () => {
  if (!isBrowser()) {
    return createQueryClient();
  }
  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
};

export const TRPCClientProvider = ({
  queryClient,
  url,
  children,
}: {
  queryClient: QueryClient;
  url: string;
  children: ReactNode;
}) => {
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({ links: [httpBatchLink({ url })] }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
      {inDevelopment ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
};

export const TRPCReactProvider = ({ children }: { children: ReactNode }) => (
  <TRPCClientProvider queryClient={getQueryClient()} url={trpcEndpoint}>
    {children}
  </TRPCClientProvider>
);
