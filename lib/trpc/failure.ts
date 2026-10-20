import { TRPCClientError } from '@trpc/client';
import { somethingWentWrong } from '../auth/errors.ts';

export const failureOf = (error: unknown) =>
  error instanceof TRPCClientError && error.data?.code === 'BAD_REQUEST'
    ? error.message
    : somethingWentWrong;
