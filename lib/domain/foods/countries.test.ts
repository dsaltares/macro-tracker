import { describe, expect, it } from 'vitest';
import { europeanCountryTags, isSoldInEurope } from './countries.ts';

describe('isSoldInEurope', () => {
  it('accepts a product sold in a European country', () => {
    expect(isSoldInEurope(['en:spain'])).toBe(true);
    expect(isSoldInEurope(['en:united-kingdom'])).toBe(true);
    expect(isSoldInEurope(['en:switzerland'])).toBe(true);
  });

  it('accepts a product sold in Europe and elsewhere', () => {
    expect(isSoldInEurope(['en:united-states', 'en:france'])).toBe(true);
  });

  it('accepts a product tagged with the European Union as a whole', () => {
    expect(isSoldInEurope(['en:european-union'])).toBe(true);
  });

  it('rejects a product sold only outside Europe', () => {
    expect(isSoldInEurope(['en:united-states', 'en:argentina'])).toBe(false);
  });

  it('rejects a product tagged as sold worldwide but in no country', () => {
    expect(isSoldInEurope(['en:world'])).toBe(false);
  });

  it('rejects a product with no country', () => {
    expect(isSoldInEurope([])).toBe(false);
  });

  it('lists every tag once, in the canonical form Open Food Facts exports', () => {
    expect(new Set(europeanCountryTags).size).toBe(europeanCountryTags.length);
    for (const tag of europeanCountryTags) {
      expect(tag).toMatch(/^en:[a-z]+(-[a-z]+)*$/);
    }
  });
});
