export const searchPageSize = 30;

const term = /[\p{L}\p{M}\p{N}]+/gu;

export const searchTerms = (query: string) => query.match(term) ?? [];

export const matchExpression = (query: string): string | null => {
  const terms = searchTerms(query);
  if (terms.length === 0) {
    return null;
  }
  const last = terms.length - 1;
  return terms
    .map((word, index) => (index === last ? `"${word}"*` : `"${word}"`))
    .join(' ');
};

const lowerCase = (text: string) => text.toLocaleLowerCase('en');

export const lowerCaseTerms = (query: string) => searchTerms(lowerCase(query));

export const nameMatchesEveryTerm = (name: string, query: string) => {
  const terms = lowerCaseTerms(query);
  const words = lowerCase(name);
  return terms.length > 0 && terms.every((word) => words.includes(word));
};
