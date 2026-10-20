import { describe, expect, it } from 'vitest';
import { legalDocuments } from './navigation.ts';

describe('legalDocuments', () => {
  it('lists the privacy policy, the terms and the cookie policy, in that order', () => {
    expect(legalDocuments).toEqual([
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms and conditions' },
      { href: '/cookies', label: 'Cookie policy' },
    ]);
  });
});
