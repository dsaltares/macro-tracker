import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import type { LabelReadingResult, ReadLabel } from '../ai/label-reader.ts';
import type { LabelReading } from '../domain/foods/label-reading.ts';
import { maxPhotoBytes } from '../photo-upload.ts';
import { labelScanRoute } from './route.ts';

const signedInHeader = 'x-test-user';

const reading: LabelReading = {
  productName: { value: 'Oat biscuits', confidence: 0.95 },
  brand: null,
  netQuantity: null,
  servingSize: null,
  per100g: [
    { nutrient: 'energy_kcal', printed: '480', unit: 'kcal', confidence: 0.9 },
  ],
  perServing: [],
  notes: [],
};

const jpeg = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};

const webp = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0]);
  bytes.set(new TextEncoder().encode('WEBPVP8 '), 8);
  return bytes;
};

const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const reads =
  (result: LabelReadingResult): ReadLabel =>
  async () =>
    result;

const route = (
  readLabel: ReadLabel | null = reads({ read: true, reading }),
) => {
  const logger = pino({ enabled: false });
  const warn = vi.spyOn(logger, 'warn');
  return {
    warn,
    handle: labelScanRoute({
      readLabel,
      logger,
      resolveCaller: async (headers) => {
        const userId = headers.get(signedInHeader);
        return userId === null ? null : { userId };
      },
    }),
  };
};

const post = (
  body: BodyInit | null,
  { userId = 'user-1' as string | null, headers = {} } = {},
) =>
  new Request('http://localhost/api/label-scan', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'image/webp',
      ...(userId === null ? {} : { [signedInHeader]: userId }),
      ...headers,
    },
  });

const streamOf = (size: number, chunkSize = 1024 * 1024) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (let sent = 0; sent < size; sent += chunkSize) {
        controller.enqueue(jpeg(Math.min(chunkSize, size - sent)));
      }
      controller.close();
    },
  });

const streamed = (stream: ReadableStream<Uint8Array>) =>
  new Request('http://localhost/api/label-scan', {
    method: 'POST',
    body: stream,
    headers: { [signedInHeader]: 'user-1' },
    duplex: 'half',
  } as RequestInit);

describe('the label scan route', () => {
  it('answers 401 without a session, before reading anything', async () => {
    const readLabel = vi.fn(reads({ read: true, reading }));

    const response = await route(readLabel).handle(
      post(webp(), { userId: null }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'UNAUTHORIZED' });
    expect(readLabel).not.toHaveBeenCalled();
  });

  it.each([
    ['WebP', webp()],
    ['JPEG', jpeg()],
  ])('reads a %s photo and answers the reading', async (_, photo) => {
    const readLabel = vi.fn(reads({ read: true, reading }));

    const response = await route(readLabel).handle(post(photo));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(reading);
    expect(readLabel).toHaveBeenCalledWith(photo);
  });

  it('reads a photo of exactly the largest size', async () => {
    const readLabel = vi.fn(reads({ read: true, reading }));

    const response = await route(readLabel).handle(post(jpeg(maxPhotoBytes)));

    expect(response.status).toBe(200);
    expect(readLabel.mock.calls[0]?.[0].byteLength).toBe(maxPhotoBytes);
  });

  it('answers 413 for a photo over 8 MB, without reading it', async () => {
    const readLabel = vi.fn(reads({ read: true, reading }));

    const response = await route(readLabel).handle(
      post(jpeg(maxPhotoBytes + 1)),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'PHOTO_TOO_LARGE' });
    expect(readLabel).not.toHaveBeenCalled();
  });

  it('answers 413 for a streamed photo that runs over 8 MB, and stops reading it', async () => {
    const readLabel = vi.fn(reads({ read: true, reading }));
    const stream = streamOf(maxPhotoBytes + 2 * 1024 * 1024);
    const cancel = vi.spyOn(stream, 'cancel');

    const response = await route(readLabel).handle(streamed(stream));

    expect(response.status).toBe(413);
    expect(readLabel).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it('answers 413 when the declared length is over 8 MB', async () => {
    const response = await route().handle(
      post(webp(), {
        headers: { 'content-length': String(maxPhotoBytes + 1) },
      }),
    );

    expect(response.status).toBe(413);
  });

  it.each([
    ['a PNG', png()],
    ['an empty body', new Uint8Array()],
    ['text', new TextEncoder().encode('not a photo')],
  ])('answers 415 for %s', async (_, body) => {
    const readLabel = vi.fn(reads({ read: true, reading }));

    const response = await route(readLabel).handle(post(body));

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: 'UNSUPPORTED_PHOTO' });
    expect(readLabel).not.toHaveBeenCalled();
  });

  it('answers 503 while label scanning is off', async () => {
    const response = await route(null).handle(post(webp()));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'LABEL_SCANNING_OFF' });
  });

  it.each([
    ['unreadable', 422],
    ['rejected', 422],
    ['rate-limited', 429],
    ['unavailable', 503],
  ] as const)(
    'answers a reader that fails as %s with %i, and logs it without the photo',
    async (failure, status) => {
      const { handle, warn } = route(
        reads({ read: false, failure, message: 'The model said no' }),
      );

      const response = await handle(post(webp()));

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: failure });
      expect(warn).toHaveBeenCalledWith(
        { userId: 'user-1', failure, error: 'The model said no' },
        'A label could not be read',
      );
    },
  );
});
