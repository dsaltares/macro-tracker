import type { ReferenceSource } from '../../domain/foods/sources.ts';
import { createCiqualSource } from './ciqual/table.ts';
import { createOpenFoodFactsSource } from './open-food-facts/export.ts';
import type { FoodSource } from './types.ts';

export type SourceAdapters = Partial<Record<ReferenceSource, () => FoodSource>>;

export const sourceAdapters: SourceAdapters = {
  off: () => createOpenFoodFactsSource(),
  ciqual: () => createCiqualSource(),
};

export const registeredSources = (adapters: SourceAdapters = sourceAdapters) =>
  Object.values(adapters).flatMap((create) => (create ? [create()] : []));

export type SourceChoice =
  | { found: true; sources: FoodSource[] }
  | { found: false; unknown: string[] };

export type ChooseSourcesOptions = {
  ids?: readonly string[] | undefined;
  adapters?: SourceAdapters;
};

export const chooseSources = ({
  adapters = sourceAdapters,
  ids = Object.keys(adapters),
}: ChooseSourcesOptions = {}): SourceChoice => {
  const creators = ids.map((id) => ({
    id,
    create: Object.hasOwn(adapters, id)
      ? adapters[id as ReferenceSource]
      : undefined,
  }));
  const unknown = creators.filter(({ create }) => !create).map(({ id }) => id);
  if (unknown.length > 0) {
    return { found: false, unknown };
  }
  return {
    found: true,
    sources: creators.flatMap(({ create }) => (create ? [create()] : [])),
  };
};
