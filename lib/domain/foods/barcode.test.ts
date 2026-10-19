import { describe, expect, it } from 'vitest';
import { isValidBarcode, normaliseBarcode } from './barcode.ts';

describe('isValidBarcode', () => {
  it('accepts an EAN-13 whose check digit matches', () => {
    expect(isValidBarcode('3017620422003')).toBe(true);
    expect(isValidBarcode('8480000592569')).toBe(true);
  });

  it('accepts an EAN-8 whose check digit matches', () => {
    expect(isValidBarcode('96385074')).toBe(true);
  });

  it('accepts a check digit of zero', () => {
    expect(isValidBarcode('8712345678050')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidBarcode('3017620422004')).toBe(false);
    expect(isValidBarcode('96385075')).toBe(false);
  });

  it('rejects any other length', () => {
    expect(isValidBarcode('036000291452')).toBe(false);
    expect(isValidBarcode('03017620422003')).toBe(false);
    expect(isValidBarcode('')).toBe(false);
  });

  it('rejects anything but digits', () => {
    expect(isValidBarcode('301762042200X')).toBe(false);
    expect(isValidBarcode(' 3017620422003')).toBe(false);
  });
});

describe('normaliseBarcode', () => {
  it('keeps a valid EAN-13 or EAN-8 as it is', () => {
    expect(normaliseBarcode('3017620422003')).toBe('3017620422003');
    expect(normaliseBarcode('96385074')).toBe('96385074');
  });

  it('turns a UPC-A into an EAN-13 with a leading zero', () => {
    expect(normaliseBarcode('036000291452')).toBe('0036000291452');
  });

  it('trims surrounding whitespace', () => {
    expect(normaliseBarcode(' 3017620422003\n')).toBe('3017620422003');
  });

  it('is null for a code that is not a valid EAN once normalised', () => {
    expect(normaliseBarcode('036000291453')).toBeNull();
    expect(normaliseBarcode('12345')).toBeNull();
    expect(normaliseBarcode('03017620422003')).toBeNull();
    expect(normaliseBarcode('not a barcode')).toBeNull();
  });
});
