import { hasReferenceFoods } from '../db/foods.ts';
import { type ImportFoodsOptions, importFoods } from './import-foods.ts';
import { createFixtureSource } from './sources/fixture.ts';

export const seedFoods = async (
  options: Omit<ImportFoodsOptions, 'sources'>,
) => {
  if (await hasReferenceFoods(options.db)) {
    return { seeded: false as const };
  }
  return {
    seeded: true as const,
    start: await importFoods({ ...options, sources: [createFixtureSource()] }),
  };
};
