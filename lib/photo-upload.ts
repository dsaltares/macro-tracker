import type { AiFailure } from './ai/structured-output.ts';

export const maxPhotoBytes = 8 * 1024 * 1024;

export const aiFailureStatuses = {
  unreadable: 422,
  rejected: 422,
  'rate-limited': 429,
  unavailable: 503,
} as const satisfies Record<AiFailure, number>;

const jpegSignature = [0xff, 0xd8, 0xff];

const riffSignature = [0x52, 0x49, 0x46, 0x46];

const webpSignature = [0x57, 0x45, 0x42, 0x50];

const webpSignatureOffset = 8;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

export const isJpegOrWebp = (bytes: Uint8Array) =>
  startsWith(bytes, jpegSignature) ||
  (startsWith(bytes, riffSignature) &&
    startsWith(bytes, webpSignature, webpSignatureOffset));

export const declaredLength = (headers: Headers) => {
  const length = Number(headers.get('content-length') ?? Number.NaN);
  return Number.isFinite(length) ? length : null;
};

export const readUpTo = async (
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> => {
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
