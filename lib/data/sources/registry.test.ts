import { describe, expect, it } from 'vitest';
import { chooseSources, registeredSources } from './registry.ts';
import type { FoodSource } from './types.ts';

const adapter =
  (id: string): (() => FoodSource) =>
  () => ({
    id,
    emits: ['usda'],
    async *fetch() {},
  });

const adapters = { usda: adapter('usda'), cofid: adapter('cofid') };

const idsOf = (sources: readonly FoodSource[]) => sources.map(({ id }) => id);

describe('chooseSources', () => {
  it('chooses every registered adapter when no ids are named', () => {
    const chosen = chooseSources({ adapters });

    expect(chosen.found && idsOf(chosen.sources)).toEqual(['usda', 'cofid']);
  });

  it('chooses the named adapters in the order named', () => {
    const chosen = chooseSources({ ids: ['cofid', 'usda'], adapters });

    expect(chosen.found && idsOf(chosen.sources)).toEqual(['cofid', 'usda']);
  });

  it('names every id with no adapter', () => {
    expect(
      chooseSources({ ids: ['usda', 'off', 'toString'], adapters }),
    ).toEqual({ found: false, unknown: ['off', 'toString'] });
  });
});

describe('registeredSources', () => {
  it('creates every registered adapter', () => {
    expect(idsOf(registeredSources(adapters))).toEqual(['usda', 'cofid']);
  });
});
