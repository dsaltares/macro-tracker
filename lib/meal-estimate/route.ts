import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { EstimateMeal } from '../ai/meal-estimator.ts';
import type { AiFailure } from '../ai/structured-output.ts';
import { llmCallRecorder } from '../db/llm-calls.ts';
import {
  mealEstimatorFoods,
  resolveMealMatches,
} from '../db/meal-estimator-foods.ts';
import type { Database } from '../db/schema.ts';
import {
  type MealDraft,
  type MealEstimateProgress,
  maxMealDescriptionLength,
  maxMealPhotos,
  mealDraft,
  type PreviousEstimate,
  previousEstimateSchema,
} from '../domain/diary/meal-estimate.ts';
import {
  declaredLength,
  isJpegOrWebp,
  maxPhotoBytes,
  readUpTo,
} from '../photo-upload.ts';
import type { Caller } from '../trpc/context.ts';

const maxFieldBytes = 256 * 1024;

// The browser shrinks each meal photo to a few hundred kilobytes, so the whole
// request is capped well under maxMealPhotos * maxPhotoBytes, which is held in memory.
const maxMealPhotosBytes = 32 * 1024 * 1024;

export const maxMealEstimateBytes = maxMealPhotosBytes + maxFieldBytes;

export type MealEstimateError =
  | 'UNAUTHORIZED'
  | 'MEAL_ESTIMATES_OFF'
  | 'PHOTO_TOO_LARGE'
  | 'UNSUPPORTED_PHOTO'
  | 'INVALID_REQUEST'
  | AiFailure;

const failed = (error: MealEstimateError, status: number) =>
  Response.json({ error }, { status });

const invalid = () => failed('INVALID_REQUEST', 400);

type MealEstimateForm = {
  photos: File[];
  description: string | null;
  previous: PreviousEstimate | undefined;
};

const formOf = async (
  contentType: string | null,
  body: Uint8Array<ArrayBuffer>,
): Promise<FormData | null> => {
  if (!contentType?.startsWith('multipart/form-data')) {
    return null;
  }
  try {
    return await new Response(body, {
      headers: { 'content-type': contentType },
    }).formData();
  } catch {
    return null;
  }
};

const optionalText = (form: FormData, name: string) => {
  const value = form.get(name);
  if (value === null) {
    return null;
  }
  return typeof value === 'string' ? value.trim() || null : undefined;
};

const previousOf = (text: string | null) => {
  if (text === null) {
    return { success: true, data: undefined } as const;
  }
  try {
    return previousEstimateSchema.safeParse(JSON.parse(text));
  } catch {
    return { success: false } as const;
  }
};

const photosOf = (form: FormData) => {
  const photos = form.getAll('photos');
  return photos.length > 0 &&
    photos.length <= maxMealPhotos &&
    photos.every((photo): photo is File => photo instanceof File)
    ? photos
    : null;
};

const fieldsOf = (form: FormData): MealEstimateForm | null => {
  const photos = photosOf(form);
  const description = optionalText(form, 'description');
  const previousText = optionalText(form, 'previous');
  if (
    photos === null ||
    description === undefined ||
    (description?.length ?? 0) > maxMealDescriptionLength ||
    previousText === undefined
  ) {
    return null;
  }
  const previous = previousOf(previousText);
  return previous.success
    ? { photos, description, previous: previous.data }
    : null;
};

// A proxy in front of the server, such as Cloudflare's, drops a request whose answer has not
// started within 100 seconds, and an estimate of many photos can take longer. So once the
// request is valid the answer starts at once, 200, as newline-delimited JSON: a line
// `{ progress }` for each thing the estimator does (`MealEstimateProgress`), a blank line every
// few seconds while it is quiet, and a last line `{ draft }` or the estimator's failure as
// `{ error }`.
export const keepAliveMs = 10_000;

export type MealEstimateLine =
  | { progress: MealEstimateProgress }
  | { draft: MealDraft }
  | { error: AiFailure };

const encoder = new TextEncoder();

const keepAlive = encoder.encode('\n');

const lineOf = (line: MealEstimateLine) =>
  encoder.encode(`${JSON.stringify(line)}\n`);

const streamed = (
  requestSignal: AbortSignal,
  logger: Logger,
  answer: (
    signal: AbortSignal,
    onProgress: (progress: MealEstimateProgress) => void,
  ) => Promise<MealEstimateLine>,
) => {
  const closed = new AbortController();
  const aborted = AbortSignal.any([requestSignal, closed.signal]);
  let timer: ReturnType<typeof setInterval> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const send = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          // The browser went away and cancelled the stream.
        }
      };
      send(keepAlive);
      timer = setInterval(() => send(keepAlive), keepAliveMs);
      answer(aborted, (progress) => send(lineOf({ progress })))
        .catch((error: unknown): MealEstimateLine => {
          logger.error({ err: error }, 'A meal estimate failed');
          return { error: 'unavailable' };
        })
        .then((line) => {
          clearInterval(timer);
          send(lineOf(line));
          try {
            controller.close();
          } catch {
            // The browser went away and cancelled the stream.
          }
        });
    },
    cancel: () => {
      clearInterval(timer);
      closed.abort();
    },
  });
  return new Response(body, {
    headers: {
      'content-type': 'application/x-ndjson',
      // no-transform keeps Next's compression and the proxy's from holding the lines back.
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
};

export type MealEstimateRouteOptions = {
  estimateMeal: EstimateMeal | null;
  resolveCaller: (headers: Headers) => Promise<Caller | null>;
  db: Kysely<Database>;
  logger: Logger;
};

export const mealEstimateRoute =
  ({ estimateMeal, resolveCaller, db, logger }: MealEstimateRouteOptions) =>
  async (request: Request) => {
    const caller = await resolveCaller(request.headers);
    if (caller === null) {
      return failed('UNAUTHORIZED', 401);
    }
    if (estimateMeal === null) {
      return failed('MEAL_ESTIMATES_OFF', 503);
    }
    const length = declaredLength(request.headers);
    if (length !== null && length > maxMealEstimateBytes) {
      return failed('PHOTO_TOO_LARGE', 413);
    }
    const body = await readUpTo(request.body, maxMealEstimateBytes);
    if (body === null) {
      return failed('PHOTO_TOO_LARGE', 413);
    }
    const form = await formOf(request.headers.get('content-type'), body);
    const fields = form === null ? null : fieldsOf(form);
    if (fields === null) {
      return invalid();
    }
    if (fields.photos.some(({ size }) => size > maxPhotoBytes)) {
      return failed('PHOTO_TOO_LARGE', 413);
    }
    const photos = await Promise.all(
      fields.photos.map(
        async (photo) => new Uint8Array(await photo.arrayBuffer()),
      ),
    );
    if (!photos.every(isJpegOrWebp)) {
      return failed('UNSUPPORTED_PHOTO', 415);
    }
    const reader = { db, userId: caller.userId };
    return streamed(request.signal, logger, async (aborted, onProgress) => {
      const result = await estimateMeal({
        photos,
        description: fields.description,
        foods: mealEstimatorFoods(reader),
        signal: aborted,
        onProgress,
        recordCall: llmCallRecorder({ ...reader, logger }),
        ...(fields.previous === undefined ? {} : { previous: fields.previous }),
      });
      if (!result.estimated) {
        logger.warn(
          {
            userId: caller.userId,
            failure: result.failure,
            error: result.message,
          },
          'A meal could not be estimated',
        );
        return { error: result.failure };
      }
      return {
        draft: mealDraft(
          result.estimate,
          await resolveMealMatches(reader, result.estimate),
        ),
      };
    });
  };
