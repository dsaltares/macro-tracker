import type { NutrientVector } from '../../domain/nutrition/vector.ts';
import type { TrendDay } from '../../domain/trends/aggregations.ts';
import { trendRange, trendRangeSchema } from '../../services/trends.ts';
import { apiHandler } from '../handler.ts';

const dayOf = ({
  date,
  logged,
  totals,
  rollingAverage,
  goal,
}: TrendDay & { goal: NutrientVector | null }) => ({
  date,
  logged,
  totals,
  rollingAverage,
  goal,
});

export const trendsRoute = apiHandler({
  scope: 'read',
  input: trendRangeSchema,
  handle: async ({ context, input }) => {
    const { from, to, days, adherence } = await trendRange(context, input);
    return { from, to, adherence, days: days.map(dayOf) };
  },
});
