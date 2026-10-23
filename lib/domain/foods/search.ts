export const searchPageSize = 30;

const term = /[\p{L}\p{M}\p{N}]+/gu;

export const searchTerms = (query: string) => query.match(term) ?? [];

const quoted = (words: readonly string[]) => `"${words.join(' ')}"`;

// A lone letter as a prefix matches most of the foods, and ranking them all takes seconds.
const isPrefix = (terms: readonly string[], word: string, index: number) =>
  index === terms.length - 1 && (terms.length > 1 || word.length > 1);

export const matchExpression = (query: string): string | null => {
  const terms = searchTerms(query);
  if (terms.length === 0) {
    return null;
  }
  return terms
    .map((word, index) =>
      isPrefix(terms, word, index) ? `${quoted([word])}*` : quoted([word]),
    )
    .join(' ');
};

export const nameStartsWithExpression = (terms: readonly string[]) =>
  `name : ^${quoted(terms)}`;

export const nameHoldsEveryWordExpression = (terms: readonly string[]) =>
  `name : (${terms.map((word) => quoted([word])).join(' ')})`;

const lowerCase = (text: string) => text.toLocaleLowerCase('en');

export const lowerCaseTerms = (query: string) => searchTerms(lowerCase(query));

export const nameMatchesEveryTerm = (name: string, query: string) => {
  const terms = lowerCaseTerms(query);
  const words = lowerCase(name);
  return terms.length > 0 && terms.every((word) => words.includes(word));
};
