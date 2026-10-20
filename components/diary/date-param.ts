import { createParser } from 'nuqs';
import { isDate } from '@/lib/domain/dates';

export const dateParser = createParser({
  parse: (value) => (isDate(value) ? value : null),
  serialize: (date: string) => date,
});
