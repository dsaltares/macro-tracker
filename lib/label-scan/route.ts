import type { Logger } from 'pino';
import type { LabelReadingFailure, ReadLabel } from '../ai/label-reader.ts';
import type { Caller } from '../trpc/context.ts';

export const maxPhotoBytes = 8 * 1024 * 1024;

export type LabelScanError =
  | 'UNAUTHORIZED'
  | 'LABEL_SCANNING_OFF'
  | 'PHOTO_TOO_LARGE'
  | 'UNSUPPORTED_PHOTO'
  | LabelReadingFailure;

const failureStatuses = {
  unreadable: 422,
  rejected: 422,
  'rate-limited': 429,
  unavailable: 503,
} as const satisfies Record<LabelReadingFailure, number>;

const failed = (error: LabelScanError, status: number) =>
  Response.json({ error }, { status });

const jpegSignature = [0xff, 0xd8, 0xff];

const riffSignature = [0x52, 0x49, 0x46, 0x46];

const webpSignature = [0x57, 0x45, 0x42, 0x50];

const webpSignatureOffset = 8;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const isJpegOrWebp = (bytes: Uint8Array) =>
  startsWith(bytes, jpegSignature) ||
  (startsWith(bytes, riffSignature) &&
    startsWith(bytes, webpSignature, webpSignatureOffset));

const declaredLength = (headers: Headers) => {
  const length = Number(headers.get('content-length') ?? Number.NaN);
  return Number.isFinite(length) ? length : null;
};

const readUpTo = async (
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array | null> => {
  if (body === null) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > limit) {
      await body.cancel().catch(() => {});
      return null;
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

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
      return failed(result.failure, failureStatuses[result.failure]);
    }
    return Response.json(result.reading, {
      headers: { 'cache-control': 'no-store' },
    });
  };
