import { createCiqualSource } from './ciqual/table.ts';
import { createOpenFoodFactsDeltasSource } from './open-food-facts/deltas.ts';
import { createOpenFoodFactsSource } from './open-food-facts/export.ts';
import type { FoodSource } from './types.ts';
import { createUsdaSource } from './usda/fooddata-central.ts';

export type SourceAdapters = Partial<Record<string, () => FoodSource>>;

export const sourceAdapters: SourceAdapters = {
  off: () => createOpenFoodFactsSource(),
  'off-deltas': () => createOpenFoodFactsDeltasSource(),
  ciqual: () => createCiqualSource(),
  usda: () => createUsdaSource(),
};

const createAll = (adapters: SourceAdapters) =>
  Object.values(adapters).flatMap((create) => (create ? [create()] : []));

export const registeredSources = (adapters: SourceAdapters = sourceAdapters) =>
  createAll(adapters).filter(({ kind }) => kind === 'full');

export const deltaSources = (adapters: SourceAdapters = sourceAdapters) =>
  createAll(adapters).filter(({ kind }) => kind === 'delta');

export type SourceChoice =
  | { found: true; sources: FoodSource[] }
  | { found: false; unknown: string[] };

export type ChooseSourcesOptions = {
  ids?: readonly string[] | undefined;
  adapters?: SourceAdapters;
};

export const chooseSources = ({
  adapters = sourceAdapters,
  ids,
}: ChooseSourcesOptions = {}): SourceChoice => {
  if (ids === undefined) {
    return { found: true, sources: registeredSources(adapters) };
  }
  const creators = ids.map((id) => ({
    id,
    create: Object.hasOwn(adapters, id) ? adapters[id] : undefined,
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
