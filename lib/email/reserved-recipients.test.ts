import { describe, expect, it } from 'vitest';
import { isReservedRecipient } from './reserved-recipients.ts';

describe('isReservedRecipient', () => {
  it.each([
    'eater-6aac1ad8@example.test',
    'eater@example.com',
    'eater@example.net',
    'eater@example.org',
    'eater@something.example',
    'eater@nowhere.invalid',
    'eater@localhost',
    'eater@box.localhost',
    'EATER@EXAMPLE.TEST',
    '  eater@example.test  ',
  ])('holds back %s, which no real mailbox can receive', (address) => {
    expect(isReservedRecipient(address)).toBe(true);
  });

  it.each([
    'eater@macros.saltares.dev',
    'eater@gmail.com',
    'eater@example.testing.dev',
    'eater@testmail.dev',
    'player+test@saltares.dev',
  ])('lets %s through', (address) => {
    expect(isReservedRecipient(address)).toBe(false);
  });

  it('lets an address with no domain through, for the transport to reject', () => {
    expect(isReservedRecipient('not-an-address')).toBe(false);
  });
});
