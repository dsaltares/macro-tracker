import { describe, expect, it } from 'vitest';
import { formatAmount, roundAmount } from './format.ts';

describe('roundAmount', () => {
  it('rounds kcal to an integer', () => {
    expect(roundAmount(123.5, 'kcal')).toBe(124);
    expect(roundAmount(123.4, 'kcal')).toBe(123);
  });

  it('rounds g to one decimal', () => {
    expect(roundAmount(12.34, 'g')).toBe(12.3);
    expect(roundAmount(12.35, 'g')).toBe(12.4);
    expect(roundAmount(0.04, 'g')).toBe(0);
  });

  it('rounds mg and µg to integers', () => {
    expect(roundAmount(2.5, 'mg')).toBe(3);
    expect(roundAmount(0.4, 'µg')).toBe(0);
  });

  it('never rounds to negative zero', () => {
    expect(Object.is(roundAmount(-0.4, 'mg'), 0)).toBe(true);
  });
});

describe('formatAmount', () => {
  it('writes the rounded amount and its unit', () => {
    expect(formatAmount(1234.6, 'kcal')).toBe('1,235 kcal');
    expect(formatAmount(12.34, 'g')).toBe('12.3 g');
    expect(formatAmount(560.2, 'mg')).toBe('560 mg');
    expect(formatAmount(1.7, 'µg')).toBe('2 µg');
  });

  it('drops a trailing zero decimal', () => {
    expect(formatAmount(12.04, 'g')).toBe('12 g');
  });
});
