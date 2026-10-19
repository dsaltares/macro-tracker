import { QueryClient } from '@tanstack/react-query';

const staleTimeMs = 30_000;

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: staleTimeMs, retry: 1 },
      mutations: { retry: 0 },
    },
  });
