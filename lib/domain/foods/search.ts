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
