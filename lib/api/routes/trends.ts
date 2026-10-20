import { z } from 'zod';
import { dateSchema } from '../../domain/dates.ts';
import type { NutrientVector } from '../../domain/nutrition/vector.ts';
import {
  maxTrendRangeDays,
  type TrendDay,
} from '../../domain/trends/aggregations.ts';
import { trendRange, trendRangeSchema } from '../../services/trends.ts';
import { apiHandler } from '../handler.ts';
import { trendDay } from '../schemas.ts';

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
  method: 'GET',
  path: '/trends',
  operationId: 'getTrends',
  summary: 'Trends over a range of days',
  description: `Each day of an inclusive range, at most ${maxTrendRangeDays} days: its totals, whether anything was logged, the rolling seven-day average over logged days, and the goal on that date. Adherence is the share of logged days within 10% of their energy goal, null when no day had one.`,
  scope: 'read',
  input: trendRangeSchema.describe('An inclusive range of days.'),
  output: z.object({
    from: dateSchema,
    to: dateSchema,
    adherence: z.number().nullable().describe('0 to 1, or null.'),
    days: z.array(trendDay),
  }),
  example: {
    input: { from: '2026-10-19', to: '2026-10-20' },
    response: {
      from: '2026-10-19',
      to: '2026-10-20',
      adherence: 0.5,
      days: [
        {
          date: '2026-10-19',
          logged: true,
          totals: {
            energy_kcal: 2104,
            protein: 118,
            carbohydrate: 240,
            fat: 72,
          },
          rollingAverage: {
            energy_kcal: 2032,
            protein: 112,
            carbohydrate: 228,
            fat: 70,
          },
          goal: {
            energy_kcal: 1976,
            protein: 114.2,
            carbohydrate: 231.5,
            fat: 65.9,
          },
        },
        {
          date: '2026-10-20',
          logged: true,
          totals: {
            energy_kcal: 1890,
            protein: 121,
            carbohydrate: 201,
            fat: 64,
          },
          rollingAverage: {
            energy_kcal: 2011,
            protein: 113,
            carbohydrate: 224,
            fat: 69,
          },
          goal: {
            energy_kcal: 1976,
            protein: 114.2,
            carbohydrate: 231.5,
            fat: 65.9,
          },
        },
      ],
    },
  },
  handle: async ({ context, input }) => {
    const { from, to, days, adherence } = await trendRange(context, input);
    return { from, to, adherence, days: days.map(dayOf) };
  },
});
