import { describe, expect, it } from 'vitest';
import { matchExpression, searchPageSize, searchTerms } from './search.ts';

describe('searchTerms', () => {
  it('splits a query into its words', () => {
    expect(searchTerms('  dark chocolate ')).toEqual(['dark', 'chocolate']);
  });

  it('keeps accented letters and digits inside a word', () => {
    expect(searchTerms('Jamón 100%')).toEqual(['Jamón', '100']);
  });

  it('drops the punctuation FTS5 would read as syntax', () => {
    expect(searchTerms('"nutella" OR-(b*ready):')).toEqual([
      'nutella',
      'OR',
      'b',
      'ready',
    ]);
  });
});

describe('matchExpression', () => {
  it('quotes every word and matches the last one as a prefix', () => {
    expect(matchExpression('dark choc')).toBe('"dark" "choc"*');
  });

  it('matches a single word as a prefix', () => {
    expect(matchExpression('nutel')).toBe('"nutel"*');
  });

  it('matches nothing for a query without words', () => {
    expect(matchExpression('')).toBeNull();
    expect(matchExpression(' -*" ')).toBeNull();
  });
});

describe('searchPageSize', () => {
  it('is thirty foods a page', () => {
    expect(searchPageSize).toBe(30);
  });
});
