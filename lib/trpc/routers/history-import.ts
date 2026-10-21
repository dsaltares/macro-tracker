import { TRPCError } from '@trpc/server';
import { latestHistoryImport } from '../../db/history-imports.ts';
import { startHistoryImportSchema } from '../../domain/imports/history-import.ts';
import { isFitnessTrackerFailure } from '../../imports/fitness-tracker/clients.ts';
import { launchHistoryImport } from '../../imports/history-import.ts';
import { accountProcedure, router } from '../trpc.ts';

export const alreadyRunning =
  'An import is already running. Wait for it to finish.';

export const historyImportRouter = router({
  start: accountProcedure
    .input(startHistoryImportSchema)
    .mutation(async ({ ctx, input }) => {
      const launched = await launchHistoryImport(ctx, input).catch(
        (error: unknown) => {
          if (isFitnessTrackerFailure(error)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error.message,
            });
          }
          throw error;
        },
      );
      if (!launched.started) {
        throw new TRPCError({ code: 'CONFLICT', message: alreadyRunning });
      }
      return launched.run;
    }),
  latest: accountProcedure.query(({ ctx }) =>
    latestHistoryImport(ctx.db, ctx.caller.userId),
  ),
});
