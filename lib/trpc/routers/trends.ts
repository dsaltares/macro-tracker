import { trendNutrients } from '../../db/trends.ts';
import { trendRange, trendRangeSchema } from '../../services/trends.ts';
import { accountProcedure, router } from '../trpc.ts';

export const trendsRouter = router({
  range: accountProcedure
    .input(trendRangeSchema)
    .query(({ ctx, input }) => trendRange(ctx, input)),
  nutrients: accountProcedure
    .input(trendRangeSchema)
    .query(({ ctx, input }) =>
      trendNutrients(ctx.db, ctx.caller.userId, input),
    ),
});
