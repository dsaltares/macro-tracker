import type { BarcodeDetector, BarcodeFormat } from 'barcode-detector/ponyfill';

export type Detector = Pick<BarcodeDetector, 'detect'>;

type DetectorConstructor = typeof BarcodeDetector;

export const scannedFormats: BarcodeFormat[] = ['ean_8', 'ean_13', 'upc_a'];

export const zxingWasmPath = '/zxing/zxing_reader.wasm';

const nativeDetector = (): DetectorConstructor | null =>
  (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector ??
  null;

const supportsScannedFormats = async (Detector: DetectorConstructor) => {
  try {
    const supported = await Detector.getSupportedFormats();
    return scannedFormats.every((format) => supported.includes(format));
  } catch {
    return false;
  }
};

export const locateZXingFile = (path: string, prefix: string) =>
  path.endsWith('.wasm') ? zxingWasmPath : prefix + path;

const polyfilledDetector = async (): Promise<DetectorConstructor> => {
  const { BarcodeDetector, prepareZXingModule } = await import(
    'barcode-detector/ponyfill'
  );
  prepareZXingModule({ overrides: { locateFile: locateZXingFile } });
  return BarcodeDetector;
};

export const createBarcodeDetector = async (): Promise<Detector> => {
  const native = nativeDetector();
  const Detector =
    native !== null && (await supportsScannedFormats(native))
      ? native
      : await polyfilledDetector();
  return new Detector({ formats: scannedFormats });
};
