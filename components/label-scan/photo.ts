import type { LabelReading } from '@/lib/domain/foods/label-reading';
import type { LabelScanError } from '@/lib/label-scan/route';
import { routes } from '@/lib/routes';

export const longEdgePx = 1600;

const photoQuality = 0.85;

const encode = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob === null
          ? reject(new Error('The photo could not be encoded'))
          : resolve(blob),
      type,
      photoQuality,
    ),
  );

export const shrinkPhoto = async (photo: Blob): Promise<Blob> => {
  const bitmap = await createImageBitmap(photo, {
    imageOrientation: 'from-image',
  });
  const scale = Math.min(1, longEdgePx / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    throw new Error('The photo could not be drawn');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await encode(canvas, 'image/webp');
  // Safari cannot encode WebP and hands back a PNG, which the route refuses.
  return webp.type === 'image/webp' ? webp : encode(canvas, 'image/jpeg');
};

export type ScanError = LabelScanError | 'offline';

export type ScanResult =
  | { read: true; reading: LabelReading }
  | { read: false; error: ScanError };

export type UploadProgress = (sent: number) => void;

const ok = 200;

export type Answer =
  | { answered: true; ok: boolean; body: unknown }
  | { answered: false };

export const postWithProgress = (
  url: string,
  body: Blob | FormData,
  onProgress: UploadProgress,
) =>
  new Promise<Answer>((resolve) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.responseType = 'json';
    if (body instanceof Blob) {
      request.setRequestHeader('content-type', body.type);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };
    request.upload.onload = () => onProgress(1);
    request.onload = () =>
      resolve({
        answered: true,
        ok: request.status === ok,
        body: request.response,
      });
    request.onerror = () => resolve({ answered: false });
    request.send(body);
  });

export const errorOf = <Error extends string>(body: unknown) =>
  (typeof body === 'object' && body !== null && 'error' in body
    ? (body.error as Error | undefined)
    : undefined) ?? 'unavailable';

export const uploadPhoto = async (
  photo: Blob,
  onProgress: UploadProgress,
): Promise<ScanResult> => {
  const answer = await postWithProgress(routes.labelScan, photo, onProgress);
  if (!answer.answered) {
    return { read: false, error: 'offline' };
  }
  return answer.ok
    ? { read: true, reading: answer.body as LabelReading }
    : { read: false, error: errorOf<ScanError>(answer.body) };
};
