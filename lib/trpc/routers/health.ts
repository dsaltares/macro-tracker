import { sql } from 'kysely';
import { publicProcedure, router } from '../trpc.ts';

export const healthRouter = router({
  check: publicProcedure.query(async ({ ctx }) => {
    await sql`select 1`.execute(ctx.db);
    return { status: 'ok' as const, checkedAt: ctx.now() };
  }),
});
