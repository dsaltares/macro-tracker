import { describe, expect, it } from 'vitest';
import { authBaseUrl, devBaseUrl, missingBaseUrlMessage } from './base-url.ts';

describe('authBaseUrl', () => {
  it('is the configured url wherever it runs', () => {
    expect(authBaseUrl('https://macros.example.test', true)).toBe(
      'https://macros.example.test',
    );
  });

  it('falls back to the dev server outside production', () => {
    expect(authBaseUrl(undefined, false)).toBe(devBaseUrl);
  });

  it('refuses to guess in production', () => {
    expect(() => authBaseUrl(undefined, true)).toThrow(missingBaseUrlMessage);
    expect(() => authBaseUrl('', true)).toThrow(missingBaseUrlMessage);
  });
});
