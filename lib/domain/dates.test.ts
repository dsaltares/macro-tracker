import { describe, expect, it } from 'vitest';
import { localDateOf } from './dates.ts';

describe('localDateOf', () => {
  it('is the local calendar day, zero-padded', () => {
    expect(localDateOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
