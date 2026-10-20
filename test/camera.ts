import { afterEach, vi } from 'vitest';

type FakeCameraOptions = {
  codes?: string[];
  error?: string;
  torch?: boolean;
};

export const fakeCamera = ({
  codes = [],
  error,
  torch = false,
}: FakeCameraOptions = {}) => {
  const track = {
    kind: 'video',
    stop: vi.fn(),
    getCapabilities: () => (torch ? { torch: true } : {}),
    applyConstraints: vi.fn(async () => {}),
  };
  const stream = Object.assign(new MediaStream(), {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  });
  const getUserMedia = vi.fn(async () => {
    if (error !== undefined) {
      throw new DOMException('Camera unavailable', error);
    }
    return stream;
  });

  class FakeBarcodeDetector {
    static getSupportedFormats = async () => ['ean_8', 'ean_13', 'upc_a'];
    detect = async () => codes.map((rawValue) => ({ rawValue }));
  }

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal('BarcodeDetector', FakeBarcodeDetector);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

  return { getUserMedia, track };
};

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
