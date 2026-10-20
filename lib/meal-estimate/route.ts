import type { Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { z } from 'zod';
import type { EstimateMeal } from '../ai/meal-estimator.ts';
import type { AiFailure } from '../ai/structured-output.ts';
import {
  mealEstimatorFoods,
  resolveMealMatches,
} from '../db/meal-estimator-foods.ts';
import type { Database } from '../db/schema.ts';
import {
  maxMealDescriptionLength,
  mealDraft,
  previousEstimateSchema,
} from '../domain/diary/meal-estimate.ts';
import {
  aiFailureStatuses,
  declaredLength,
  isJpegOrWebp,
  maxPhotoBytes,
  readUpTo,
} from '../photo-upload.ts';
import type { Caller } from '../trpc/context.ts';

export const maxMealPhotos = 4;

const maxFieldBytes = 256 * 1024;

export const maxMealEstimateBytes =
  maxMealPhotos * maxPhotoBytes + maxFieldBytes;

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

type PreviousEstimate = z.infer<typeof previousEstimateSchema>;

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
    const result = await estimateMeal({
      photos,
      description: fields.description,
      foods: mealEstimatorFoods(reader),
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
      return failed(result.failure, aiFailureStatuses[result.failure]);
    }
    const draft = mealDraft(
      result.estimate,
      await resolveMealMatches(reader, result.estimate),
    );
    return Response.json(draft, { headers: { 'cache-control': 'no-store' } });
  };
