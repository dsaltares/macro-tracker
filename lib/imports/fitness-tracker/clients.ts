import { z } from 'zod';
import { addDays } from '../../domain/dates.ts';
import {
  type CronometerFood,
  type CronometerServing,
  cronometerFoodSchema,
  cronometerServingSchema,
  type WeighIn,
  weighInSchema,
} from './cronometer.ts';

type Fetch = typeof fetch;

export type DateRange = { from: string; to: string };

export const defaultFitnessTrackerUrl = 'https://fitness-tracker.saltares.dev';

export const fitnessTrackerUrl = (
  configured = process.env.FITNESS_TRACKER_URL,
) => configured || defaultFitnessTrackerUrl;

const queryRowLimit = 50_000;

const timeZoneMarginDays = 1;

const queryResponseSchema = z.object({
  truncated: z.boolean(),
  rows: z.array(z.unknown()),
});

export const keyRefused =
  'fitness-tracker refused the API key. Check it and try again.';

export const unreachable =
  'fitness-tracker could not be reached. Try again later.';

export const tooManyRows = `fitness-tracker has more than ${queryRowLimit} rows to send in one go.`;

const fitnessTrackerCause = 'fitness-tracker';

const failure = (message: string) =>
  new Error(message, { cause: fitnessTrackerCause });

export const isFitnessTrackerFailure = (error: unknown): error is Error =>
  error instanceof Error && error.cause === fitnessTrackerCause;

export type FitnessTracker = {
  check: () => Promise<void>;
  servings: (range: DateRange) => Promise<CronometerServing[]>;
  foods: (ids: readonly number[]) => Promise<CronometerFood[]>;
  weighIns: (range: DateRange) => Promise<WeighIn[]>;
};

const refusedStatuses = new Set([401, 403]);

export const fitnessTrackerClient = ({
  url,
  key,
  fetch: send = fetch,
}: {
  url: string;
  key: string;
  fetch?: Fetch;
}): FitnessTracker => {
  const query = async <Row extends z.ZodType>(
    row: Row,
    sql: string,
    params: (string | number)[] = [],
  ): Promise<z.output<Row>[]> => {
    const response = await send(new URL('/query', url), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sql, params, limit: queryRowLimit }),
    }).catch(() => {
      throw failure(unreachable);
    });
    if (refusedStatuses.has(response.status)) {
      throw failure(keyRefused);
    }
    if (!response.ok) {
      throw failure(
        `fitness-tracker answered ${response.status}. Try again later.`,
      );
    }
    const answer = queryResponseSchema.parse(await response.json());
    if (answer.truncated) {
      throw failure(tooManyRows);
    }
    return answer.rows.map((value) => row.parse(value));
  };

  return {
    check: async () => {
      await query(z.unknown(), 'select 1');
    },
    servings: ({ from, to }) =>
      query(
        cronometerServingSchema,
        `select serving_id, day, time, meal_group, food_id, measure_name,
           quantity_grams, energy_kcal, nutrients_json
         from nutrition_servings
         where day between ? and ?
         order by day, serving_id`,
        [from, to],
      ),
    foods: async (ids) =>
      ids.length === 0
        ? []
        : query(
            cronometerFoodSchema,
            `select food_id, name, source, measures_json, nutrients_json
             from foods
             where food_id in (select value from json_each(?))`,
            [JSON.stringify(ids)],
          ),
    weighIns: ({ from, to }) =>
      query(
        weighInSchema,
        `select measured_at, weight
         from body_composition
         where measured_at >= ? and measured_at < ?
         order by measured_at`,
        [
          addDays(from, -timeZoneMarginDays),
          addDays(to, 1 + timeZoneMarginDays),
        ],
      ),
  };
};
