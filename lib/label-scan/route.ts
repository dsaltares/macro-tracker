import type { Logger } from 'pino';
import type { LabelReadingFailure, ReadLabel } from '../ai/label-reader.ts';
import {
  aiFailureStatuses,
  declaredLength,
  isJpegOrWebp,
  maxPhotoBytes,
  readUpTo,
} from '../photo-upload.ts';
import type { Caller } from '../trpc/context.ts';

export type LabelScanError =
  | 'UNAUTHORIZED'
  | 'LABEL_SCANNING_OFF'
  | 'PHOTO_TOO_LARGE'
  | 'UNSUPPORTED_PHOTO'
  | LabelReadingFailure;

const failed = (error: LabelScanError, status: number) =>
  Response.json({ error }, { status });

export type LabelScanRouteOptions = {
  readLabel: ReadLabel | null;
  resolveCaller: (headers: Headers) => Promise<Caller | null>;
  logger: Logger;
};

export const labelScanRoute =
  ({ readLabel, resolveCaller, logger }: LabelScanRouteOptions) =>
  async (request: Request) => {
    const caller = await resolveCaller(request.headers);
    if (caller === null) {
      return failed('UNAUTHORIZED', 401);
    }
    if (readLabel === null) {
      return failed('LABEL_SCANNING_OFF', 503);
    }
    const length = declaredLength(request.headers);
    if (length !== null && length > maxPhotoBytes) {
      return failed('PHOTO_TOO_LARGE', 413);
    }
    const photo = await readUpTo(request.body, maxPhotoBytes);
    if (photo === null) {
      return failed('PHOTO_TOO_LARGE', 413);
    }
    if (!isJpegOrWebp(photo)) {
      return failed('UNSUPPORTED_PHOTO', 415);
    }
    const result = await readLabel(photo);
    if (!result.read) {
      logger.warn(
        {
          userId: caller.userId,
          failure: result.failure,
          error: result.message,
        },
        'A label could not be read',
      );
      return failed(result.failure, aiFailureStatuses[result.failure]);
    }
    return Response.json(result.reading, {
      headers: { 'cache-control': 'no-store' },
    });
  };
