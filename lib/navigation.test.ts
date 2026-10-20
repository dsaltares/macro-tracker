import { describe, expect, it } from 'vitest';
import { legalDocuments, settingsSections } from './navigation.ts';

describe('legalDocuments', () => {
  it('lists the privacy policy, the terms and the cookie policy, in that order', () => {
    expect(legalDocuments).toEqual([
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms and conditions' },
      { href: '/cookies', label: 'Cookie policy' },
    ]);
  });
});

describe('settingsSections', () => {
  it('lists every section in order, with every one but API keys live', () => {
    expect(settingsSections.map(({ label, href }) => [label, href])).toEqual([
      ['Profile', '/settings/profile'],
      ['Goals', '/settings/goals'],
      ['Food sources', '/settings/food-sources'],
      ['API keys', null],
      ['Export', '/settings/export'],
      ['Account', '/settings/account'],
    ]);
  });
});
