import { z } from 'zod';
import {
  type CronometerFood,
  cronometerFoodSchema,
  type DiaryEntry,
  diaryEntrySchema,
  type Weight,
} from './cronometer.ts';

type Fetch = typeof fetch;

export type DateRange = { from: string; to: string };

const apiUrl = 'https://mobile.cronometer.com/api/v2/';

// Cronometer has no public API: this is the one its Android app uses, which only answers a client
// that names itself as that app (the build, device and auth fields below, taken from a real session).
const appBuild = '4.48.2 b2807-a';
const appDevice = 'Android 14 (SDK 34), Google Pixel 6 Pro';
const appAuth = { api: 3, os: 'Android', build: '2807', flavour: 'free' };
const appHeaders = {
  'user-agent': 'Dart/3.9 (dart:io)',
  'content-type': 'text/plain; charset=utf-8',
};

const timeoutMs = 30_000;
const foodsPerRequest = 50;

export const loginRefused =
  'Cronometer refused the email or password. Check them and try again.';

export const unreachable = 'Cronometer could not be reached. Try again later.';

export const unexpectedAnswer =
  'Cronometer answered in a way this import does not understand. Try again later.';

const cronometerCause = 'cronometer';

const failure = (message: string) =>
  new Error(message, { cause: cronometerCause });

export const isCronometerFailure = (error: unknown): error is Error =>
  error instanceof Error && error.cause === cronometerCause;

export type Cronometer = {
  login: () => Promise<void>;
  diary: (date: string) => Promise<DiaryEntry[]>;
  foods: (ids: readonly number[]) => Promise<CronometerFood[]>;
  weights: (range: DateRange) => Promise<Weight[]>;
};

export const cronometerDay = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}-${month}-${day}`;
};

const paddedDate = (day: string) => {
  const [year, month, date] = day.split('-');
  return `${year}-${month?.padStart(2, '0')}-${date?.padStart(2, '0')}`;
};

const loginSchema = z.object({ id: z.number(), sessionKey: z.string() });

const diarySchema = z.object({ diary: z.array(z.unknown()).nullish() });

const foodsSchema = z.object({ foods: z.array(z.unknown()).nullish() });

const metricsSchema = z.object({
  metrics: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        units: z
          .array(z.object({ id: z.number(), name: z.string() }))
          .nullish(),
      }),
    )
    .nullish(),
});

const biometricsSchema = z.object({
  data: z.array(z.object({ day: z.string(), value: z.number() })).nullish(),
});

const failedResults = new Set(['FAIL', 'FAILURE']);
const refusedStatuses = new Set([401, 403]);

const weightMetric = 'weight';
const kilograms = 'kg';

const chunks = <Item>(items: readonly Item[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

export const cronometerClient = ({
  email,
  password,
  fetch: send = fetch,
}: {
  email: string;
  password: string;
  fetch?: Fetch;
}): Cronometer => {
  let session: { userId: number; token: string } | null = null;

  const post = (endpoint: string, body: unknown) =>
    send(new URL(endpoint, apiUrl), {
      method: 'POST',
      headers: appHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => {
      throw failure(unreachable);
    });

  const login = async () => {
    const response = await post('login', {
      email,
      password,
      // A time zone here overwrites the one set on the Cronometer account.
      timezone: null,
      userCode: null,
      build: appBuild,
      device: appDevice,
      firebaseToken: '',
      features: {},
      auth: { userId: null, token: null, ...appAuth },
      lastSeen: 0,
      config: { call_version: 2 },
    });
    const answer = loginSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!response.ok || !answer.success) {
      throw failure(loginRefused);
    }
    session = { userId: answer.data.id, token: answer.data.sessionKey };
  };

  const request = async (
    endpoint: string,
    payload: Record<string, unknown>,
    retried = false,
  ): Promise<unknown> => {
    if (session === null) {
      await login();
    }
    const response = await post(endpoint, {
      ...payload,
      lastSeen: 0,
      auth: { userId: session?.userId, token: session?.token, ...appAuth },
    });
    const answer: unknown = response.ok
      ? await response.json().catch(() => null)
      : null;
    const expired =
      refusedStatuses.has(response.status) ||
      (typeof answer === 'object' &&
        answer !== null &&
        'result' in answer &&
        failedResults.has(String(answer.result)));
    if (expired && !retried) {
      session = null;
      return request(endpoint, payload, true);
    }
    if (!response.ok || expired || answer === null) {
      throw failure(unexpectedAnswer);
    }
    return answer;
  };

  const parsed = <Schema extends z.ZodType>(
    schema: Schema,
    answer: unknown,
  ) => {
    const result = schema.safeParse(answer);
    if (!result.success) {
      throw failure(unexpectedAnswer);
    }
    return result.data as z.output<Schema>;
  };

  const entries = <Item extends z.ZodType>(
    schema: Item,
    items: readonly unknown[] | null | undefined,
  ) =>
    (items ?? []).flatMap((item) => {
      const result = schema.safeParse(item);
      return result.success ? [result.data as z.output<Item>] : [];
    });

  return {
    login,
    diary: async (date) => {
      const { diary } = parsed(
        diarySchema,
        await request('get_diary', {
          day: cronometerDay(date),
          config: { call_version: 1 },
        }),
      );
      return entries(diaryEntrySchema, diary).filter(
        ({ type }) => type === 'Serving',
      );
    },
    foods: async (ids) => {
      const foods: CronometerFood[] = [];
      for (const batch of chunks(ids, foodsPerRequest)) {
        const answer = parsed(
          foodsSchema,
          await request('get_foods', {
            ids: batch,
            config: { call_version: 1 },
          }),
        );
        foods.push(...entries(cronometerFoodSchema, answer.foods));
      }
      return foods;
    },
    weights: async ({ from, to }) => {
      const { metrics } = parsed(
        metricsSchema,
        await request('get_metrics', { config: { call_version: 1 } }),
      );
      const metric = metrics?.find(
        ({ name }) => name.trim().toLowerCase() === weightMetric,
      );
      const unit = metric?.units?.find(
        ({ name }) => name.trim().toLowerCase() === kilograms,
      );
      if (!metric || !unit) {
        return [];
      }
      const { data } = parsed(
        biometricsSchema,
        await request('get_biometrics', {
          metricId: metric.id,
          unitId: unit.id,
          start: cronometerDay(from),
          end: cronometerDay(to),
          config: { call_version: 1 },
        }),
      );
      return (data ?? []).map(({ day, value }) => ({
        date: paddedDate(day),
        kilograms: value,
      }));
    },
  };
};
