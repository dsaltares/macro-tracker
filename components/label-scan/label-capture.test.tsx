import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LabelCapture,
  photoUnusable,
  scanErrorMessages,
} from '@/components/label-scan/label-capture';
import {
  type ScanResult,
  shrinkPhoto,
  type UploadProgress,
  uploadPhoto,
} from '@/components/label-scan/photo';
import type { LabelReading } from '@/lib/domain/foods/label-reading';
import { renderUi } from '@/test/ui';

vi.mock('@/components/label-scan/photo', () => ({
  shrinkPhoto: vi.fn(),
  uploadPhoto: vi.fn(),
}));

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

const original = new File([new Uint8Array(4_000_000)], 'IMG_0001.jpg', {
  type: 'image/jpeg',
});

const shrunk = new Blob([new Uint8Array(300_000)], { type: 'image/webp' });

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const pendingUpload = () => {
  const result = deferred<ScanResult>();
  let progress: UploadProgress = () => {};
  vi.mocked(uploadPhoto).mockImplementationOnce((_, onProgress) => {
    progress = onProgress;
    return result.promise;
  });
  return {
    progress: (sent: number) => progress(sent),
    settle: result.resolve,
  };
};

const answers = (result: ScanResult) =>
  vi.mocked(uploadPhoto).mockResolvedValueOnce(result);

const render = () => {
  const onRead = vi.fn();
  const rendered = renderUi(<LabelCapture onRead={onRead} />);
  return { ...rendered, onRead };
};

const takePhoto = (user: ReturnType<typeof render>['user']) =>
  user.upload(screen.getByLabelText('Take a photo'), original);

beforeEach(() => {
  vi.mocked(shrinkPhoto).mockResolvedValue(shrunk);
});

describe('LabelCapture', () => {
  it('offers to take a photo with the rear camera or choose one', () => {
    render();

    expect(screen.getByLabelText('Take a photo')).toHaveAttribute(
      'capture',
      'environment',
    );
    expect(screen.getByLabelText('Choose a photo')).not.toHaveAttribute(
      'capture',
    );
  });

  it('shrinks the photo, shows it being sent, then read, and hands back the reading', async () => {
    const upload = pendingUpload();
    const { user, onRead } = render();

    await takePhoto(user);

    expect(shrinkPhoto).toHaveBeenCalledWith(original);
    expect(uploadPhoto).toHaveBeenCalledWith(shrunk, expect.any(Function));
    expect(
      await screen.findByRole('progressbar', { name: 'Sending the photo' }),
    ).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByLabelText('Take a photo')).not.toBeInTheDocument();

    upload.progress(0.4);

    expect(
      await screen.findByRole('progressbar', { name: 'Sending the photo' }),
    ).toHaveAttribute('aria-valuenow', '40');

    upload.progress(1);

    expect(await screen.findByText('Reading the label…')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(onRead).not.toHaveBeenCalled();

    upload.settle({ read: true, reading });

    await vi.waitFor(() => expect(onRead).toHaveBeenCalledWith(reading));
  });

  it('reads a photo chosen from the library the same way', async () => {
    answers({ read: true, reading });
    const { user, onRead } = render();

    await user.upload(screen.getByLabelText('Choose a photo'), original);

    await vi.waitFor(() => expect(onRead).toHaveBeenCalledWith(reading));
  });

  it('sends the same photo again on retry after a failure that may pass', async () => {
    answers({ read: false, error: 'unavailable' });
    answers({ read: true, reading });
    const { user, onRead } = render();

    await takePhoto(user);

    expect(
      await screen.findByText(scanErrorMessages.unavailable),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await vi.waitFor(() => expect(onRead).toHaveBeenCalledWith(reading));
    expect(shrinkPhoto).toHaveBeenCalledTimes(1);
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(vi.mocked(uploadPhoto).mock.calls[1]?.[0]).toBe(shrunk);
  });

  it.each(['unreadable', 'rate-limited', 'offline'] as const)(
    'offers a retry after %s',
    async (error) => {
      answers({ read: false, error });
      const { user } = render();

      await takePhoto(user);

      expect(
        await screen.findByText(scanErrorMessages[error]),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Try again' }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Take a photo')).toBeInTheDocument();
    },
  );

  it.each([
    'PHOTO_TOO_LARGE',
    'UNSUPPORTED_PHOTO',
    'rejected',
    'UNAUTHORIZED',
    'LABEL_SCANNING_OFF',
  ] as const)(
    'asks for another photo, not a retry, after %s',
    async (error) => {
      answers({ read: false, error });
      const { user } = render();

      await takePhoto(user);

      expect(
        await screen.findByText(scanErrorMessages[error]),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Try again' }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText('Take a photo')).toBeInTheDocument();
    },
  );

  it('takes another photo after a failure', async () => {
    answers({ read: false, error: 'unreadable' });
    answers({ read: true, reading });
    const { user, onRead } = render();

    await takePhoto(user);
    await screen.findByText(scanErrorMessages.unreadable);
    await takePhoto(user);

    await vi.waitFor(() => expect(onRead).toHaveBeenCalledWith(reading));
    expect(shrinkPhoto).toHaveBeenCalledTimes(2);
  });

  it('says so when the photo cannot be opened, and sends nothing', async () => {
    vi.mocked(shrinkPhoto).mockRejectedValueOnce(new Error('not an image'));
    const { user } = render();

    await takePhoto(user);

    expect(await screen.findByText(photoUnusable)).toBeInTheDocument();
    expect(uploadPhoto).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Choose a photo')).toBeInTheDocument();
  });
});
