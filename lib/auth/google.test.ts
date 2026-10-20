import { describe, expect, it } from 'vitest';
import { googleConfigured, googleOptions } from './google.ts';

const both = {
  GOOGLE_CLIENT_ID: 'google-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
};

describe('googleOptions', () => {
  it('configures Google when the environment names its client and secret', () => {
    expect(googleOptions(both)).toEqual({
      clientId: 'google-id',
      clientSecret: 'google-secret',
    });
    expect(googleConfigured(both)).toBe(true);
  });

  it('leaves Google out without a client id', () => {
    expect(googleOptions({ ...both, GOOGLE_CLIENT_ID: '' })).toBeUndefined();
    expect(googleConfigured({ ...both, GOOGLE_CLIENT_ID: '' })).toBe(false);
  });

  it('leaves Google out without a client secret', () => {
    expect(googleOptions({ GOOGLE_CLIENT_ID: 'google-id' })).toBeUndefined();
  });
});
