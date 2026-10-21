import { describe, expect, it } from 'vitest';
import {
  lowerCaseTerms,
  matchExpression,
  nameMatchesEveryTerm,
  searchPageSize,
  searchTerms,
} from './search.ts';

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

describe('lowerCaseTerms', () => {
  it('lower-cases every word of a query', () => {
    expect(lowerCaseTerms('Salted BUTTER, Jamón')).toEqual([
      'salted',
      'butter',
      'jamón',
    ]);
  });
});

describe('nameMatchesEveryTerm', () => {
  it('matches a name holding every word of the query, in any case and order', () => {
    expect(nameMatchesEveryTerm('Mum’s Chicken Curry', 'curry chicken')).toBe(
      true,
    );
  });

  it('matches a word inside another', () => {
    expect(nameMatchesEveryTerm('Overnight oats', 'oat')).toBe(true);
  });

  it('refuses a name missing one of the words', () => {
    expect(nameMatchesEveryTerm('Chicken curry', 'chicken soup')).toBe(false);
  });

  it('matches nothing for a query without words', () => {
    expect(nameMatchesEveryTerm('Chicken curry', ' - ')).toBe(false);
  });
});

describe('searchPageSize', () => {
  it('is thirty foods a page', () => {
    expect(searchPageSize).toBe(30);
  });
});
