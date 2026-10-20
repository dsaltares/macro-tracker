import { createHash, randomBytes } from 'node:crypto';

export const apiKeyMarker = 'mt_';

const apiKeyBytes = 32;
const base62Digits =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const base62Length = Math.ceil((apiKeyBytes * 8) / Math.log2(62));
const shownPrefixLength = 8;

export const toBase62 = (bytes: Uint8Array) => {
  let value = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let digits = '';
  while (value > 0n) {
    digits = base62Digits[Number(value % 62n)] + digits;
    value /= 62n;
  }
  return digits.padStart(base62Length, base62Digits[0]);
};

export const generateApiKey = (random = randomBytes) =>
  `${apiKeyMarker}${toBase62(random(apiKeyBytes))}`;

export const hashApiKey = (key: string) =>
  createHash('sha256').update(key).digest('hex');

export const prefixOf = (key: string) => key.slice(0, shownPrefixLength);
