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
const maxAttempts = 5;
const firstBackoffMs = 1_000;
const maxBackoffMs = 60_000;
const millisecondsPerSecond = 1_000;

export const loginRefused =
  'Cronometer refused the email or password. Check them and try again.';

export const signInLocked =
  'Cronometer has paused sign-ins to this account after too many attempts. Wait a while, maybe an hour, and try again.';

export const rateLimited =
  'Cronometer is limiting how fast it answers. Try again in a while.';

export const unreachable = 'Cronometer could not be reached. Try again later.';

export const unexpectedAnswer =
  'Cronometer answered in a way this import does not understand. Try again later.';

const cronometerCause = 'cronometer';

const failure = (message: string) =>
  new Error(message, { cause: cronometerCause });

export const isCronometerFailure = (error: unknown): error is Error =>
  error instanceof Error && error.cause === cronometerCause;

type Log = (details: Record<string, unknown>, message: string) => void;

export type CronometerLogger = { info: Log; warn: Log };

const silent: CronometerLogger = { info: () => {}, warn: () => {} };

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

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
const expiredStatuses = new Set([401, 403]);
const refusedLoginStatuses = new Set([400, 401, 403]);
const tooManyRequests = 429;
const retriedStatuses = new Set([tooManyRequests, 500, 502, 503, 504]);

const backoffFor = (attempt: number, response: Response | null) => {
  const retryAfter = Number(response?.headers.get('retry-after'));
  const asked =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * millisecondsPerSecond
      : firstBackoffMs * 2 ** (attempt - 1);
  return Math.min(asked, maxBackoffMs);
};

const tooManyAttempts = /too many|try again later/i;

const errorOf = (answer: unknown) =>
  typeof answer === 'object' && answer !== null && 'error' in answer
    ? String(answer.error)
    : null;

const weightMetric = 'weight';
const kilograms = 'kg';

const chunks = <Item>(items: readonly Item[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

type Session = { userId: number; token: string };

export const cronometerClient = ({
  email,
  password,
  fetch: send = fetch,
  logger = silent,
  wait = sleep,
}: {
  email: string;
  password: string;
  fetch?: Fetch;
  logger?: CronometerLogger;
  wait?: (milliseconds: number) => Promise<void>;
}): Cronometer => {
  let session: Session | null = null;
  let signingIn: Promise<Session> | null = null;

  const post = async (endpoint: string, body: unknown): Promise<Response> => {
    for (let attempt = 1; ; attempt += 1) {
      const response = await send(new URL(endpoint, apiUrl), {
        method: 'POST',
        headers: appHeaders,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      }).catch(() => null);
      const retried = response === null || retriedStatuses.has(response.status);
      if (!retried) {
        return response;
      }
      if (attempt >= maxAttempts) {
        if (response === null) {
          throw failure(unreachable);
        }
        return response;
      }
      const backoffMs = backoffFor(attempt, response);
      logger.warn(
        { endpoint, status: response?.status ?? null, attempt, backoffMs },
        'Cronometer did not answer; trying again',
      );
      await wait(backoffMs);
    }
  };

  const failureFor = (endpoint: string, response: Response) => {
    logger.warn(
      { endpoint, status: response.status },
      'Cronometer answered with an error',
    );
    return failure(
      response.status === tooManyRequests ? rateLimited : unexpectedAnswer,
    );
  };

  const login = async (): Promise<Session> => {
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
    const answer: unknown = await response.json().catch(() => null);
    if (refusedLoginStatuses.has(response.status)) {
      const error = errorOf(answer);
      logger.warn(
        { status: response.status, error },
        'Cronometer refused the sign-in',
      );
      throw failure(
        error !== null && tooManyAttempts.test(error)
          ? signInLocked
          : loginRefused,
      );
    }
    if (!response.ok) {
      throw failureFor('login', response);
    }
    const signedIn = loginSchema.safeParse(answer);
    if (!signedIn.success) {
      logger.warn(
        { status: response.status, error: errorOf(answer) },
        'Cronometer answered the sign-in without a session',
      );
      const error = errorOf(answer);
      throw failure(
        error === null
          ? unexpectedAnswer
          : tooManyAttempts.test(error)
            ? signInLocked
            : loginRefused,
      );
    }
    session = { userId: signedIn.data.id, token: signedIn.data.sessionKey };
    logger.info({}, 'Signed in to Cronometer');
    return session;
  };

  const signIn = () => {
    signingIn ??= login().finally(() => {
      signingIn = null;
    });
    return signingIn;
  };

  const request = async (
    endpoint: string,
    payload: Record<string, unknown>,
    retried = false,
  ): Promise<unknown> => {
    const current = session ?? (await signIn());
    const response = await post(endpoint, {
      ...payload,
      lastSeen: 0,
      auth: { userId: current.userId, token: current.token, ...appAuth },
    });
    const answer: unknown = response.ok
      ? await response.json().catch(() => null)
      : null;
    const expired =
      expiredStatuses.has(response.status) ||
      (typeof answer === 'object' &&
        answer !== null &&
        'result' in answer &&
        failedResults.has(String(answer.result)));
    if (expired && !retried) {
      logger.warn(
        { endpoint, status: response.status },
        'Cronometer ended the session; signing in again',
      );
      if (session === current) {
        session = null;
      }
      return request(endpoint, payload, true);
    }
    if (!response.ok || expired) {
      throw failureFor(endpoint, response);
    }
    if (answer === null) {
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
    login: async () => {
      await signIn();
    },
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
