import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBarcodeDetector,
  locateZXingFile,
  scannedFormats,
  zxingWasmPath,
} from './detector.ts';

const ponyfill = vi.hoisted(() => ({
  BarcodeDetector: vi.fn(function PolyfilledDetector() {}),
  prepareZXingModule: vi.fn(),
}));

vi.mock('barcode-detector/ponyfill', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...ponyfill,
}));

const nativeDetector = (supported: string[]) => {
  const Native = Object.assign(
    vi.fn(function NativeDetector() {}),
    { getSupportedFormats: async () => supported },
  );
  vi.stubGlobal('BarcodeDetector', Native);
  return Native;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createBarcodeDetector', () => {
  it('uses the browser’s detector when it reads every scanned format', async () => {
    const Native = nativeDetector(['qr_code', ...scannedFormats]);

    await createBarcodeDetector();

    expect(Native).toHaveBeenCalledWith({ formats: scannedFormats });
    expect(ponyfill.BarcodeDetector).not.toHaveBeenCalled();
  });

  it('falls back to the polyfill when the browser’s detector misses a format', async () => {
    nativeDetector(['ean_13']);

    await createBarcodeDetector();

    expect(ponyfill.BarcodeDetector).toHaveBeenCalledWith({
      formats: scannedFormats,
    });
  });

  it('falls back to the polyfill, loading ZXing from the app, without a browser detector', async () => {
    await createBarcodeDetector();

    expect(ponyfill.BarcodeDetector).toHaveBeenCalledWith({
      formats: scannedFormats,
    });
    expect(ponyfill.prepareZXingModule).toHaveBeenCalledWith({
      overrides: { locateFile: locateZXingFile },
    });
  });
});

describe('locateZXingFile', () => {
  it('serves the wasm from the app and leaves any other file where it is', () => {
    expect(locateZXingFile('zxing_reader.wasm', 'https://cdn/')).toBe(
      zxingWasmPath,
    );
    expect(locateZXingFile('other.js', 'https://cdn/')).toBe(
      'https://cdn/other.js',
    );
  });
});

describe('the ZXing wasm the app serves', () => {
  it('is the one the installed polyfill was built against', async () => {
    const { ZXING_WASM_SHA256 } = await vi.importActual<
      typeof import('barcode-detector/ponyfill')
    >('barcode-detector/ponyfill');
    const wasm = await readFile(`public${zxingWasmPath}`);

    expect(createHash('sha256').update(wasm).digest('hex')).toBe(
      ZXING_WASM_SHA256,
    );
  });
});
