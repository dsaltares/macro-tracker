import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, prefixOf, toBase62 } from './keys.ts';

const bytes = (...values: number[]) => Uint8Array.from(values);

describe('toBase62', () => {
  it('writes the bytes as one big-endian number in 0-9, A-Z and a-z', () => {
    expect(toBase62(bytes(0, 61)).slice(-2)).toBe('0z');
    expect(toBase62(bytes(0, 62)).slice(-2)).toBe('10');
    expect(toBase62(bytes(1, 0)).slice(-2)).toBe('48');
  });

  it('pads every 32 bytes to the same 43 digits, zeros included', () => {
    expect(toBase62(new Uint8Array(32))).toBe('0'.repeat(43));
    expect(toBase62(new Uint8Array(32).fill(255))).toHaveLength(43);
  });
});

describe('generateApiKey', () => {
  it('is mt_ and 32 random bytes in base 62', () => {
    const asked: number[] = [];
    const key = generateApiKey((size) => {
      asked.push(size);
      return Buffer.alloc(size, 255);
    });

    expect(asked).toEqual([32]);
    expect(key).toMatch(/^mt_[0-9A-Za-z]{43}$/);
  });

  it('is a different key every time', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));

    expect(keys.size).toBe(100);
  });
});

describe('hashApiKey', () => {
  it('is the SHA-256 of the key, in hex', () => {
    expect(hashApiKey('mt_example')).toBe(
      createHash('sha256').update('mt_example').digest('hex'),
    );
  });
});

describe('prefixOf', () => {
  it('is the first eight characters of the key', () => {
    expect(prefixOf('mt_AbCdEfGhIjK')).toBe('mt_AbCdE');
  });
});
